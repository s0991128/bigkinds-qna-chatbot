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
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
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
await loadTypeScript("../lib/article-lookup.ts");
await loadTypeScript("../lib/question-intents.ts");
const router = await loadTypeScript("../lib/intent-router.ts");

const base = { hasSearchContext: false, hasArticleLookupContext: false, pageType: "HOME" };

test("historical material requests use the dedicated lookup intent", () => {
  assert.equal(router.routeUserIntent("1997년 7월 매일경제에 나온 아시아나 수상자 명단을 찾고 싶어요", base).intent, "HISTORICAL_ARTICLE_LOOKUP");
  assert.equal(router.routeUserIntent("1996년 7월 2일자 37면을 찾고 싶어요", base).intent, "HISTORICAL_ARTICLE_LOOKUP");
});

test("historical lookup does not steal service, article, API, or ordinary search intents", () => {
  assert.equal(router.routeUserIntent("1990년대 이전 뉴스도 검색되나요?", base).intent, "SERVICE_FACT");
  assert.equal(router.routeUserIntent("AI 반도체 기사 찾아줘", base).intent, "SEARCH_NEW");
  assert.equal(router.routeUserIntent("이 기사 요약해줘", base).intent, "ARTICLE_UNSUPPORTED");
  assert.equal(router.routeUserIntent("OPEN API로 1997년 자료를 받고 싶어", base).intent, "OPEN_API_REDIRECT");
});

test("lookup updates are separate from SearchContext updates", () => {
  const route = router.routeUserIntent("기간을 1997년 6~8월로 넓혀줘", { ...base, hasArticleLookupContext: true });
  assert.equal(route.intent, "HISTORICAL_ARTICLE_LOOKUP");
  assert.equal(route.articleLookupUpdate, true);
});
