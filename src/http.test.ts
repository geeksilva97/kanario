import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHttpClient } from "./http.ts";
import { HttpError } from "./errors.ts";

describe("createHttpClient", () => {
  it("prepends baseUrl to relative paths", async (t) => {
    const mockFetch = t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response("{}")),
    );

    const http = createHttpClient({ baseUrl: "https://api.example.com/v2" });
    await http.request("/posts/1");

    assert.equal(mockFetch.mock.callCount(), 1);
    assert.equal(String(mockFetch.mock.calls[0].arguments[0]), "https://api.example.com/v2/posts/1");
  });

  it("uses absolute URLs as-is", async (t) => {
    const mockFetch = t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response("{}")),
    );

    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    await http.request("https://cdn.other.com/image.png");

    assert.equal(String(mockFetch.mock.calls[0].arguments[0]), "https://cdn.other.com/image.png");
  });

  it("merges default headers with per-request headers", async (t) => {
    const mockFetch = t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response("{}")),
    );

    const http = createHttpClient({
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    });

    await http.request("/test", {
      headers: { "Content-Type": "text/plain", "X-Custom": "value" },
    });

    const calledInit = mockFetch.mock.calls[0].arguments[1];
    assert.ok(calledInit !== undefined && typeof calledInit === "object" && "headers" in calledInit);
    // HeadersInit is a union (Record | string[][] | Headers) — createHttpClient always produces a plain object
    const headers = calledInit.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer token");
    assert.equal(headers["Content-Type"], "text/plain");
    assert.equal(headers["X-Custom"], "value");
  });

  it("throws HttpError on non-ok response", async (t) => {
    t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response("Not Found", { status: 404, statusText: "Not Found" })),
    );

    const http = createHttpClient({ baseUrl: "https://api.example.com" });

    await assert.rejects(
      () => http.request("/posts/999"),
      (err: unknown) => {
        if (!HttpError.is(err)) return assert.fail("Expected HttpError");
        assert.equal(err.meta.status, 404);
        assert.equal(err.meta.statusText, "Not Found");
        assert.equal(err.meta.body, "Not Found");
        assert.equal(err.meta.method, "GET");
        assert.ok(String(err.meta.url).includes("/posts/999"));
        return true;
      },
    );
  });

  it("uses request method in HttpError", async (t) => {
    t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response("Error", { status: 500, statusText: "Internal Server Error" })),
    );

    const http = createHttpClient();

    await assert.rejects(
      () => http.request("https://api.example.com/data", { method: "POST" }),
      (err: unknown) => {
        if (!HttpError.is(err)) return assert.fail("Expected HttpError");
        assert.equal(err.meta.method, "POST");
        return true;
      },
    );
  });

  it("exposes baseUrl", () => {
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    assert.equal(http.baseUrl, "https://api.example.com");
  });

  it("works without baseUrl", async (t) => {
    const mockFetch = t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response("{}")),
    );

    const http = createHttpClient();
    await http.request("https://absolute.url.com/path");

    assert.equal(String(mockFetch.mock.calls[0].arguments[0]), "https://absolute.url.com/path");
  });
});
