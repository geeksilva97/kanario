import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifySignature, buildApp } from "./server.ts";
import { config } from "../config.ts";

// Generate Ed25519 keypair and override config for Fastify app tests
const testKeyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
const testRawPub = await crypto.subtle.exportKey("raw", testKeyPair.publicKey);
const testPubHex = Buffer.from(testRawPub).toString("hex");
// Override readonly config for test — Object.defineProperty bypasses TS readonly at runtime
Object.defineProperty(config, "discordPublicKey", { value: testPubHex });

async function signPayload(body: string, timestamp: string): Promise<string> {
  const message = new TextEncoder().encode(timestamp + body);
  const sig = await crypto.subtle.sign("Ed25519", testKeyPair.privateKey, message);
  return Buffer.from(sig).toString("hex");
}

describe("Ed25519 signature verification", () => {
  async function generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const rawPub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const pubHex = Buffer.from(rawPub).toString("hex");
    return { keyPair, pubHex };
  }

  it("rejects an invalid signature", async () => {
    const { pubHex } = await generateKeyPair();
    const badSig = "00".repeat(64);
    const result = await verifySignature("body", badSig, "1234567890", pubHex);
    assert.equal(result, false);
  });

  it("accepts a valid signature", async () => {
    const { keyPair, pubHex } = await generateKeyPair();
    const timestamp = "1234567890";
    const body = '{"type":1}';
    const message = new TextEncoder().encode(timestamp + body);
    const sig = await crypto.subtle.sign("Ed25519", keyPair.privateKey, message);
    const sigHex = Buffer.from(sig).toString("hex");

    const result = await verifySignature(body, sigHex, timestamp, pubHex);
    assert.equal(result, true);
  });
});

describe("Fastify app", () => {
  it("GET /health returns 200 with status ok", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { status: "ok" });
  });

  it("POST /interactions without signature headers returns 401", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/interactions",
      headers: { "content-type": "application/json" },
      payload: '{"type":1}',
    });
    assert.equal(res.statusCode, 401);
  });

  it("POST /interactions with invalid signature returns 401", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/interactions",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": "00".repeat(64),
        "x-signature-timestamp": "1234567890",
      },
      payload: '{"type":1}',
    });
    assert.equal(res.statusCode, 401);
  });

  it("POST /interactions with valid PING returns PONG", async () => {
    const app = buildApp();
    const body = '{"type":1}';
    const timestamp = "1234567890";
    const signature = await signPayload(body, timestamp);

    const res = await app.inject({
      method: "POST",
      url: "/interactions",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": signature,
        "x-signature-timestamp": timestamp,
      },
      payload: body,
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { type: 1 });
  });
});
