import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/ai/route.ts", import.meta.url), "utf8");
const gemini = await readFile(new URL("../lib/ai/gemini.ts", import.meta.url), "utf8");
const prompts = await readFile(new URL("../lib/ai/prompts.ts", import.meta.url), "utf8");
const types = await readFile(new URL("../lib/ai/types.ts", import.meta.url), "utf8");
const capabilities = await readFile(new URL("../lib/capabilities.ts", import.meta.url), "utf8");
const intents = await readFile(new URL("../lib/question-intents.ts", import.meta.url), "utf8");
const env = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const recommendations = await readFile(new URL("../lib/recommendations.ts", import.meta.url), "utf8");

test("5회 quota와 legacy guest storage가 다시 생기지 않는다", () => {
  for (const source of [page, route, gemini]) {
    assert.doesNotMatch(source, /GUEST_DAILY_LIMIT|consumeGuestQuota|bigkinds-guest-usage-v1|하루 최대 5회|오늘 남은 체험/);
  }
  assert.match(page, /누구나 무료로 이용할 수 있습니다/);
});

test("AI key는 서버 route에서만 읽는다", () => {
  assert.match(gemini, /process\.env\.GEMINI_API_KEY/);
  assert.doesNotMatch(page, /GEMINI_API_KEY|NEXT_PUBLIC_GEMINI_API_KEY/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_GEMINI_API_KEY|OPENAI_API_KEY|OPENAI_MODEL/);
});

test("AI route는 OPEN API와 민감정보를 Gemini보다 먼저 차단한다", () => {
  assert.match(route, /isOpenApiQuestion\(question\)/);
  assert.match(route, /sensitivePattern\.test\(question\)/);
  assert.ok(route.indexOf("isOpenApiQuestion(question)") < route.indexOf("const result = await interpretWithGemini"));
  assert.match(gemini, /TIMEOUT_MS = 8_000/);
  assert.match(gemini, /responseMimeType: "application\/json"/);
});

test("AI schema는 구조화 검색 조건과 catalog ID만 허용한다", () => {
  assert.match(types, /SEARCH_COACH/);
  assert.match(types, /CLASSIFY_SEARCH_TURN/);
  assert.match(types, /searchMode/);
  assert.match(types, /patch/);
  assert.match(types, /all: string\[\]/);
  assert.match(types, /exclude: string\[\]/);
  assert.match(gemini, /validateInterpretation/);
  assert.match(gemini, /capabilities\.some/);
  assert.match(capabilities, /sourceIds/);
  assert.match(gemini, /function searchPatch/);
});

test("Gemini prompt는 NEW와 UPDATE의 검색 상태 전달 범위를 구분한다", () => {
  assert.match(prompts, /CLASSIFY_SEARCH_TURN/);
  assert.match(prompts, /NEW는 현재 질문의 searchInput만/);
  assert.match(prompts, /UPDATE는 이전 조건을 재생성하지 말고/);
  assert.match(prompts, /NEW에서는 이전 검색어를 절대 복사하지 않습니다/);
});

test("검색 코치와 기능 추천은 기존 deterministic builder/catalog 경계를 사용한다", () => {
  assert.match(page, /buildSearchQuery\(/);
  assert.match(page, /getCapabilitiesById/);
  assert.match(page, /capabilitySourcesExist/);
  assert.match(page, /검색 조건을 이렇게 이해했습니다/);
});

test("자연어 검색 목적은 FAQ confidence gate 전에 SEARCH_COACH로 분기한다", () => {
  assert.match(intents, /export function isSearchGoalQuestion/);
  assert.match(intents, /export function extractSimpleSearchGoal/);
  assert.match(intents, /찾고싶어요/);
  assert.match(intents, /기사\|뉴스\|보도/);
  assert.match(intents, /빼줘/);
  assert.match(page, /if \(isSearchGoalQuestion\(cleanQuestion\)\)/);
  assert.ok(page.indexOf("if (isSearchGoalQuestion(cleanQuestion))") < page.indexOf("const searchHelp ="));
  assert.match(page, /찾고 싶은 뉴스 주제를 기준으로 검색조건을 정리했습니다/);
});

test("검색 목적의 안전 우선순위와 fallback 후보를 고정한다", () => {
  assert.match(intents, /isOpenApiQuestion\(question\).*isArticleContentQuestion\(question\)/s);
  assert.match(page, /fallbackKind: "SEARCH_GOAL"/);
  assert.match(page, /검색식 만들어보기/);
  assert.match(page, /검색조건을 더 자세히 입력하기/);
  assert.match(page, /검색식 사용법 보기/);
  assert.match(page, /lastSearchInput/);
  assert.ok(page.indexOf("isOpenApiQuestion(cleanQuestion)") < page.indexOf("if (searchExpressionIntent"));
});

test("추천 질문에서 특정 정치 인물 예시와 API 기술 답변 유도 문구를 제거한다", () => {
  assert.doesNotMatch(recommendations, /윤석열/);
  assert.match(recommendations, /인공지능과 반도체/);
  assert.match(recommendations, /뉴스토어에서 확인/);
});
