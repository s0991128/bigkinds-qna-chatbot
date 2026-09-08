import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

function loadCommonJs(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleRecord = { exports: {} };
  new Function("exports", "module", output)(moduleRecord.exports, moduleRecord);
  return moduleRecord.exports;
}

const normalizer = loadCommonJs(await readFile(new URL("../lib/search-term-normalizer.ts", import.meta.url), "utf8"));
const queryBuilder = loadCommonJs(await readFile(new URL("../lib/search-query-builder.ts", import.meta.url), "utf8"));

test("한국어 조사와 사건 표현을 검색 핵심어로 정규화한다", () => {
  const cases = [
    { input: ["윤석열", "대통령이", "탄핵당한"], expected: ["윤석열", "대통령", "탄핵"] },
    { input: ["구속된", "기업", "대표"], expected: ["구속", "기업", "대표"] },
    { input: ["체포당한", "피의자"], expected: ["체포", "피의자"] },
    { input: ["대통령으로", "당선된", "후보"], expected: ["대통령", "당선", "후보"] },
    { input: ["파면된", "공직자"], expected: ["파면", "공직자"] },
    { input: ["사퇴한", "대표"], expected: ["사퇴", "대표"] },
  ];

  for (const { input, expected } of cases) {
    const normalized = normalizer.normalizeSearchInput({ all: input, any: [], exact: [], exclude: [] });
    assert.deepEqual(normalized.all, expected);
    assert.ok(normalized.all.every((term) => !term.endsWith("당한") && !term.endsWith("된")));
  }

  const query = queryBuilder.buildSearchQuery(normalizer.normalizeSearchInput({ all: cases[0].input, any: [], exact: [], exclude: [] }));
  assert.equal(query, "윤석열 AND 대통령 AND 탄핵");
  assert.doesNotMatch(query, /탄핵당한|당한/);
});

test("exact phrase와 일반 단어의 경계를 지킨다", () => {
  const normalized = normalizer.normalizeSearchInput({
    all: ["좋은", "많은", "새로운"],
    any: [],
    exact: ["탄핵당한 대통령"],
    exclude: ["기업에서"],
  });
  assert.deepEqual(normalized.all, ["좋은", "많은", "새로운"]);
  assert.deepEqual(normalized.exact, ["탄핵당한 대통령"]);
  assert.deepEqual(normalized.exclude, ["기업"]);
});
