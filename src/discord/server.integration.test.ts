import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./server.ts";
import { config } from "../config.ts";
import type { CommandDeps } from "./command-deps.ts";
import type { HttpClient } from "../http.ts";
import { tick } from "../../test/helpers.ts";

// Ed25519 keypair shared across all tests
const testKeyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
const testRawPub = await crypto.subtle.exportKey("raw", testKeyPair.publicKey);
const testPubHex = Buffer.from(testRawPub).toString("hex");
Object.defineProperty(config, "discordPublicKey", { value: testPubHex });

async function signPayload(body: string, timestamp: string): Promise<string> {
  const message = new TextEncoder().encode(timestamp + body);
  const sig = await crypto.subtle.sign("Ed25519", testKeyPair.privateKey, message);
  return Buffer.from(sig).toString("hex");
}

async function postInteraction(app: Awaited<ReturnType<typeof buildApp>>, payload: unknown) {
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = await signPayload(body, timestamp);
  return app.inject({
    method: "POST",
    url: "/interactions",
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp,
    },
    payload: body,
  });
}

const fakeHttp: HttpClient = {
  baseUrl: "https://blog.example.com/wp-json/wp/v2",
  request: async () => new Response("{}"),
};

function makeDeps(overrides: Partial<CommandDeps> = {}): CommandDeps {
  const editCalls: [string, string][] = [];

  return {
    credentialStore: {
      load: () => null,
      save: () => {},
      delete: () => true,
      getInfo: () => null,
    },
    discord: {
      editOriginalMessage: async (token, content) => {
        editCalls.push([token, content]);
      },
    },
    wordpress: {
      resolvePostId: async () => "123",
      fetchDraft: async () => ({ title: "Test Post", content: "content", excerpt: "" }),
      validateCredentials: async () => ({ valid: true, displayName: "testuser" }),
    },
    workflows: {
      generate: async () => ({
        postTitle: "Test Post",
        prompts: [{ scene: "Scene 1", scene_description: "desc", mascot: "miner", background: "white", full_prompt: "prompt" }],
        imagePaths: ["/tmp/prompt-1.png"],
        outputDir: "/tmp",
      }),
      improve: async () => ({ imagePaths: ["/tmp/prompt-2.png"], outputDir: "/tmp" }),
      pick: async () => ({ mediaId: 42 }),
    },
    createWpClient: () => fakeHttp,
    resolveImagePath: () => "/tmp/prompt-1.png",
    outputDir: "/tmp/test-output",
    downloadImage: async () => ({ path: "/tmp/dl.png", cleanup: () => {} }),
    _editCalls: editCalls,
    ...overrides,
  } as CommandDeps & { _editCalls: [string, string][] };
}

function getEditCalls(deps: CommandDeps): [string, string][] {
  return (deps as CommandDeps & { _editCalls: [string, string][] })._editCalls;
}

function makeDepsWithCreds(overrides: Partial<CommandDeps> = {}): CommandDeps {
  const deps = makeDeps(overrides);
  deps.credentialStore.load = () => ({
    wpUrl: "https://blog.example.com",
    wpUsername: "user",
    wpAppPassword: "pass",
  });
  return deps;
}

describe("POST /interactions — HTTP layer", () => {
  it("returns 400 for unknown interaction type", async () => {
    const app = buildApp(makeDeps());
    const res = await postInteraction(app, { type: 99 });
    assert.equal(res.statusCode, 400);
  });
});

