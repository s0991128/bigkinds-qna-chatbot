import assert from "node:assert/strict";
import test from "node:test";
import { buildSearchQuery } from "../lib/search-query-builder";
import { loadTrustedDocuments } from "../lib/server-knowledge";
import { searchFaq } from "../lib/search";
import { isLikelyGeneralKnowledgeQuestion } from "../lib/question-intents";

test("exact official questions rank their own document first", async () => {
  const documents = await loadTrustedDocuments();
  for (const [question, id] of [["검색어는 어떤 방식으로 조합하나요?", "official-faq-17"], ["기사 전체 다운로드는 가능한가요?", "official-faq-18"], ["빅카인즈는 어떤 서비스인가요?", "bigkinds-intro-overview"]] as const) {
    assert.equal(searchFaq(question, 3, documents)[0]?.item.id, id);
  }
});

test("out-of-scope sports question is not treated as a FAQ match", () => {
  assert.equal(isLikelyGeneralKnowledgeQuestion("손흥민 이번주 골 넣었어?"), true);
});

test("natural-language builder keeps exclusion separate from OR terms", () => {
  const value = buildSearchQuery({ any: ["삼성전자", "SK하이닉스"], exclude: ["중국"] });
  assert.match(value, /\(삼성전자 OR SK하이닉스\) AND NOT 중국/);
});
