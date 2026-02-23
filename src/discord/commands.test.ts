import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeCommandHandler, COMMAND_DEFINITIONS, HELP_TEXT } from "./commands.ts";
import type { CommandDeps } from "./command-deps.ts";
import type { HttpClient } from "../http.ts";

const fakeHttp: HttpClient = {
  baseUrl: "https://blog.example.com/wp-json/wp/v2",
  request: async () => new Response("{}"),
};

function makeMockDeps(): CommandDeps & { _calls: Record<string, any[][]> } {
  const calls: Record<string, any[][]> = {};

  function track(name: string, impl: (...args: any[]) => any) {
    calls[name] = [];
    return (...args: any[]) => {
      calls[name].push(args);
      return impl(...args);
    };
  }

  return {
    _calls: calls,
    credentialStore: {
      load: track("credentialStore.load", () => null),
      save: track("credentialStore.save", () => {}),
      delete: track("credentialStore.delete", () => true),
      getInfo: track("credentialStore.getInfo", () => null),
    },
    discord: {
      editOriginalMessage: track("discord.editOriginalMessage", async () => {}),
    },
    wordpress: {
      resolvePostId: track("wordpress.resolvePostId", async () => "123"),
      fetchDraft: track("wordpress.fetchDraft", async () => ({ title: "Test Post", content: "content", excerpt: "" })),
      validateCredentials: track("wordpress.validateCredentials", async () => ({ valid: true, displayName: "testuser" })),
    },
    workflows: {
      generate: track("workflows.generate", async () => ({
        postTitle: "Test Post",
        prompts: [{ scene: "Scene 1", scene_description: "A test scene", mascot: "miner", background: "white", full_prompt: "test" }],
        imagePaths: ["/tmp/prompt-1.png"],
        outputDir: "/tmp/output",
      })),
      improve: track("workflows.improve", async () => ({
        imagePaths: ["/tmp/prompt-6.png", "/tmp/prompt-7.png"],
        outputDir: "/tmp/output",
      })),
      pick: track("workflows.pick", async () => ({ mediaId: 42 })),
    },
    createWpClient: track("createWpClient", () => fakeHttp),
    resolveImagePath: track("resolveImagePath", () => "/tmp/prompt-1.png"),
    outputDir: "/tmp/test-output",
    downloadImage: track("downloadImage", async () => ({ path: "/tmp/dl.png", cleanup: () => {} })),
  };
}

function makeInteraction(command: string, options: Record<string, string> = {}, overrides: Record<string, any> = {}) {
  return {
    type: 2,
    token: "test-token",
    member: { user: { id: "user-123" } },
    data: {
      name: command,
      options: Object.entries(options).map(([name, value]) => ({ name, value })),
    },
    ...overrides,
  };
}

// Helper to wait for fire-and-forget async handlers to settle
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe("COMMAND_DEFINITIONS", () => {
  it("exports 7 slash commands", () => {
    assert.equal(COMMAND_DEFINITIONS.length, 7);
    const names = COMMAND_DEFINITIONS.map((c) => c.name);
    assert.deepEqual(names, ["generate", "pick", "improve", "register", "unregister", "whoami", "help"]);
  });
});

describe("HELP_TEXT", () => {
  it("contains key command names", () => {
    assert.ok(HELP_TEXT.includes("/register"));
    assert.ok(HELP_TEXT.includes("/generate"));
    assert.ok(HELP_TEXT.includes("/pick"));
  });
});

describe("/help", () => {
  it("returns immediate CHANNEL_MESSAGE with HELP_TEXT", () => {
    const deps = makeMockDeps();
    const { handleInteraction } = makeCommandHandler(deps);

    const result = handleInteraction(makeInteraction("help")) as any;

    assert.equal(result.type, 4); // CHANNEL_MESSAGE
    assert.equal(result.data.content, HELP_TEXT);
    assert.equal(result.data.flags, 64); // EPHEMERAL
  });
});

