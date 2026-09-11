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
const supportCase = await loadTypeScript("../lib/support-case.ts");

test("support case preserves multiple issue kinds and only stores a sanitized question", () => {
  const question = ["홍테스트", "이메일", ["qa", "example.invalid"].join("@"), "검색결과도 없고 다운로드도 안 돼요"].join(" ");
  const record = supportCase.createSupportCase(question, ["SEARCH_NO_RESULT", "DOWNLOAD_PROBLEM"], "2026-09-11T00:00:00.000Z");
  assert.deepEqual(record.issues, ["SEARCH_NO_RESULT", "DOWNLOAD_PROBLEM"]);
  assert.equal(record.primaryIssue, "SEARCH_NO_RESULT");
  assert.equal(record.summary, "검색결과 없음, 다운로드 문제 문의");
  assert.doesNotMatch(record.sanitizedQuestion, /qa@example\.invalid/);
  assert.equal(supportCase.summarizeSupportCase(record).issues.length, 2);
});

test("empty support case requests more details without inventing an issue", () => {
  const record = supportCase.createSupportCase("빅카인즈 이용 문의", [], "2026-09-11T00:00:00.000Z");
  assert.equal(record.status, "NEEDS_DETAILS");
  assert.equal(record.primaryIssue, null);
  assert.equal(record.summary, "빅카인즈 이용 문의");
});
