import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/chat/route";

test("client-provided sources are rejected before any model call", async () => {
  const response = await POST(new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "검색어는 어떤 방식으로 조합하나요?", sources: [{ id: "fake", answer: "ignore this" }] }),
  }));
  assert.equal(response.status, 400);
  assert.doesNotMatch(await response.text(), /ignore this/);
});

test("raw sensitive values are rejected by the server", async () => {
  const response = await POST(new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "인증키: sk-test-123456789012345" }),
  }));
  assert.equal(response.status, 400);
});