describe("/register", () => {
  it("rejects in guild channel with immediate response", () => {
    const deps = makeMockDeps();
    const { handleInteraction } = makeCommandHandler(deps);

    const interaction = makeInteraction(
      "register",
      { wp_url: "https://blog.example.com", username: "user", app_password: "pass" },
      { guild_id: "guild-1" },
    );

    const result = handleInteraction(interaction) as any;

    assert.equal(result.type, 4); // CHANNEL_MESSAGE
    assert.ok(result.data.content.includes("DM with me"));
    assert.equal(result.data.flags, 64); // EPHEMERAL
  });

  it("defers in DM and validates + saves credentials", async () => {
    const deps = makeMockDeps();
    const { handleInteraction } = makeCommandHandler(deps);

    const interaction = makeInteraction("register", {
      wp_url: "https://blog.example.com/",
      username: "testuser",
      app_password: "xxxx",
    });

    const result = handleInteraction(interaction) as any;
    assert.equal(result.type, 5); // DEFERRED_CHANNEL_MESSAGE
    assert.equal(result.data.flags, 64); // EPHEMERAL

    await tick();

    assert.equal(deps._calls["wordpress.validateCredentials"].length, 1);
    const [creds] = deps._calls["wordpress.validateCredentials"][0];
    assert.equal(creds.wpUrl, "https://blog.example.com"); // trailing slash stripped
    assert.equal(creds.wpUsername, "testuser");

    assert.equal(deps._calls["credentialStore.save"].length, 1);
    assert.equal(deps._calls["credentialStore.save"][0][0], "user-123");

    assert.equal(deps._calls["discord.editOriginalMessage"].length, 1);
    const [, msg] = deps._calls["discord.editOriginalMessage"][0];
    assert.ok(msg.includes("Registered successfully"));
    assert.ok(msg.includes("testuser"));
  });

  it("reports validation failure", async () => {
    const deps = makeMockDeps();
    deps.wordpress.validateCredentials = async () => ({ valid: false, error: "401 Unauthorized" });
    const { handleInteraction } = makeCommandHandler(deps);

    const interaction = makeInteraction("register", {
      wp_url: "https://blog.example.com",
      username: "bad",
      app_password: "wrong",
    });

    handleInteraction(interaction);
    await tick();

    const [, msg] = deps._calls["discord.editOriginalMessage"][0];
    assert.ok(msg.includes("WordPress authentication failed"));
    assert.ok(msg.includes("401 Unauthorized"));
  });

  it("reports missing fields", async () => {
    const deps = makeMockDeps();
    const { handleInteraction } = makeCommandHandler(deps);

    const interaction = makeInteraction("register", { wp_url: "https://blog.example.com" });

    handleInteraction(interaction);
    await tick();

    const [, msg] = deps._calls["discord.editOriginalMessage"][0];
    assert.ok(msg.includes("All fields are required"));
  });
});

describe("/unregister", () => {
  it("defers and deletes credentials", async () => {
    const deps = makeMockDeps();
    const { handleInteraction } = makeCommandHandler(deps);

    const result = handleInteraction(makeInteraction("unregister"));
    assert.equal(result.type, 5); // DEFERRED_CHANNEL_MESSAGE

    await tick();

    assert.equal(deps._calls["credentialStore.delete"].length, 1);
    assert.equal(deps._calls["credentialStore.delete"][0][0], "user-123");

    const [, msg] = deps._calls["discord.editOriginalMessage"][0];
    assert.ok(msg.includes("credentials have been removed"));
  });

  it("reports when no credentials found", async () => {
    const deps = makeMockDeps();
    deps.credentialStore.delete = (...args: any[]) => {
      deps._calls["credentialStore.delete"].push(args);
      return false;
    };
    const { handleInteraction } = makeCommandHandler(deps);

    handleInteraction(makeInteraction("unregister"));
    await tick();

    const [, msg] = deps._calls["discord.editOriginalMessage"][0];
    assert.ok(msg.includes("No credentials found"));
  });
});

