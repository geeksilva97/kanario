import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateWPCredentials, credentialsFromEnv, createWpClient } from "./credentials.ts";
import { config } from "./config.ts";
import type { WPCredentials } from "./credentials.ts";

const fakeCreds: WPCredentials = {
  wpUrl: "https://example.com",
  wpUsername: "testuser",
  wpAppPassword: "xxxx xxxx xxxx",
};

describe("validateWPCredentials", () => {
  it("returns valid with displayName on 200 response", async (t) => {
    t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response(JSON.stringify({ name: "Editor User" }), { status: 200 })),
    );

    const result = await validateWPCredentials(fakeCreds);
    assert.equal(result.valid, true);
    assert.equal(result.displayName, "Editor User");
  });

  it("returns invalid on 401 response", async (t) => {
    t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })),
    );

    const result = await validateWPCredentials(fakeCreds);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("401"));
  });

  it("returns invalid on network error", async (t) => {
    t.mock.method(globalThis, "fetch", () =>
      Promise.reject(new Error("fetch failed")),
    );

    const result = await validateWPCredentials(fakeCreds);
    assert.equal(result.valid, false);
    assert.equal(result.error, "fetch failed");
  });
});

describe("createWpClient", () => {
  it("creates an HttpClient with correct baseUrl", () => {
    const http = createWpClient(fakeCreds);
    assert.equal(http.baseUrl, "https://example.com/wp-json/wp/v2");
  });
});

describe("credentialsFromEnv", () => {
  it("returns a WPCredentials object from config", () => {
    const creds = credentialsFromEnv();
    assert.equal(typeof creds.wpUrl, "string");
    assert.equal(typeof creds.wpUsername, "string");
    assert.equal(typeof creds.wpAppPassword, "string");
    assert.equal(creds.wpUrl, config.wpUrl);
  });
});
