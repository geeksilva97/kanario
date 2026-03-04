import { config, HTTP_TIMEOUT_MS } from "./config.ts";
import { createHttpClient, type HttpClient } from "./http.ts";
import { HttpError } from "./errors/index.ts";

export interface WPCredentials {
  wpUrl: string;
  wpUsername: string;
  wpAppPassword: string;
}

export interface ValidationResult {
  valid: boolean;
  displayName?: string;
  error?: string;
}

export function createWpClient(creds: WPCredentials): HttpClient {
  const auth = Buffer.from(`${creds.wpUsername}:${creds.wpAppPassword}`).toString("base64");
  return createHttpClient({
    baseUrl: `${creds.wpUrl}/wp-json/wp/v2`,
    headers: { Authorization: `Basic ${auth}` },
    timeout: HTTP_TIMEOUT_MS,
  });
}

export async function validateWPCredentials(
  creds: WPCredentials,
): Promise<ValidationResult> {
  const http = createWpClient(creds);

  try {
    const response = await http.request("/users/me");
    const data = await response.json();
    return { valid: true, displayName: data.name || creds.wpUsername };
  } catch (err) {
    if (HttpError.is(err)) {
      return {
        valid: false,
        error: `WordPress returned ${err.meta.status} ${err.meta.statusText}`,
      };
    }
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function credentialsFromEnv(): WPCredentials {
  return {
    wpUrl: config.wpUrl,
    wpUsername: config.wpUsername,
    wpAppPassword: config.wpAppPassword,
  };
}
