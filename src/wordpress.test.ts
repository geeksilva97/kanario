import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { stripHtml, parsePostId, resolvePostId, fetchDraft, uploadMedia, setFeaturedImage } from "./wordpress.ts";
import type { HttpClient, HttpRequestInit } from "./http.ts";
import { HttpError, WordPressError } from "./errors/index.ts";

function mockHttpClient(impl: (path: string, init?: HttpRequestInit) => Promise<Response>): HttpClient {
  return {
    baseUrl: "https://example.com/wp-json/wp/v2",
    request: impl,
  };
}

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
      parsePostId("https://example.com/wp-admin/post.php?post=12518&action=edit"),
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
    const http = mockHttpClient(async () => { throw new Error("should not be called"); });
    const result = await resolvePostId(http, "12487");
    assert.equal(result, "12487");
  });

  it("extracts post ID from a wp-admin edit URL without HTTP calls", async () => {
    const http = mockHttpClient(async () => { throw new Error("should not be called"); });
    const result = await resolvePostId(
      http,
      "https://example.com/wp-admin/post.php?post=12518&action=edit",
    );
    assert.equal(result, "12518");
  });

  it("resolves a published blog URL via slug lookup", async () => {
    let calledPath = "";
    const http = mockHttpClient(async (p) => {
      calledPath = p;
      return new Response(JSON.stringify([{ id: 99 }]), { status: 200 });
    });

    const result = await resolvePostId(http, "https://example.com/some-slug/");
    assert.equal(result, "99");
    assert.ok(calledPath.includes("slug=some-slug"));
  });

  it("throws WordPressError when slug lookup returns no matches", async () => {
    const http = mockHttpClient(async () =>
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await assert.rejects(
      () => resolvePostId(http, "https://example.com/nonexistent-post/"),
      (err: unknown) => {
        if (!WordPressError.is(err)) return assert.fail("Expected WordPressError");
        assert.equal(err.type, "wp_slug_not_found");
        assert.match(err.message, /No post found with slug "nonexistent-post"/);
        assert.deepEqual(err.meta, { slug: "nonexistent-post" });
        return true;
      },
    );
  });

  it("strips trailing slash from the slug", async () => {
    let calledPath = "";
    const http = mockHttpClient(async (p) => {
      calledPath = p;
      return new Response(JSON.stringify([{ id: 42 }]), { status: 200 });
    });

    const result = await resolvePostId(http, "https://example.com/my-post/");
    assert.equal(result, "42");
    assert.ok(calledPath.includes("slug=my-post"));
    assert.ok(!calledPath.includes("slug=my-post/"));
  });

  it("handles nested path as slug", async () => {
    let calledPath = "";
    const http = mockHttpClient(async (p) => {
      calledPath = p;
      return new Response(JSON.stringify([{ id: 77 }]), { status: 200 });
    });

    const result = await resolvePostId(http, "https://example.com/category/post-slug/");
    assert.equal(result, "77");
    assert.ok(calledPath.includes("slug=category%2Fpost-slug"));
  });

  it("throws WordPressError for a bare slug without URL scheme", async () => {
    const http = mockHttpClient(async () => { throw new Error("should not be called"); });

    await assert.rejects(
      () => resolvePostId(http, "just-a-slug"),
      (err: unknown) => {
        if (!WordPressError.is(err)) return assert.fail("Expected WordPressError");
        assert.equal(err.type, "wp_unresolvable_input");
        assert.match(err.message, /Cannot resolve post from input: just-a-slug/);
        assert.deepEqual(err.meta, { input: "just-a-slug" });
        return true;
      },
    );
  });
});