describe("/whoami", () => {
  it("shows credentials when registered", async () => {
    const deps = makeMockDeps();
    deps.credentialStore.getInfo = (...args: any[]) => {
      deps._calls["credentialStore.getInfo"].push(args);
      return { wpUrl: "https://blog.example.com", wpUsername: "testuser", registeredAt: "2025-01-01T00:00:00Z" };
    };
    const { handleInteraction } = makeCommandHandler(deps);

    const result = handleInteraction(makeInteraction("whoami"));
    assert.equal(result.type, 5);

    await tick();

    const [, msg] = deps._calls["discord.editOriginalMessage"][0];
    assert.ok(msg.includes("blog.example.com"));
    assert.ok(msg.includes("testuser"));
    assert.ok(msg.includes("2025-01-01"));
  });

  it("reports not registered", async () => {
    const deps = makeMockDeps();
    const { handleInteraction } = makeCommandHandler(deps);

    handleInteraction(makeInteraction("whoami"));
    await tick();

    const [, msg] = deps._calls["discord.editOriginalMessage"][0];
    assert.ok(msg.includes("haven't registered"));
  });
});

describe("/generate", () => {
  it("requires credentials", async () => {
    const deps = makeMockDeps();
    const { handleInteraction } = makeCommandHandler(deps);

    const interaction = makeInteraction("generate", { post_id: "123" });
    const result = handleInteraction(interaction);
    assert.equal(result.type, 5);

    await tick();

    const [, msg] = deps._calls["discord.editOriginalMessage"][0];
    assert.ok(msg.includes("register your WordPress credentials"));
  });

  it("generates thumbnails on happy path", async () => {
    const deps = makeMockDeps();
    deps.credentialStore.load = (...args: any[]) => {
      deps._calls["credentialStore.load"].push(args);
      return { wpUrl: "https://blog.example.com", wpUsername: "user", wpAppPassword: "pass" };
    };
    const { handleInteraction } = makeCommandHandler(deps);

    const interaction = makeInteraction("generate", { post_id: "456", model: "gemini", image_model: "qwen" });
    handleInteraction(interaction);
    await tick();

    assert.equal(deps._calls["createWpClient"].length, 1);
    assert.equal(deps._calls["wordpress.resolvePostId"].length, 1);
    assert.equal(deps._calls["workflows.generate"].length, 1);

    const editCalls = deps._calls["discord.editOriginalMessage"];
    const lastCall = editCalls[editCalls.length - 1];
    assert.ok(lastCall[1].includes("Test Post"));
    assert.ok(lastCall[1].includes("Generated 1 images"));
  });

  it("reports generation failure", async () => {
    const deps = makeMockDeps();
    deps.credentialStore.load = (...args: any[]) => {
      deps._calls["credentialStore.load"].push(args);
      return { wpUrl: "https://blog.example.com", wpUsername: "user", wpAppPassword: "pass" };
    };
    deps.workflows.generate = async () => { throw new Error("RunPod timeout"); };
    const { handleInteraction } = makeCommandHandler(deps);

    handleInteraction(makeInteraction("generate", { post_id: "456" }));
    await tick();

    const editCalls = deps._calls["discord.editOriginalMessage"];
    const lastCall = editCalls[editCalls.length - 1];
    assert.ok(lastCall[1].includes("Generation failed"));
    assert.ok(lastCall[1].includes("RunPod timeout"));
  });
});

describe("/pick", () => {
  it("requires credentials", async () => {
    const deps = makeMockDeps();
    const { handleInteraction } = makeCommandHandler(deps);

    handleInteraction(makeInteraction("pick", { post_id: "123", image: "2" }));
    await tick();

    const [, msg] = deps._calls["discord.editOriginalMessage"][0];
    assert.ok(msg.includes("register your WordPress credentials"));
  });

  it("picks image on happy path", async () => {
    const deps = makeMockDeps();
    deps.credentialStore.load = (...args: any[]) => {
      deps._calls["credentialStore.load"].push(args);
      return { wpUrl: "https://blog.example.com", wpUsername: "user", wpAppPassword: "pass" };
    };
    const { handleInteraction } = makeCommandHandler(deps);

    handleInteraction(makeInteraction("pick", { post_id: "456", image: "2" }));
    await tick();

    assert.equal(deps._calls["createWpClient"].length, 1);
    assert.equal(deps._calls["wordpress.resolvePostId"].length, 1);
    assert.equal(deps._calls["wordpress.fetchDraft"].length, 1);
    assert.equal(deps._calls["workflows.pick"].length, 1);
    assert.equal(deps._calls["resolveImagePath"].length, 1);

    const editCalls = deps._calls["discord.editOriginalMessage"];
    const lastCall = editCalls[editCalls.length - 1];
    assert.ok(lastCall[1].includes("Featured image set"));
    assert.ok(lastCall[1].includes("Media ID: 42"));
  });

  it("reports pick failure", async () => {
    const deps = makeMockDeps();
    deps.credentialStore.load = (...args: any[]) => {
      deps._calls["credentialStore.load"].push(args);
      return { wpUrl: "https://blog.example.com", wpUsername: "user", wpAppPassword: "pass" };
    };
    deps.workflows.pick = async () => { throw new Error("Upload failed"); };
    const { handleInteraction } = makeCommandHandler(deps);

    handleInteraction(makeInteraction("pick", { post_id: "456", image: "2" }));
    await tick();

    const editCalls = deps._calls["discord.editOriginalMessage"];
    const lastCall = editCalls[editCalls.length - 1];
    assert.ok(lastCall[1].includes("Pick failed"));
    assert.ok(lastCall[1].includes("Upload failed"));
  });
});

