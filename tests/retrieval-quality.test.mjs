import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const intents = await readFile(new URL("../lib/question-intents.ts", import.meta.url), "utf8");
const search = await readFile(new URL("../lib/search.ts", import.meta.url), "utf8");
const confidence = await readFile(new URL("../lib/search-confidence.ts", import.meta.url), "utf8");

const checks = [
  ["일반 상식 차단", intents.includes("isLikelyGeneralKnowledgeQuestion") && intents.includes("generalTerms")],
  ["챗봇 메타 질문", intents.includes("isChatbotMetaQuestion")],
  ["기사 원문 차단", intents.includes("isArticleContentQuestion")],
  ["OPEN API 의도", intents.includes("isOpenApiQuestion")],
  ["검색식 OR", intents.includes("또는|or|중\\s*하나")],
  ["검색식 NOT", intents.includes("제외|빼고|말고|not")],
  ["답변 가능 문서 함수", search.includes("isAnswerableDocument")],
  ["현행 상태 필수", search.includes('document.status === "CURRENT"')],
  ["검토 문서 차단", search.includes("requiresReview !== true")],
  ["강제 이관 문서 차단", search.includes("alwaysEscalate !== true")],
  ["검색 기본 answerableOnly", search.includes("options.answerableOnly ?? true")],
  ["직접 일치 confidence", confidence.includes('kind: "DIRECT_MATCH"')],
  ["무결과 confidence", confidence.includes('kind: "NO_RESULT"')],
  ["점수 기준", confidence.includes("best.score >= 24")],
  ["키워드 2개 기준", confidence.includes("matchedTerms.length >= 2")],
  ["결과 차이 기준", confidence.includes("best.score - second.score >= 6")],
  ["LLM 보완 비활성화", page.includes("const supplementAnswer = null")],
  ["데이터 준비 전 차단", page.includes("공식 Q&A 데이터를 불러오는 중입니다")],
  ["정확 fallback 문구", page.includes("추정해서 답변하지 않습니다")],
  ["공식 문서 출처 표기", page.includes("관련 공식 문서(출처)")],
];

for (const [name, passed] of checks) test(`golden: ${name}`, () => assert.equal(passed, true));
