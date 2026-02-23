import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { initDb, closeDb, saveCredentials, loadCredentials, deleteCredentials, getCredentialInfo } from "./store.ts";
import type { WPCredentials } from "./credentials.ts";

const fakeCreds: WPCredentials = {
  wpUrl: "https://blog.codeminer42.com",
  wpUsername: "testuser",
  wpAppPassword: "xxxx xxxx xxxx",
};

describe("credential store", () => {
  beforeEach(() => {
    closeDb();
    initDb(":memory:");
  });

  afterEach(() => {
    closeDb();
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
    assert.ok(!("wpAppPassword" in info));
  });

  it("getCredentialInfo returns null for unknown user", () => {
    assert.equal(getCredentialInfo("unknown"), null);
  });
});

// Encryption tests need a file-based DB so a second connection can read raw values
describe("credential store (encryption)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `kanario-test-${Date.now()}.db`);
    closeDb();
    initDb(dbPath);
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(dbPath, { force: true });
  });

  it("encrypts password in DB and decrypts on load", () => {
    saveCredentials("user123", fakeCreds);

    const rawDb = new DatabaseSync(dbPath);
    const row = rawDb.prepare("SELECT wp_app_password FROM credentials WHERE discord_user_id = 'user123'").get();
    rawDb.close();

    assert.ok(row && typeof row === "object" && "wp_app_password" in row);
    assert.notEqual(row.wp_app_password, fakeCreds.wpAppPassword);
    assert.ok(String(row.wp_app_password).includes(":"), "encrypted format should be iv:tag:data");

    const loaded = loadCredentials("user123");
    assert.equal(loaded?.wpAppPassword, fakeCreds.wpAppPassword);
  });

  it("produces different ciphertext for the same password (random IV)", () => {
    saveCredentials("user-a", fakeCreds);
    saveCredentials("user-b", fakeCreds);

    const rawDb = new DatabaseSync(dbPath);
    const rowA = rawDb.prepare("SELECT wp_app_password FROM credentials WHERE discord_user_id = 'user-a'").get();
    const rowB = rawDb.prepare("SELECT wp_app_password FROM credentials WHERE discord_user_id = 'user-b'").get();
    rawDb.close();

    assert.ok(rowA && typeof rowA === "object" && "wp_app_password" in rowA);
    assert.ok(rowB && typeof rowB === "object" && "wp_app_password" in rowB);
    assert.notEqual(rowA.wp_app_password, rowB.wp_app_password);
  });
});
