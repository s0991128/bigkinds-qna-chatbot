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

await loadTypeScript("../lib/privacy-sanitizer.ts");
await loadTypeScript("../lib/support-case.ts");
const supportRouting = await loadTypeScript("../lib/support-routing.ts");
await loadTypeScript("../lib/search-term-normalizer.ts");
await loadTypeScript("../lib/search-query-builder.ts");
await loadTypeScript("../lib/search-context.ts");
await loadTypeScript("../lib/diagnostic-flows.ts");
await loadTypeScript("../lib/capabilities.ts");
await loadTypeScript("../lib/article-lookup.ts");
await loadTypeScript("../lib/question-intents.ts");
const router = await loadTypeScript("../lib/intent-router.ts");

const base = { hasSearchContext: false, pageType: "HOME" };

test("support routing returns multiple issues for one question", () => {
  assert.deepEqual(
    supportRouting.detectSupportIssues("검색결과가 0건이고 다운로드한 파일도 열리지 않아요"),
    ["SEARCH_NO_RESULT", "DOWNLOAD_PROBLEM"],
  );
});

test("OPEN API wins over every support issue", () => {
  assert.equal(router.routeUserIntent("OPEN API 인증키 오류와 다운로드 문제", base).intent, "OPEN_API_REDIRECT");
});

test("rights questions win over article unsupported and support-only diagnosis keeps compatibility", () => {
  assert.equal(router.routeUserIntent("연구 목적으로 기사 원문을 이용하고 싶어요", base).intent, "SUPPORT_TRIAGE");
  assert.equal(router.routeUserIntent("이 기사 저작권과 라이선스가 궁금해", base).intent, "SUPPORT_TRIAGE");
  assert.equal(router.routeUserIntent("검색 결과가 0건이에요", base).intent, "SEARCH_RESULT_DIAGNOSIS");
});

test("ordinary download guidance is not mislabeled as a support problem", () => {
  assert.notEqual(router.routeUserIntent("검색결과를 엑셀로 받을 수 있어?", base).intent, "SUPPORT_TRIAGE");
});
