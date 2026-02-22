import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { initDb, closeDb, saveCredentials, loadCredentials, deleteCredentials, getCredentialInfo } from "./store.ts";
import type { WPCredentials } from "./credentials.ts";

const fakeCreds: WPCredentials = {
  wpUrl: "https://blog.codeminer42.com",
  wpUsername: "testuser",
  wpAppPassword: "xxxx xxxx xxxx",
};

describe("credential store", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `kanario-test-${Date.now()}.db`);
    closeDb();
    initDb(dbPath);
  });

  afterEach(() => {
    closeDb();
    try { fs.unlinkSync(dbPath); } catch {}
  });

  it("saves and loads credentials", () => {
    saveCredentials("user123", fakeCreds);
    const loaded = loadCredentials("user123");
    assert.deepEqual(loaded, fakeCreds);
  });

  it("returns null for unknown user", () => {
    const loaded = loadCredentials("unknown");
    assert.equal(loaded, null);
  });

  it("upserts on save", () => {
    saveCredentials("user123", fakeCreds);
    const updated = { ...fakeCreds, wpUsername: "newuser" };
    saveCredentials("user123", updated);
    const loaded = loadCredentials("user123");
    assert.equal(loaded?.wpUsername, "newuser");
  });

  it("deletes credentials", () => {
    saveCredentials("user123", fakeCreds);
    const deleted = deleteCredentials("user123");
    assert.equal(deleted, true);
    assert.equal(loadCredentials("user123"), null);
  });

  it("returns false when deleting non-existent user", () => {
    const deleted = deleteCredentials("unknown");
    assert.equal(deleted, false);
  });

  it("getCredentialInfo returns URL and username without password", () => {
    saveCredentials("user123", fakeCreds);
    const info = getCredentialInfo("user123");
    assert.ok(info);
    assert.equal(info.wpUrl, fakeCreds.wpUrl);
    assert.equal(info.wpUsername, fakeCreds.wpUsername);
    assert.ok(info.registeredAt);
    assert.equal((info as any).wpAppPassword, undefined);
  });

  it("getCredentialInfo returns null for unknown user", () => {
    assert.equal(getCredentialInfo("unknown"), null);
  });
});
