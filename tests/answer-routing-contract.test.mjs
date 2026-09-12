import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const answerModel = await readFile(new URL("../lib/answer-model.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const search = await readFile(new URL("../lib/search.ts", import.meta.url), "utf8");
const types = await readFile(new URL("../lib/ai/types.ts", import.meta.url), "utf8");
const prompts = await readFile(new URL("../lib/ai/prompts.ts", import.meta.url), "utf8");
const insights = await readFile(new URL("../lib/insights.ts", import.meta.url), "utf8");
const manual = await readFile(new URL("../public/data/manual-knowledge.js", import.meta.url), "utf8");
const intents = await readFile(new URL("../lib/question-intents.ts", import.meta.url), "utf8");
const diagnostics = await readFile(new URL("../lib/diagnostic-flows.ts", import.meta.url), "utf8");

test("duplicate-answer display removes the summary paragraph and hides an empty details control", () => {
  assert.match(answerModel, /item\.summary\?\.trim\(\) \|\| paragraphs\[0\] \|\| item\.question/);
  assert.match(answerModel, /details: comparisonKey\(details\) === comparisonKey\(summary\) \? "" : details/);
  assert.match(page, /message\.answerModel\.details \|\| message\.answerModel\.steps\.length > 0 \|\| message\.answerModel\.cautions\.length > 0/);
  assert.match(page, /message\.answerModel\.details && <button className="answer-expand"/);
});

test("route-source-hard records forced policy routing", () => {
  assert.match(page, /setDecisionTrace\("HARD_RULE"\)/);
});

test("route-source-deterministic records rule and knowledge decisions", () => {
  for (const value of ["HARD_RULE", "DETERMINISTIC", "KNOWLEDGE_MATCH", "LLM"]) {
    assert.match(types, new RegExp(value));
    assert.match(page, new RegExp(value));
  }
  assert.match(page, /data-qa-decision-source/);
  assert.match(page, /setDecisionTrace\("KNOWLEDGE_MATCH"\)/);
  assert.match(insights, /ROUTE_HARD_RULE.*ROUTE_DETERMINISTIC.*ROUTE_KNOWLEDGE.*ROUTE_LLM/s);
});

test("route-source-llm records only semantic arbitration", () => {
  assert.match(page, /setDecisionTrace\("LLM", task, true\)/);
  assert.match(page, /ambiguousFeaturePurpose/);
  assert.ok(page.indexOf("ambiguousFeaturePurpose && await answerWithAi") < page.indexOf("recommendFeatureForQuestion(cleanQuestion, routed.capabilityIds)"));
});

test("Gemini ROUTE prompt is restricted to the semantic AI_INTENTS contract", () => {
  assert.match(prompts, /ROUTE에서는 AI_INTENTS 중 하나만 반환합니다/);
  assert.match(prompts, /SEARCH_COACH, SEARCH_DIAGNOSIS, FEATURE_RECOMMENDATION, TROUBLESHOOT, FAQ_SEARCH, OUT_OF_SCOPE, UNKNOWN/);
  assert.match(types, /export const AI_INTENTS/);
  assert.doesNotMatch(prompts, /ROUTE에서는 다음 순서를 지킵니다/);
});

test("grounded-document-count uses answerable official documents rather than raw knowledge length", () => {
  assert.match(page, /const groundedDocumentCount = useMemo\(/);
  assert.match(page, /countOfficialGroundedDocuments\(knowledge\)/);
  assert.match(search, /export function countOfficialGroundedDocuments/);
  assert.match(search, /const seen = new Set<string>\(\)/);
  assert.match(page, /직접 답변 가능 근거/);
  assert.match(page, /공식 Q&amp;A/);
  assert.doesNotMatch(page, /\.length \|\| 23/);
  assert.doesNotMatch(page, /<strong>\{knowledge\.length\}<\/strong>/);
});

test("answer provenance is explicit and persisted independently from route source", () => {
  assert.match(types, /export type AnswerOrigin = "INTERNAL_ENGINE" \| "LLM_GENERATED"/);
  assert.match(page, /answerOrigin\?: AnswerOrigin/);
  assert.match(page, /answerOrigin: message\.answerOrigin \?\? "INTERNAL_ENGINE"/);
  assert.match(page, /data-qa-answer-origin/);
  assert.match(page, /공식 근거·내부엔진/);
  assert.match(page, /AI 생성 답변/);
  assert.match(insights, /ANSWER_INTERNAL_ENGINE.*ANSWER_LLM_GENERATED/);
  assert.doesNotMatch(page, /interpretation\.text/);
});

test("standalone hero is a contextual copilot showcase, not a second search service", () => {
  for (const marker of ["hero-open-chat", "hero-evidence", "hero-showcase-note", "metric-faq", "metric-qna", "직접 답변 가능 근거", "official-evidence", "purpose-primary", "purpose-secondary"]) {
    assert.match(page, new RegExp(marker));
  }
  assert.doesNotMatch(page, /hero-question-input|hero-question-send|quick-start-card/);
  assert.match(page, /!embedded/);
  assert.match(page, /운영지원 공식 Q&A · 검토형 문서 포함/);
  assert.match(page, /현행성·답변 가능 조건을 통과한 문서/);
  assert.match(page, /recommendation-engine/);
  assert.match(page, /data-qa-recommendation-source/);
});

test("operator guidance uses explicit AND OR NOT and avoids a whitespace-as-AND claim", () => {
  assert.match(manual, /AND.*모든 조건|AND·OR·NOT/);
  assert.match(manual, /검색 방식에 따라 단순 띄어쓰기나/);
  assert.doesNotMatch(manual, /AND·공백·\+/);
});

test("full-text download questions use the canonical service fact path", () => {
  assert.match(intents, /export function isFullTextDownloadQuestion/);
  assert.match(page, /isFullTextDownloadQuestion\(cleanQuestion\)/);
  assert.match(page, /bigkinds-canonical-fulltext-download/);
  assert.match(page, /const fullTextDownload = isFullTextDownloadQuestion\(cleanQuestion\)/);
  assert.match(diagnostics, /const downloadCue/);
  assert.match(diagnostics, /const downloadProblemCue/);
});
