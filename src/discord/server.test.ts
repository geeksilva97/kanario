import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifySignature } from "./server.ts";

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
