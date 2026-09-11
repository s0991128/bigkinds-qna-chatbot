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

const privacy = await loadTypeScript("../lib/privacy-sanitizer.ts");

test("support sanitizer removes fictional contact, phone, resident, credential, and header values", () => {
  const email = ["qa", "example.invalid"].join("@");
  const phone = ["010", "2345", "6789"].join("-");
  const resident = ["900101", "1234567"].join("-");
  const password = ["password", "=", "fake-secret"].join("");
  const input = `From: 홍테스트\n연락처 ${email} ${phone} 주민번호 ${resident} ${password}`;
  const result = privacy.sanitizeText(input);
  assert.ok(result.redactions.includes("EMAIL"));
  assert.ok(result.redactions.includes("PHONE"));
  assert.ok(result.redactions.includes("RESIDENT_NUMBER"));
  assert.ok(result.redactions.includes("CREDENTIAL"));
  assert.doesNotMatch(result.value, /qa@example\.invalid|010-2345-6789|900101-1234567|fake-secret|From:/i);
});

test("sanitizer leaves fictional ordinary names and non-sensitive support text usable", () => {
  const result = privacy.sanitizeText("홍테스트의 검색 필터가 이상해요");
  assert.equal(result.value, "홍테스트의 검색 필터가 이상해요");
  assert.equal(privacy.containsSensitiveData(result.value), false);
});
