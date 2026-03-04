export function isGeminiRateLimit(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  try {
    const parsed = JSON.parse(err.message);
    return parsed?.error?.code === 429 || parsed?.error?.status === "RESOURCE_EXHAUSTED";
  } catch {
    return false;
  }
}