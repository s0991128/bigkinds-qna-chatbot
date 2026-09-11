import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const answerModel = await readFile(new URL("../lib/answer-model.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const types = await readFile(new URL("../lib/ai/types.ts", import.meta.url), "utf8");
const prompts = await readFile(new URL("../lib/ai/prompts.ts", import.meta.url), "utf8");
const insights = await readFile(new URL("../lib/insights.ts", import.meta.url), "utf8");
const manual = await readFile(new URL("../public/data/manual-knowledge.js", import.meta.url), "utf8");

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
  assert.match(page, /knowledge\.filter\(isAnswerableDocument\)/);
  assert.match(page, /공식 근거 문서/);
  assert.doesNotMatch(page, /<strong>\{knowledge\.length\}<\/strong>/);
});

test("operator guidance uses explicit AND OR NOT and avoids a whitespace-as-AND claim", () => {
  assert.match(manual, /AND.*모든 조건|AND·OR·NOT/);
  assert.match(manual, /검색 방식에 따라 단순 띄어쓰기나/);
  assert.doesNotMatch(manual, /AND·공백·\+/);
});
