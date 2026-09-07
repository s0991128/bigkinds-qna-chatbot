import assert from "node:assert/strict";
import test from "node:test";
import { classifyQuestion } from "../lib/routing";
import { loadTrustedDocuments } from "../lib/server-knowledge";

test("routing protects the critical regression questions", async () => {
  const documents = await loadTrustedDocuments();
  assert.equal(classifyQuestion("검색어는 어떤 방식으로 조합하나요?", documents), "ANSWER");
  assert.equal(classifyQuestion("손흥민 이번주 골 넣었어?", documents), "NO_MATCH");
  assert.equal(classifyQuestion("OPEN API 요금이 어떻게 되나요?", documents), "ESCALATE");
});
