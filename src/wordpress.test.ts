import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripHtml, parsePostId, resolvePostId } from "./wordpress.ts";
import type { WPCredentials } from "./credentials.ts";

const fakeCreds: WPCredentials = {
  wpUrl: "https://blog.codeminer42.com",
  wpUsername: "testuser",
  wpAppPassword: "xxxx xxxx xxxx",
};

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    assert.equal(stripHtml("<p>Hello <strong>world</strong></p>"), "Hello world");
  });

  it("decodes HTML entities", () => {
    assert.equal(stripHtml("&amp; &lt; &gt; &quot; &#039;"), '& < > " \'');
  });

  it("decodes &nbsp;", () => {
    assert.equal(stripHtml("hello&nbsp;world"), "hello world");
  });

  it("collapses excessive newlines", () => {
    assert.equal(stripHtml("a\n\n\n\nb"), "a\n\nb");
  });

  it("trims whitespace", () => {
    assert.equal(stripHtml("  <p>hello</p>  "), "hello");
  });

  it("handles empty string", () => {
    assert.equal(stripHtml(""), "");
  });

  it("handles plain text (no HTML)", () => {
    assert.equal(stripHtml("just text"), "just text");
  });
});

describe("parsePostId", () => {
  it("returns a plain numeric ID as-is", () => {
    assert.equal(parsePostId("12487"), "12487");
  });

  it("extracts post ID from a wp-admin edit URL", () => {
    assert.equal(
      parsePostId("https://blog.codeminer42.com/wp-admin/post.php?post=12518&action=edit"),
      "12518",
    );
  });

  it("extracts post ID when post param is the only query param", () => {
    assert.equal(
      parsePostId("https://example.com/wp-admin/post.php?post=999"),
      "999",
    );
  });

  it("returns the input unchanged for a URL without a post param", () => {
    assert.equal(
      parsePostId("https://example.com/some-page"),
      "https://example.com/some-page",
    );
  });
});

describe("resolvePostId", () => {
  it("returns a plain numeric ID without making HTTP calls", async () => {
    const result = await resolvePostId(fakeCreds, "12487");
    assert.equal(result, "12487");
  });

  it("extracts post ID from a wp-admin edit URL without HTTP calls", async () => {
    const result = await resolvePostId(
      fakeCreds,
      "https://blog.codeminer42.com/wp-admin/post.php?post=12518&action=edit",
    );
    assert.equal(result, "12518");
  });

  it("resolves a published blog URL via slug lookup", async (t) => {
    const mockFetch = t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response(JSON.stringify([{ id: 99 }]), { status: 200 })),
    );

    const result = await resolvePostId(fakeCreds, "https://blog.codeminer42.com/some-slug/");
    assert.equal(result, "99");
    assert.equal(mockFetch.mock.callCount(), 1);
    const calledUrl = String(mockFetch.mock.calls[0].arguments[0]);
    assert.ok(calledUrl.includes("slug=some-slug"));
  });

  it("throws when slug lookup returns no matches", async (t) => {
    t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    );

    await assert.rejects(
      () => resolvePostId(fakeCreds, "https://blog.codeminer42.com/nonexistent-post/"),
      { message: /No post found with slug "nonexistent-post"/ },
    );
  });

  it("strips trailing slash from the slug", async (t) => {
    const mockFetch = t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response(JSON.stringify([{ id: 42 }]), { status: 200 })),
    );

    const result = await resolvePostId(fakeCreds, "https://blog.codeminer42.com/my-post/");
    assert.equal(result, "42");
    const calledUrl = String(mockFetch.mock.calls[0].arguments[0]);
    assert.ok(calledUrl.includes("slug=my-post"));
    assert.ok(!calledUrl.includes("slug=my-post/"));
  });

  it("handles nested path as slug", async (t) => {
    const mockFetch = t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response(JSON.stringify([{ id: 77 }]), { status: 200 })),
    );

    const result = await resolvePostId(fakeCreds, "https://blog.codeminer42.com/category/post-slug/");
    assert.equal(result, "77");
    const calledUrl = String(mockFetch.mock.calls[0].arguments[0]);
    assert.ok(calledUrl.includes("slug=category%2Fpost-slug"));
  });

  it("throws for a bare slug without URL scheme", async () => {
    await assert.rejects(
      () => resolvePostId(fakeCreds, "just-a-slug"),
      { message: /Cannot resolve post from input: just-a-slug/ },
    );
  });
});
