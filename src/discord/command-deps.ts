import type { HttpClient } from "../http.ts";
import type { WPCredentials } from "../credentials.ts";
import type { GenerateOptions, GenerateResult } from "../workflows/generate.ts";
import type { ImproveOptions, ImproveResult } from "../workflows/improve.ts";
import type { PickOptions, PickResult } from "../workflows/pick.ts";

export interface CredentialStore {
  load(userId: string): WPCredentials | null;
  save(userId: string, creds: WPCredentials): void;
  delete(userId: string): boolean;
  getInfo(userId: string): { wpUrl: string; wpUsername: string; registeredAt: string } | null;
}

export interface DiscordMessenger {
  editOriginalMessage(token: string, content: string, files?: { name: string; path: string }[]): Promise<void>;
}

export interface WordPressClient {
  resolvePostId(http: HttpClient, raw: string): Promise<string>;
  fetchDraft(http: HttpClient, postId: string): Promise<{ title: string; content: string; excerpt: string }>;
  validateCredentials(creds: WPCredentials): Promise<{ valid: boolean; displayName?: string; error?: string }>;
}

export interface Workflows {
  generate(opts: GenerateOptions, onProgress?: (msg: string) => void): Promise<GenerateResult>;
  improve(opts: ImproveOptions, onProgress?: (msg: string) => void): Promise<ImproveResult>;
  pick(opts: PickOptions): Promise<PickResult>;
}

export interface CommandDeps {
  credentialStore: CredentialStore;
  discord: DiscordMessenger;
  wordpress: WordPressClient;
  workflows: Workflows;
  createWpClient(creds: WPCredentials): HttpClient;
  resolveImagePath(postId: string, imageArg: string): string;
  outputDir: string;
  downloadImage(url: string): Promise<{ path: string; cleanup: () => void }>;
}
