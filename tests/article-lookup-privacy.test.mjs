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

const lookup = await loadTypeScript("../lib/article-lookup.ts");
const insights = await readFile(new URL("../lib/insights.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("lookup request sanitization removes email, phone, headers, and credentials", () => {
  const request = "From: user@example.com\n전화: 010-1234-5678\n1997년 7월 매일경제 아시아나 표창 명단을 찾고 싶어요. apiKey: secret";
  const sanitized = lookup.sanitizeLookupRequestForHistory(request);
  assert.doesNotMatch(sanitized, /user@example\.com|010-1234-5678|secret|From:/i);
  const articleCase = lookup.extractArticleLookupCase(request, "2026-09-09T00:00:00.000Z");
  const summary = lookup.createArticleLookupHistorySummary(articleCase);
  assert.doesNotMatch(JSON.stringify(summary), /example\.com|010-1234-5678|secret/i);
});

test("lookup person names stay in the active case but are removed from history summaries", () => {
  const request = "1997년 7월 매일경제 홍길동 교수의 표창 명단을 찾고 싶어요.";
  const articleCase = lookup.extractArticleLookupCase(request, "2026-09-11T00:00:00.000Z");
  assert.deepEqual(articleCase.persons, ["홍길동"]);
  const historyText = lookup.sanitizeLookupRequestForHistory(request);
  assert.doesNotMatch(historyText, /홍길동/);
  assert.match(historyText, /인물명 비공개/);
  assert.doesNotMatch(JSON.stringify(lookup.createArticleLookupHistorySummary(articleCase)), /홍길동/);
});

test("lookup insights are categorical and page persistence sanitizes lookup requests", () => {
  for (const eventType of ["ARTICLE_LOOKUP_STARTED", "ARTICLE_LOOKUP_STRATEGY_USED", "ARTICLE_LOOKUP_FOUND", "ARTICLE_LOOKUP_NO_RESULT", "ARTICLE_LOOKUP_CANDIDATE", "ARTICLE_LOOKUP_REPLY_DRAFTED", "ARTICLE_LOOKUP_ESCALATED"]) assert.match(insights, new RegExp(eventType));
  assert.doesNotMatch(insights, /rawQuestion/);
  assert.match(page, /sanitizeLookupRequestForHistory/);
  assert.match(page, /articleLookupRequest/);
  assert.match(page, /key !== "articleLookupContext"/);
});