describe("POST /interactions — /help", () => {
  it("returns immediate CHANNEL_MESSAGE (type 4) with ephemeral flag", async () => {
    const app = buildApp(makeDeps());
    const res = await postInteraction(app, {
      type: 2,
      token: "tok",
      data: { name: "help", options: [] },
      member: { user: { id: "u1" } },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.type, 4);
    assert.equal(body.data.flags, 64);
  });
});

describe("POST /interactions — /register", () => {
  it("rejects in guild channel with immediate CHANNEL_MESSAGE", async () => {
    const app = buildApp(makeDeps());
    const res = await postInteraction(app, {
      type: 2,
      token: "tok",
      guild_id: "guild-1",
      data: {
        name: "register",
        options: [
          { name: "wp_url", value: "https://blog.example.com" },
          { name: "username", value: "user" },
          { name: "app_password", value: "pass" },
        ],
      },
      member: { user: { id: "u1" } },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.type, 4);
    assert.ok(body.data.content.includes("DM with me"));
  });

  it("returns deferred ephemeral in DM and edits with success after async handler", async () => {
    const deps = makeDeps();
    const app = buildApp(deps);
    const res = await postInteraction(app, {
      type: 2,
      token: "tok",
      data: {
        name: "register",
        options: [
          { name: "wp_url", value: "https://blog.example.com" },
          { name: "username", value: "testuser" },
          { name: "app_password", value: "xxxx" },
        ],
      },
      member: { user: { id: "u1" } },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.type, 5);
    assert.equal(body.data.flags, 64);

    await tick();

    const edits = getEditCalls(deps);
    assert.equal(edits.length, 1);
    assert.ok(edits[0][1].includes("Registered successfully"));
  });
});

describe("POST /interactions — /generate", () => {
  it("returns deferred response immediately", async () => {
    const app = buildApp(makeDepsWithCreds());
    const res = await postInteraction(app, {
      type: 2,
      token: "tok",
      data: { name: "generate", options: [{ name: "post_id", value: "456" }] },
      member: { user: { id: "u1" } },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).type, 5);
  });

  it("edits message with results after workflow completes", async () => {
    const deps = makeDepsWithCreds();
    const app = buildApp(deps);
    await postInteraction(app, {
      type: 2,
      token: "tok",
      data: { name: "generate", options: [{ name: "post_id", value: "456" }] },
      member: { user: { id: "u1" } },
    });

    await tick();

    const edits = getEditCalls(deps);
    const lastEdit = edits[edits.length - 1][1];
    assert.ok(lastEdit.includes("Test Post"));
    assert.ok(lastEdit.includes("Generated 1 images"));
  });

  it("edits message with error when no credentials", async () => {
    const deps = makeDeps();
    const app = buildApp(deps);
    await postInteraction(app, {
      type: 2,
      token: "tok",
      data: { name: "generate", options: [{ name: "post_id", value: "456" }] },
      member: { user: { id: "u1" } },
    });

    await tick();

    const edits = getEditCalls(deps);
    assert.ok(edits[0][1].includes("register your WordPress credentials"));
  });

  it("edits message with error when workflow throws", async () => {
    const deps = makeDepsWithCreds();
    deps.workflows.generate = async () => { throw new Error("RunPod timeout"); };
    const app = buildApp(deps);
    await postInteraction(app, {
      type: 2,
      token: "tok",
      data: { name: "generate", options: [{ name: "post_id", value: "456" }] },
      member: { user: { id: "u1" } },
    });

    await tick();

    const edits = getEditCalls(deps);
    const lastEdit = edits[edits.length - 1][1];
    assert.ok(lastEdit.includes("Generation failed"));
    assert.ok(lastEdit.includes("RunPod timeout"));
  });
});

describe("POST /interactions — /pick", () => {
  it("returns deferred response immediately", async () => {
    const app = buildApp(makeDepsWithCreds());
    const res = await postInteraction(app, {
      type: 2,
      token: "tok",
      data: { name: "pick", options: [{ name: "post_id", value: "456" }, { name: "image", value: "1" }] },
      member: { user: { id: "u1" } },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).type, 5);
  });

  it("edits message with media ID after workflow completes", async () => {
    const deps = makeDepsWithCreds();
    const app = buildApp(deps);
    await postInteraction(app, {
      type: 2,
      token: "tok",
      data: { name: "pick", options: [{ name: "post_id", value: "456" }, { name: "image", value: "1" }] },
      member: { user: { id: "u1" } },
    });

    await tick();

    const edits = getEditCalls(deps);
    const lastEdit = edits[edits.length - 1][1];
    assert.ok(lastEdit.includes("Featured image set"));
    assert.ok(lastEdit.includes("Media ID: 42"));
  });
});

describe("POST /interactions — /improve", () => {
  it("returns deferred response immediately", async () => {
    const app = buildApp(makeDeps());
    const res = await postInteraction(app, {
      type: 2,
      token: "tok",
      data: {
        name: "improve",
        options: [
          { name: "post_id", value: "456" },
          { name: "image", value: "1" },
          { name: "prompt", value: "make it darker" },
        ],
      },
      member: { user: { id: "u1" } },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).type, 5);
  });

  it("edits message with result after workflow completes", async () => {
    const deps = makeDeps();
    const app = buildApp(deps);
    await postInteraction(app, {
      type: 2,
      token: "tok",
      data: {
        name: "improve",
        options: [
          { name: "post_id", value: "456" },
          { name: "image", value: "1" },
          { name: "prompt", value: "make it darker" },
        ],
      },
      member: { user: { id: "u1" } },
    });

    await tick();

    const edits = getEditCalls(deps);
    const lastEdit = edits[edits.length - 1][1];
    assert.ok(lastEdit.includes("Improved image"));
    assert.ok(lastEdit.includes("make it darker"));
  });
});
