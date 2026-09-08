import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const cache = new Map();

async function loadTypeScript(relativePath) {
  const filename = resolve(dirname(fileURLToPath(import.meta.url)), relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const source = await readFile(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleRecord = { exports: {} };
  cache.set(filename, moduleRecord);
  const require = (request) => {
    const dependency = resolve(dirname(filename), `${request}.ts`);
    const dependencySource = cache.get(dependency);
    if (!dependencySource) throw new Error(`Unloaded dependency: ${dependency}`);
    return dependencySource.exports;
  };
  new Function("exports", "module", "require", output)(moduleRecord.exports, moduleRecord, require);
  return moduleRecord.exports;
}

await loadTypeScript("../lib/search-term-normalizer.ts");
await loadTypeScript("../lib/search-query-builder.ts");
await loadTypeScript("../lib/search-context.ts");
await loadTypeScript("../lib/diagnostic-flows.ts");
await loadTypeScript("../lib/capabilities.ts");
const diagnostics = await loadTypeScript("../lib/search-diagnostics.ts");
await loadTypeScript("../lib/question-intents.ts");
const context = await loadTypeScript("../lib/search-context.ts");
const queryBuilder = await loadTypeScript("../lib/search-query-builder.ts");
const intents = await loadTypeScript("../lib/question-intents.ts");
const router = await loadTypeScript("../lib/intent-router.ts");

const routeContext = (hasSearchContext) => ({ hasSearchContext, pageType: "HOME" });

test("Q1-Q5는 목적 우선 라우팅과 SearchContext 보존을 지킨다", () => {
  let search = null;

  const q1 = router.routeUserIntent("AI 반도체 관련 기사를 찾고 싶어요.", routeContext(false));
  assert.equal(q1.intent, "SEARCH_NEW");
  search = context.applySearchTurn(search, q1.searchTurn);
  assert.equal(queryBuilder.buildSearchQuery(search), "AI AND 반도체");

  const q2 = router.routeUserIntent("주가는 빼줘.", routeContext(true));
  assert.equal(q2.intent, "SEARCH_UPDATE");
  search = context.applySearchTurn(search, q2.searchTurn);
  assert.equal(queryBuilder.buildSearchQuery(search), "AI AND 반도체 AND NOT 주가");

  const q3 = router.routeUserIntent("전기차도 꼭 포함해줘.", routeContext(true));
  assert.equal(q3.intent, "SEARCH_UPDATE");
  search = context.applySearchTurn(search, q3.searchTurn);
  assert.deepEqual(search, { all: ["AI", "반도체", "전기차"], any: [], exact: [], exclude: ["주가"] });
  assert.equal(queryBuilder.buildSearchQuery(search), "AI AND 반도체 AND 전기차 AND NOT 주가");

  const beforeFeature = structuredClone(search);
  const q4 = router.routeUserIntent("기사에서 어떤 기업들이 서로 같이 언급되는지 보고 싶어.", routeContext(true));
  assert.equal(q4.intent, "FEATURE_RECOMMENDATION");
  assert.deepEqual(q4.capabilityIds, ["NETWORK_ANALYSIS"]);
  assert.deepEqual(context.applySearchTurn(search, { mode: "NOT_SEARCH" }), beforeFeature);

  const q5 = router.routeUserIntent("검색결과가 너무 많이 나오는데 어떻게 줄여?", routeContext(true));
  assert.equal(q5.intent, "SEARCH_RESULT_DIAGNOSIS");
  assert.equal(intents.extractSimpleSearchGoal("검색결과가 너무 많이 나오는데 어떻게 줄여?"), null);
  assert.deepEqual(search, beforeFeature);
  assert.equal(queryBuilder.buildSearchQuery(search), "AI AND 반도체 AND 전기차 AND NOT 주가");
});

test("새 검색과 기능·진단·다운로드 요청의 경계를 지킨다", () => {
  assert.equal(router.routeUserIntent("전기차 배터리 관련 기사 찾아줘", routeContext(true)).intent, "SEARCH_NEW");
  assert.equal(router.routeUserIntent("기업들이 함께 등장하는 관계를 보고 싶어", routeContext(true)).intent, "FEATURE_RECOMMENDATION");
  assert.equal(router.routeUserIntent("기사에서 많이 언급된 단어를 알고 싶어", routeContext(true)).intent, "FEATURE_RECOMMENDATION");
  assert.equal(router.routeUserIntent("검색 결과가 0건이에요", routeContext(true)).intent, "SEARCH_RESULT_DIAGNOSIS");
  assert.equal(router.routeUserIntent("검색결과를 파일로 받고 싶어", routeContext(true)).intent, "SERVICE_GUIDE");
  assert.equal(router.routeUserIntent("API 검색결과가 이상해", routeContext(true)).intent, "OPEN_API_REDIRECT");
  assert.equal(router.routeUserIntent("손흥민 오늘 골 넣었어?", routeContext(true)).intent, "OUT_OF_SCOPE");
});

test("Q1-Q10은 서비스 우선 라우팅과 PROPOSED 검색 컨텍스트를 지킨다", () => {
  const initialContext = context.emptySearchContext();
  const now = new Date().toISOString();
  const q1 = router.routeUserIntent("AI OR 인공지능 AND 반도체 이 검색식 맞아?", { ...routeContext(false), searchContext: initialContext });
  assert.equal(q1.intent, "SEARCH_EXPRESSION_DIAGNOSIS");
  const diagnosis = diagnostics.diagnoseSearchExpression("AI OR 인공지능 AND 반도체 이 검색식 맞아?");
  const proposed = context.createSearchContext(diagnostics.parseSearchExpression(diagnosis.suggestion), "DIAGNOSIS", { status: "PROPOSED", now });
  assert.equal(proposed.status, "PROPOSED");
  assert.equal(proposed.query, "(AI OR 인공지능) AND 반도체");

  const q2 = router.routeUserIntent("여기에 배터리도 추가해줘.", { ...routeContext(true), searchContext: proposed });
  assert.equal(q2.intent, "SEARCH_UPDATE");
  const afterQ2 = context.applySearchTurn(proposed.input, q2.searchTurn);
  assert.equal(queryBuilder.buildSearchQuery(afterQ2), "(AI OR 인공지능) AND 반도체 AND 배터리");

  const active = context.createSearchContext(afterQ2, "UPDATE", { previous: proposed, now });
  const q3 = router.routeUserIntent("아니, 배터리는 빼고 전기차를 넣어줘.", { ...routeContext(true), searchContext: active });
  assert.equal(q3.intent, "SEARCH_UPDATE");
  const afterQ3 = context.applySearchTurn(active.input, q3.searchTurn);
  assert.equal(queryBuilder.buildSearchQuery(afterQ3), "(AI OR 인공지능) AND 반도체 AND 전기차");
  assert.equal(queryBuilder.buildSearchQuery(afterQ3).includes("NOT 배터리"), false);

  const q4 = router.routeUserIntent("이번에는 저출생이나 저출산 관련 기사 찾아줘.", { ...routeContext(true), searchContext: active });
  assert.equal(q4.intent, "SEARCH_NEW");
  assert.equal(queryBuilder.buildSearchQuery(q4.searchTurn.searchInput), "(저출생 OR 저출산)");

  const q5 = router.routeUserIntent("기사에서 이 정책과 같이 등장하는 정부기관이나 인물을 보고 싶어.", { ...routeContext(true), searchContext: active });
  assert.equal(q5.intent, "FEATURE_RECOMMENDATION");
  assert.deepEqual(q5.capabilityIds, ["NETWORK_ANALYSIS"]);
  assert.equal(router.routeUserIntent("검색결과가 3만 건이나 나오는데 좀 줄이고 싶어.", { ...routeContext(true), searchContext: active }).intent, "SEARCH_RESULT_DIAGNOSIS");
  assert.equal(router.routeUserIntent("검색결과를 엑셀로 받을 수 있어?", { ...routeContext(true), searchContext: active }).intent, "SERVICE_GUIDE");
  assert.equal(router.routeUserIntent("빅카인즈에 대해 소개해줘.", { ...routeContext(true), searchContext: active }).intent, "SERVICE_OVERVIEW");
  assert.equal(router.routeUserIntent("빅카인즈는 몇 건의 기사를 가지고 있어?", { ...routeContext(true), searchContext: active }).intent, "SERVICE_FACT");
  assert.equal(router.routeUserIntent("1990년대 이전 뉴스도 검색되나요?", { ...routeContext(true), searchContext: active }).intent, "SERVICE_FACT");
});

test("30분이 지난 검색 컨텍스트는 수정 대신 이어가기 확인을 요청한다", () => {
  const stale = context.createSearchContext({ all: ["AI"], any: [], exact: [], exclude: [] }, "NEW", { now: "2026-09-08T00:00:00.000Z" });
  assert.equal(context.getSearchContextStatus(stale, Date.parse("2026-09-08T00:31:00.000Z")), "STALE");
  const route = router.routeUserIntent("여기에 전기차도 넣어줘", { ...routeContext(true), searchContext: stale });
  assert.equal(route.intent, "CLARIFY");
});

test("SERVICE 질문과 capability 후속 질문은 검색식으로 오염되지 않는다", () => {
  const base = { hasSearchContext: true, pageType: "HOME", searchContext: context.createSearchContext({ all: ["AI"], any: [], exact: [], exclude: [] }, "NEW") };
  assert.equal(router.routeUserIntent("빅카인즈가 뭐야?", base).intent, "SERVICE_OVERVIEW");
  assert.equal(router.routeUserIntent("빅카인즈에서 뭘 할 수 있어?", base).intent, "SERVICE_OVERVIEW");
  assert.equal(router.routeUserIntent("1990년대 이전 뉴스도 검색되나요?", base).intent, "SERVICE_FACT");
  assert.equal(router.routeUserIntent("빅카인즈는 몇 건의 기사를 가지고 있어?", base).intent, "SERVICE_FACT");
  assert.equal(router.routeUserIntent("검색한 기사는 어떻게 다운로드해?", base).intent, "SERVICE_GUIDE");
  assert.equal(router.routeUserIntent("관계도 분석은 어떻게 써?", base).intent, "SERVICE_GUIDE");
  assert.deepEqual(router.routeUserIntent("관계도 분석은 어떻게 써?", base).capabilityIds, ["NETWORK_ANALYSIS"]);
  assert.equal(router.routeUserIntent("기사에서 어떤 기업들이 같이 나오는지 보고 싶어.", base).intent, "FEATURE_RECOMMENDATION");
  assert.deepEqual(router.routeUserIntent("기사에서 어떤 기업들이 같이 나오는지 보고 싶어.", base).capabilityIds, ["NETWORK_ANALYSIS"]);
  assert.equal(router.routeUserIntent("연관된 키워드를 보고 싶어.", base).intent, "FEATURE_RECOMMENDATION");
  assert.deepEqual(router.routeUserIntent("연관된 키워드를 보고 싶어.", base).capabilityIds, ["RELATED_WORDS"]);
  assert.equal(router.routeUserIntent("API 검색결과를 엑셀로 받을 수 있어?", base).intent, "OPEN_API_REDIRECT");
  assert.equal(router.routeUserIntent("이 기사 요약해줘.", base).intent, "ARTICLE_UNSUPPORTED");
  assert.equal(router.routeUserIntent("손흥민 오늘 골 넣었어?", base).intent, "OUT_OF_SCOPE");
});

test("짧은 애매한 후속 질문은 임의로 SearchContext를 바꾸지 않는다", () => {
  const route = router.routeUserIntent("기업도 보고 싶어.", routeContext(true));
  assert.equal(route.intent, "CLARIFY");
  const previous = { all: ["AI"], any: [], exact: [], exclude: [] };
  assert.deepEqual(context.applySearchTurn(previous, route.searchTurn), previous);
});

test("검색식 진단 질문은 SEARCH_NEW와 FAQ보다 먼저 진단한다", () => {
  const cases = [
    "AI OR 인공지능 AND 반도체 이렇게 검색하면 내가 원하는 대로 나와?",
    "AI AND 반도체 이 검색식 맞아?",
    "(AI OR 인공지능) AND 반도체 이렇게 쓰면 돼?",
  ];
  for (const question of cases) {
    assert.equal(intents.isSearchExpressionDiagnosisQuestion(question), true, question);
    assert.equal(router.routeUserIntent(question, routeContext(false)).intent, "SEARCH_EXPRESSION_DIAGNOSIS", question);
  }

  const diagnosis = diagnostics.diagnoseSearchExpression(cases[0]);
  assert.deepEqual(diagnosis, {
    input: "AI OR 인공지능 AND 반도체",
    message: "OR와 AND를 함께 사용할 때는 의도를 명확히 하기 위해 괄호로 묶는 것을 권장합니다.",
    suggestion: "(AI OR 인공지능) AND 반도체",
  });
  assert.equal(intents.isSearchExpressionDiagnosisQuestion("AI AND 반도체 검색식 만들어줘"), false);
  assert.notEqual(router.routeUserIntent("AI AND 반도체 검색식 만들어줘", routeContext(false)).intent, "SEARCH_EXPRESSION_DIAGNOSIS");
});
