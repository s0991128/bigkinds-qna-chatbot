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

await loadTypeScript("../lib/search-query-builder.ts");
const lookup = await loadTypeScript("../lib/article-lookup.ts");
const strategies = await loadTypeScript("../lib/article-lookup-strategy.ts");
const builder = await loadTypeScript("../lib/search-query-builder.ts");

test("historical lookup extracts a month, media, organization, and award-list signal", () => {
  const articleCase = lookup.extractArticleLookupCase("1997년 7월 매일경제에 나온 아시아나 수상자 명단을 찾고 싶어요", "2026-09-09T00:00:00.000Z");
  assert.equal(articleCase.period.precision, "MONTH");
  assert.equal(articleCase.period.from, "1997-07-01");
  assert.equal(articleCase.period.to, "1997-07-31");
  assert.deepEqual(articleCase.media, ["매일경제"]);
  assert.ok(articleCase.organizations.includes("아시아나"));
  assert.equal(articleCase.materialType, "AWARD_LIST");
});

test("historical lookup extracts an exact date and page hint", () => {
  const articleCase = lookup.extractArticleLookupCase("1996년 7월 2일자 37면을 찾고 싶어요", "2026-09-09T00:00:00.000Z");
  assert.equal(articleCase.period.precision, "EXACT");
  assert.equal(articleCase.period.from, "1996-07-02");
  assert.ok(articleCase.pageHints.includes("37면"));
  assert.equal(articleCase.materialType, "PAGE");
});

test("period handling uses a deterministic month range and widening range", () => {
  const articleCase = lookup.extractArticleLookupCase("1997년 7월 전후 매일경제 아시아나 표창 명단", "2026-09-09T00:00:00.000Z");
  assert.equal(articleCase.period.from, "1997-06-01");
  assert.equal(articleCase.period.to, "1997-08-31");
  const monthCase = lookup.extractArticleLookupCase("1997년 7월 매일경제 아시아나 표창", "2026-09-09T00:00:00.000Z");
  const expanded = strategies.buildLookupStrategies(monthCase).find((item) => item.id === "lookup-expand-period");
  assert.equal(expanded?.dateFrom, "1997-06-01");
  assert.equal(expanded?.dateTo, "1997-08-31");
});

test("every lookup strategy query is built by the shared search query builder", () => {
  const articleCase = lookup.extractArticleLookupCase("1997년 7월 매일경제 아시아나 노동부장관 표창 명단", "2026-09-09T00:00:00.000Z");
  const items = strategies.buildLookupStrategies(articleCase);
  assert.ok(items.length >= 2);
  for (const item of items) assert.equal(item.query, builder.buildSearchQuery(item.searchInput));
});

test("NOT_FOUND response is bounded and does not claim the material does not exist", () => {
  const articleCase = lookup.extractArticleLookupCase("1997년 7월 매일경제 아시아나 표창 명단", "2026-09-09T00:00:00.000Z");
  const draft = lookup.createLookupReplyDraft(articleCase, "NOT_FOUND");
  assert.match(draft, /현재 확인한 검색조건에서는/);
  assert.doesNotMatch(draft, /자료가 존재하지/);
  assert.equal(lookup.createLookupReplyDraft(articleCase, null), null);
});

test("lookup journey keeps result confirmation user-driven without automatic result collection", () => {
  const articleCase = lookup.extractArticleLookupCase("1997년 7월 매일경제 아시아나 표창 명단", "2026-09-09T00:00:00.000Z");
  const items = strategies.buildLookupStrategies(articleCase);
  assert.ok(items.length > 0);
  assert.equal(articleCase.status, "READY");
  const draft = lookup.createLookupReplyDraft(articleCase, "CANDIDATE");
  assert.match(draft, /추가 확인이 필요/);
});
