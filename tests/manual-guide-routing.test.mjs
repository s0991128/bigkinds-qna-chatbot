import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
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
await loadTypeScript("../lib/privacy-sanitizer.ts");
await loadTypeScript("../lib/support-case.ts");
await loadTypeScript("../lib/support-routing.ts");
await loadTypeScript("../lib/diagnostic-flows.ts");
const capabilities = await loadTypeScript("../lib/capabilities.ts");
await loadTypeScript("../lib/article-lookup.ts");
await loadTypeScript("../lib/question-intents.ts");
const router = await loadTypeScript("../lib/intent-router.ts");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const insights = await readFile(new URL("../lib/insights.ts", import.meta.url), "utf8");

const context = { hasSearchContext: false, pageType: "HOME" };

test("manual procedures route to SERVICE_GUIDE with capability context", () => {
  const route = router.routeUserIntent("관계도 분석은 어떻게 사용해?", context);
  assert.equal(route.intent, "SERVICE_GUIDE");
  assert.deepEqual(route.capabilityIds, ["NETWORK_ANALYSIS"]);
  assert.deepEqual(capabilities.recommendCapabilities("관계도 분석은 어떻게 사용해?").map((item) => item.id), ["NETWORK_ANALYSIS"]);
});

test("manual-backed feature recommendations do not create a search expression", () => {
  const cases = [
    ["기업들이 같이 등장하는 걸 보고 싶어", "NETWORK_ANALYSIS"],
    ["기사량이 월별로 어떻게 변했는지 보고 싶어", "KEYWORD_TREND"],
    ["관련 키워드를 워드클라우드로 보고 싶어", "RELATED_WORDS"],
    ["기사에서 회사명하고 매출액만 뽑고 싶어", "INFORMATION_EXTRACTION"],
    ["문장에서 사람 이름이랑 기관명을 추출하고 싶어", "MORPHEME_NER"],
    ["내 엑셀 데이터에서 단어 빈도를 그래프로 만들고 싶어", "DATA_VISUALIZATION"],
    ["분석결과를 PDF 보고서로 만들고 싶어", "VISUALIZATION_REPORT"],
    ["지역별 뉴스와 지자체 자료를 같이 분석하고 싶어", "REGIONAL_ISSUE"],
  ];
  for (const [question, capabilityId] of cases) {
    const route = router.routeUserIntent(question, context);
    assert.equal(route.intent, "FEATURE_RECOMMENDATION", question);
    assert.ok(route.capabilityIds.includes(capabilityId), `${question}: ${capabilityId}`);
  }
  assert.equal(router.routeUserIntent("1950년대 신문을 찾아보고 싶어", context).intent, "HISTORICAL_ARTICLE_LOOKUP");
});

test("manual search and service boundaries keep higher-priority intents", () => {
  assert.equal(router.routeUserIntent("AND OR NOT은 어떻게 써?", context).intent, "SERVICE_GUIDE");
  assert.equal(router.routeUserIntent("인공지능이나 빅데이터 둘 중 하나만 들어가면 돼", context).intent, "SEARCH_NEW");
  assert.equal(router.routeUserIntent("검색 결과가 너무 많아", context).intent, "SEARCH_RESULT_DIAGNOSIS");
  assert.equal(router.routeUserIntent("현재 빅카인즈 기사 정확히 몇 건이야?", context).intent, "SERVICE_FACT");
  assert.equal(router.routeUserIntent("API 데이터 다운로드 방법 알려줘", context).intent, "OPEN_API_REDIRECT");
  assert.equal(router.routeUserIntent("이 기사 전체를 요약해줘", context).intent, "ARTICLE_UNSUPPORTED");
});

test("capability comparison is deterministic and does not build a search query", () => {
  const route = router.routeUserIntent("관계도와 연관어 분석은 뭐가 달라?", context);
  assert.equal(route.intent, "FEATURE_RECOMMENDATION");
  assert.deepEqual(route.capabilityIds, ["NETWORK_ANALYSIS", "RELATED_WORDS"]);
  assert.match(page, /capabilityComparison/);
  assert.match(page, /기능 비교/);
});

test("manual guide source and anonymous insight event are wired without raw question storage", () => {
  assert.match(page, /manual-knowledge\.js/);
  assert.match(page, /USER_MANUAL_V4_2/);
  assert.match(page, /매뉴얼 근거 보기/);
  assert.match(page, /manualReference/);
  assert.match(page, /matched\?\.section/);
  assert.match(page, /MANUAL_GUIDE_USED/);
  assert.match(insights, /MANUAL_GUIDE_USED/);
  assert.doesNotMatch(insights, /rawQuestion/);
});
