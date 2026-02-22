import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import type { WPCredentials } from "./credentials.ts";

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || "";

const DB_PATH =
  process.env.NODE_ENV === "production"
    ? "/app/data/credentials.db"
    : "./data/credentials.db";

let db: DatabaseSync | null = null;

export function initDb(dbPath: string = DB_PATH): DatabaseSync {
  if (db) return db;

  db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      discord_user_id TEXT PRIMARY KEY,
      wp_url TEXT NOT NULL,
      wp_username TEXT NOT NULL,
      wp_app_password TEXT NOT NULL,
      registered_at TEXT NOT NULL
    )
  `);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function encrypt(plaintext: string): string {
  if (!ENCRYPTION_KEY) return plaintext;

  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decrypt(ciphertext: string): string {
  if (!ENCRYPTION_KEY) return ciphertext;

  const [ivB64, tagB64, dataB64] = ciphertext.split(":");
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export function saveCredentials(
  discordUserId: string,
  creds: WPCredentials,
): void {
  const database = initDb();
  const stmt = database.prepare(`
    INSERT INTO credentials (discord_user_id, wp_url, wp_username, wp_app_password, registered_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(discord_user_id) DO UPDATE SET
      wp_url = excluded.wp_url,
      wp_username = excluded.wp_username,
      wp_app_password = excluded.wp_app_password,
      registered_at = excluded.registered_at
  `);
  stmt.run(
    discordUserId,
    creds.wpUrl,
    creds.wpUsername,
    encrypt(creds.wpAppPassword),
    new Date().toISOString(),
  );
}

export function loadCredentials(
  discordUserId: string,
): WPCredentials | null {
  const database = initDb();
  const stmt = database.prepare(
    "SELECT wp_url, wp_username, wp_app_password FROM credentials WHERE discord_user_id = ?",
  );
  const row = stmt.get(discordUserId) as
    | { wp_url: string; wp_username: string; wp_app_password: string }
    | undefined;

  if (!row) return null;

  return {
    wpUrl: row.wp_url,
    wpUsername: row.wp_username,
    wpAppPassword: decrypt(row.wp_app_password),
  };
}

export function deleteCredentials(discordUserId: string): boolean {
  const database = initDb();
  const stmt = database.prepare(
    "DELETE FROM credentials WHERE discord_user_id = ?",
  );
  const result = stmt.run(discordUserId);
  return result.changes > 0;
}

export function getCredentialInfo(
  discordUserId: string,
): { wpUrl: string; wpUsername: string; registeredAt: string } | null {
  const database = initDb();
  const stmt = database.prepare(
    "SELECT wp_url, wp_username, registered_at FROM credentials WHERE discord_user_id = ?",
  );
  const row = stmt.get(discordUserId) as
    | { wp_url: string; wp_username: string; registered_at: string }
    | undefined;

  if (!row) return null;

  return {
    wpUrl: row.wp_url,
    wpUsername: row.wp_username,
    registeredAt: row.registered_at,
  };
}