describe("fetchDraft", () => {
  it("fetches and strips HTML from post fields", async () => {
    let calledPath = "";
    const http = mockHttpClient(async (p) => {
      calledPath = p;
      return new Response(JSON.stringify({
        title: { rendered: "<p>My Post Title</p>" },
        content: { rendered: "<div>Some <strong>content</strong></div>" },
        excerpt: { rendered: "<p>An excerpt</p>" },
      }));
    });

    const result = await fetchDraft(http, "123");
    assert.equal(result.title, "My Post Title");
    assert.equal(result.content, "Some content");
    assert.equal(result.excerpt, "An excerpt");
    assert.equal(calledPath, "/posts/123");
  });

  it("throws WordPressError on non-200 response with wpCode", async () => {
    const wpBody = JSON.stringify({ code: "rest_post_invalid_id", message: "Invalid post ID." });
    const http = mockHttpClient(async (_p, init) => {
      throw new HttpError(init?.method ?? "GET", "https://example.com/wp-json/wp/v2/posts/999", 404, "Not Found", wpBody);
    });

    await assert.rejects(
      () => fetchDraft(http, "999"),
      (err: unknown) => {
        if (!WordPressError.is(err)) return assert.fail("Expected WordPressError");
        assert.equal(err.type, "wp_fetch_failed");
        assert.equal(err.meta.status, 404);
        assert.equal(err.meta.postId, "999");
        assert.equal(err.meta.wpCode, "rest_post_invalid_id");
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

  it("uploads file and returns media ID", async () => {
    let calledPath = "";
    let calledInit: HttpRequestInit | undefined;
    const http = mockHttpClient(async (p, init) => {
      calledPath = p;
      calledInit = init;
      return new Response(JSON.stringify({ id: 42 }));
    });

    const result = await uploadMedia(http, tmpImage, "cover.png");
    assert.equal(result, 42);
    assert.equal(calledPath, "/media");
    assert.equal(calledInit?.method, "POST");
    const headers = calledInit?.headers;
    assert.ok(headers, "expected headers");
    assert.equal(headers["Content-Type"], "image/png");
    assert.equal(headers["Content-Disposition"], 'attachment; filename="cover.png"');
  });

  it("throws WordPressError on non-200 response with wpCode", async () => {
    const wpBody = JSON.stringify({ code: "rest_cannot_create", message: "Sorry, you are not allowed to upload media." });
    const http = mockHttpClient(async (_p, init) => {
      throw new HttpError(init?.method ?? "GET", "https://example.com/wp-json/wp/v2/media", 403, "Forbidden", wpBody);
    });

    await assert.rejects(
      () => uploadMedia(http, tmpImage, "cover.png"),
      (err: unknown) => {
        if (!WordPressError.is(err)) return assert.fail("Expected WordPressError");
        assert.equal(err.type, "wp_upload_failed");
        assert.equal(err.meta.status, 403);
        assert.equal(err.meta.wpCode, "rest_cannot_create");
        return true;
      },
    );
  });
});

describe("setFeaturedImage", () => {
  it("sends POST with featured_media in body", async () => {
    let calledPath = "";
    let calledInit: HttpRequestInit | undefined;
    const http = mockHttpClient(async (p, init) => {
      calledPath = p;
      calledInit = init;
      return new Response("{}", { status: 200 });
    });

    await setFeaturedImage(http, "123", 42);
    assert.equal(calledPath, "/posts/123");
    assert.equal(calledInit?.method, "POST");
    const headers = calledInit?.headers;
    assert.ok(headers, "expected headers");
    assert.equal(headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(String(calledInit?.body)), { featured_media: 42 });
  });

  it("throws WordPressError on non-200 response with wpCode", async () => {
    const wpBody = JSON.stringify({ code: "rest_cannot_edit", message: "Sorry, you are not allowed to edit this post." });
    const http = mockHttpClient(async (_p, init) => {
      throw new HttpError(init?.method ?? "GET", "https://example.com/wp-json/wp/v2/posts/123", 403, "Forbidden", wpBody);
    });

    await assert.rejects(
      () => setFeaturedImage(http, "123", 42),
      (err: unknown) => {
        if (!WordPressError.is(err)) return assert.fail("Expected WordPressError");
        assert.equal(err.type, "wp_set_featured_failed");
        assert.equal(err.meta.status, 403);
        assert.equal(err.meta.wpCode, "rest_cannot_edit");
        return true;
      },
    );
  });
});
