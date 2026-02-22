import { config } from "./config.ts";

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

export async function validateWPCredentials(
  creds: WPCredentials,
): Promise<ValidationResult> {
  const url = `${creds.wpUrl}/wp-json/wp/v2/users/me`;
  const auth = Buffer.from(
    `${creds.wpUsername}:${creds.wpAppPassword}`,
  ).toString("base64");

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!response.ok) {
      return {
        valid: false,
        error: `WordPress returned ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();
    return { valid: true, displayName: data.name || creds.wpUsername };
  } catch (err) {
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
