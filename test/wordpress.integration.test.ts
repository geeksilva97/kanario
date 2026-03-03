import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchDraft } from "../src/wordpress.ts";
import { credentialsFromEnv, createWpClient } from "../src/credentials.ts";

// Known post IDs on blog.codeminer42.com
const PUBLISHED_POST_ID = "12518";
const DRAFT_POST_ID = "2402";
const NONEXISTENT_POST_ID = "999999";

const creds = credentialsFromEnv();
const wpHttp = createWpClient(creds);

describe("WordPress integration", () => {
  it("fetches a published post", async () => {
    const post = await fetchDraft(wpHttp, PUBLISHED_POST_ID);

    assert.ok(post.title.length > 0, "title should not be empty");
    assert.ok(post.content.length > 0, "content should not be empty");
    assert.equal(typeof post.title, "string");
    assert.equal(typeof post.content, "string");
    assert.equal(typeof post.excerpt, "string");
  });

  it("returns plain text without HTML tags", async () => {
    const post = await fetchDraft(wpHttp, PUBLISHED_POST_ID);

    assert.ok(!/<[^>]+>/.test(post.title), "title should not contain HTML");
    assert.ok(!/<[^>]+>/.test(post.content), "content should not contain HTML");
    assert.ok(!/<[^>]+>/.test(post.excerpt), "excerpt should not contain HTML");
  });

  it("fetches a draft post with valid credentials", async () => {
    const post = await fetchDraft(wpHttp, DRAFT_POST_ID);

    assert.ok(post.title.length > 0, "draft title should not be empty");
    assert.ok(post.content.length > 0, "draft content should not be empty");
    assert.ok(post.excerpt.length > 0, "draft excerpt should not be empty");
  });

  it("throws on nonexistent post", async () => {
    await assert.rejects(
      () => fetchDraft(wpHttp, NONEXISTENT_POST_ID),
      (err: Error) => {
        assert.ok(err.message.includes("404"), "should mention 404");
        return true;
      },
    );
  });

  it("throws on draft with bad credentials", async () => {
    const badCreds = { ...creds, wpAppPassword: "wrong-password" };
    const badHttp = createWpClient(badCreds);

    await assert.rejects(
      () => fetchDraft(badHttp, DRAFT_POST_ID),
      (err: Error) => {
        assert.ok(
          err.message.includes("401"),
          "should mention 401 Unauthorized",
        );
        return true;
      },
    );
  });
});