describe("/improve", () => {
  it("improves with image number", async () => {
    const deps = makeMockDeps();
    const { handleInteraction } = makeCommandHandler(deps);

    handleInteraction(makeInteraction("improve", { post_id: "456", image: "2", prompt: "make it darker" }));
    await tick();

    assert.equal(deps._calls["resolveImagePath"].length, 1);
    assert.equal(deps._calls["resolveImagePath"][0][0], "456");
    assert.equal(deps._calls["resolveImagePath"][0][1], "2");
    assert.equal(deps._calls["workflows.improve"].length, 1);

    const editCalls = deps._calls["discord.editOriginalMessage"];
    const lastCall = editCalls[editCalls.length - 1];
    assert.ok(lastCall[1].includes("Improved image"));
    assert.ok(lastCall[1].includes("make it darker"));
  });

  it("downloads image from URL", async () => {
    const deps = makeMockDeps();
    const { handleInteraction } = makeCommandHandler(deps);

    handleInteraction(makeInteraction("improve", {
      post_id: "456",
      image: "https://example.com/image.png",
      prompt: "add more color",
    }));
    await tick();

    assert.equal(deps._calls["downloadImage"].length, 1);
    assert.equal(deps._calls["downloadImage"][0][0], "https://example.com/image.png");
    assert.equal(deps._calls["resolveImagePath"].length, 0);
    assert.equal(deps._calls["workflows.improve"].length, 1);
  });

  it("calls cleanup after download", async () => {
    let cleanupCalled = false;
    const deps = makeMockDeps();
    deps.downloadImage = async () => ({
      path: "/tmp/dl.png",
      cleanup: () => { cleanupCalled = true; },
    });
    const { handleInteraction } = makeCommandHandler(deps);

    handleInteraction(makeInteraction("improve", {
      post_id: "456",
      image: "https://example.com/image.png",
      prompt: "tweak",
    }));
    await tick();

    assert.ok(cleanupCalled);
  });

  it("reports improve failure", async () => {
    const deps = makeMockDeps();
    deps.workflows.improve = async () => { throw new Error("Backend error"); };
    const { handleInteraction } = makeCommandHandler(deps);

    handleInteraction(makeInteraction("improve", { post_id: "456", image: "2", prompt: "fix" }));
    await tick();

    const editCalls = deps._calls["discord.editOriginalMessage"];
    const lastCall = editCalls[editCalls.length - 1];
    assert.ok(lastCall[1].includes("Improve failed"));
    assert.ok(lastCall[1].includes("Backend error"));
  });

  it("calls cleanup even on failure when URL was downloaded", async () => {
    let cleanupCalled = false;
    const deps = makeMockDeps();
    deps.downloadImage = async () => ({
      path: "/tmp/dl.png",
      cleanup: () => { cleanupCalled = true; },
    });
    deps.workflows.improve = async () => { throw new Error("fail"); };
    const { handleInteraction } = makeCommandHandler(deps);

    handleInteraction(makeInteraction("improve", {
      post_id: "456",
      image: "https://example.com/image.png",
      prompt: "tweak",
    }));
    await tick();

    assert.ok(cleanupCalled);
  });
});
