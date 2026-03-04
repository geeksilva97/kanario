import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { WPCredentials } from "./credentials.ts";

const DEFAULT_DB_PATH =
  process.env.NODE_ENV === "production"
    ? "/app/data/credentials.db"
    : "./data/credentials.db";

function getEncryptionKey(): string {
  return process.env.CREDENTIAL_ENCRYPTION_KEY || "";
}

function encrypt(plaintext: string, encryptionKey: string): string {
  if (!encryptionKey) return plaintext;

  const key = Buffer.from(encryptionKey, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decrypt(ciphertext: string, encryptionKey: string): string {
  if (!encryptionKey) return ciphertext;

  const [ivB64, tagB64, dataB64] = ciphertext.split(":");
  const key = Buffer.from(encryptionKey, "hex");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export interface CredentialStore {
  load(userId: string): WPCredentials | null;
  save(userId: string, creds: WPCredentials): void;
  delete(userId: string): boolean;
  getInfo(userId: string): { wpUrl: string; wpUsername: string; registeredAt: string } | null;
  close(): void;
}

export function createCredentialStore(dbPath: string = DEFAULT_DB_PATH): CredentialStore {
  // Ensure directory exists for file-based databases
  if (dbPath !== ":memory:") {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  const db = new DatabaseSync(dbPath);
  const encryptionKey = getEncryptionKey();

  db.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      discord_user_id TEXT PRIMARY KEY,
      wp_url TEXT NOT NULL,
      wp_username TEXT NOT NULL,
      wp_app_password TEXT NOT NULL,
      registered_at TEXT NOT NULL
    )
  `);

  return {
    load(userId: string): WPCredentials | null {
      const stmt = db.prepare(
        "SELECT wp_url, wp_username, wp_app_password FROM credentials WHERE discord_user_id = ?",
      );
      const row = stmt.get(userId) as
        | { wp_url: string; wp_username: string; wp_app_password: string }
        | undefined;

      if (!row) return null;

      return {
        wpUrl: row.wp_url,
        wpUsername: row.wp_username,
        wpAppPassword: decrypt(row.wp_app_password, encryptionKey),
      };
    },

    save(userId: string, creds: WPCredentials): void {
      const stmt = db.prepare(`
        INSERT INTO credentials (discord_user_id, wp_url, wp_username, wp_app_password, registered_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(discord_user_id) DO UPDATE SET
          wp_url = excluded.wp_url,
          wp_username = excluded.wp_username,
          wp_app_password = excluded.wp_app_password,
          registered_at = excluded.registered_at
      `);
      stmt.run(
        userId,
        creds.wpUrl,
        creds.wpUsername,
        encrypt(creds.wpAppPassword, encryptionKey),
        new Date().toISOString(),
      );
    },

    delete(userId: string): boolean {
      const stmt = db.prepare("DELETE FROM credentials WHERE discord_user_id = ?");
      const result = stmt.run(userId);
      return result.changes > 0;
    },

    getInfo(userId: string): { wpUrl: string; wpUsername: string; registeredAt: string } | null {
      const stmt = db.prepare(
        "SELECT wp_url, wp_username, registered_at FROM credentials WHERE discord_user_id = ?",
      );
      const row = stmt.get(userId) as
        | { wp_url: string; wp_username: string; registered_at: string }
        | undefined;

      if (!row) return null;

      return {
        wpUrl: row.wp_url,
        wpUsername: row.wp_username,
        registeredAt: row.registered_at,
      };
    },

    close(): void {
      db.close();
    },
  };
}