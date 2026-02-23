import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { stripHtml, parsePostId, resolvePostId, fetchDraft, uploadMedia, setFeaturedImage } from "./wordpress.ts";
import type { WPCredentials } from "./credentials.ts";
import { WordPressError } from "./errors.ts";

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

  it("throws WordPressError when slug lookup returns no matches", async (t) => {
    t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    );

    await assert.rejects(
      () => resolvePostId(fakeCreds, "https://blog.codeminer42.com/nonexistent-post/"),
      (err: any) => {
        assert.ok(WordPressError.is(err));
        assert.equal(err.type, "wp_slug_not_found");
        assert.match(err.message, /No post found with slug "nonexistent-post"/);
        assert.deepEqual(err.meta, { slug: "nonexistent-post" });
        return true;
      },
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

  it("throws WordPressError for a bare slug without URL scheme", async () => {
    await assert.rejects(
      () => resolvePostId(fakeCreds, "just-a-slug"),
      (err: any) => {
        assert.ok(WordPressError.is(err));
        assert.equal(err.type, "wp_unresolvable_input");
        assert.match(err.message, /Cannot resolve post from input: just-a-slug/);
        assert.deepEqual(err.meta, { input: "just-a-slug" });
        return true;
      },
    );
  });
});

describe("fetchDraft", () => {
  it("fetches and strips HTML from post fields", async (t) => {
    const mockFetch = t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response(JSON.stringify({
        title: { rendered: "<p>My Post Title</p>" },
        content: { rendered: "<div>Some <strong>content</strong></div>" },
        excerpt: { rendered: "<p>An excerpt</p>" },
      }))),
    );

    const result = await fetchDraft(fakeCreds, "123");
    assert.equal(result.title, "My Post Title");
    assert.equal(result.content, "Some content");
    assert.equal(result.excerpt, "An excerpt");
    assert.equal(mockFetch.mock.callCount(), 1);

    const calledUrl = String(mockFetch.mock.calls[0].arguments[0]);
    assert.equal(calledUrl, "https://blog.codeminer42.com/wp-json/wp/v2/posts/123");

    const calledInit = mockFetch.mock.calls[0].arguments[1] as any;
    const expectedAuth = Buffer.from("testuser:xxxx xxxx xxxx").toString("base64");
    assert.equal(calledInit.headers.Authorization, `Basic ${expectedAuth}`);
  });

  it("throws WordPressError on non-200 response", async (t) => {
    t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response("Not Found", { status: 404, statusText: "Not Found" })),
    );

    await assert.rejects(
      () => fetchDraft(fakeCreds, "999"),
      (err: any) => {
        assert.ok(WordPressError.is(err));
        assert.equal(err.type, "wp_fetch_failed");
        assert.match(err.message, /Failed to fetch post 999: 404 Not Found/);
        assert.deepEqual(err.meta, { postId: "999", status: 404, statusText: "Not Found" });
        return true;
      },
    );
  });
});

describe("uploadMedia", () => {
  let tmpDir: string;
  let tmpImage: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-upload-test-"));
    tmpImage = path.join(tmpDir, "test.png");
    fs.writeFileSync(tmpImage, "fake-png-content");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("uploads file and returns media ID", async (t) => {
    const mockFetch = t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response(JSON.stringify({ id: 42 }))),
    );

    const result = await uploadMedia(fakeCreds, tmpImage, "cover.png");
    assert.equal(result, 42);
    assert.equal(mockFetch.mock.callCount(), 1);

    const calledUrl = String(mockFetch.mock.calls[0].arguments[0]);
    assert.equal(calledUrl, "https://blog.codeminer42.com/wp-json/wp/v2/media");

    const calledInit = mockFetch.mock.calls[0].arguments[1] as any;
    assert.equal(calledInit.method, "POST");
    assert.equal(calledInit.headers["Content-Type"], "image/png");
    assert.equal(calledInit.headers["Content-Disposition"], 'attachment; filename="cover.png"');

    const expectedAuth = Buffer.from("testuser:xxxx xxxx xxxx").toString("base64");
    assert.equal(calledInit.headers.Authorization, `Basic ${expectedAuth}`);
  });

  it("throws WordPressError on non-200 response", async (t) => {
    t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response("Error", { status: 500, statusText: "Internal Server Error" })),
    );

    await assert.rejects(
      () => uploadMedia(fakeCreds, tmpImage, "cover.png"),
      (err: any) => {
        assert.ok(WordPressError.is(err));
        assert.equal(err.type, "wp_upload_failed");
        assert.match(err.message, /Failed to upload media: 500 Internal Server Error/);
        return true;
      },
    );
  });
});

describe("setFeaturedImage", () => {
  it("sends POST with featured_media in body", async (t) => {
    const mockFetch = t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response("{}", { status: 200 })),
    );

    await setFeaturedImage(fakeCreds, "123", 42);
    assert.equal(mockFetch.mock.callCount(), 1);

    const calledUrl = String(mockFetch.mock.calls[0].arguments[0]);
    assert.equal(calledUrl, "https://blog.codeminer42.com/wp-json/wp/v2/posts/123");

    const calledInit = mockFetch.mock.calls[0].arguments[1] as any;
    assert.equal(calledInit.method, "POST");
    assert.equal(calledInit.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(calledInit.body), { featured_media: 42 });
  });

  it("throws WordPressError on non-200 response", async (t) => {
    t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response("Error", { status: 403, statusText: "Forbidden" })),
    );

    await assert.rejects(
      () => setFeaturedImage(fakeCreds, "123", 42),
      (err: any) => {
        assert.ok(WordPressError.is(err));
        assert.equal(err.type, "wp_set_featured_failed");
        assert.match(err.message, /Failed to set featured image: 403 Forbidden/);
        return true;
      },
    );
  });
});
