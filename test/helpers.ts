/**
 * Wait for async handlers to settle by yielding to the event loop.
 * Useful for testing fire-and-forget async code.
 */
export function tick(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}