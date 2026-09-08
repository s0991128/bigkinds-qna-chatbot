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

const normalizer = await loadTypeScript("../lib/search-term-normalizer.ts");
const queryBuilder = await loadTypeScript("../lib/search-query-builder.ts");
const context = await loadTypeScript("../lib/search-context.ts");
const intents = await loadTypeScript("../lib/question-intents.ts");

const empty = { all: [], any: [], exact: [], exclude: [] };

test("NEW는 이전 검색어를 상속하지 않고 현재 turn으로 교체한다", () => {
  const previous = { all: ["AI", "반도체"], any: [], exact: [], exclude: ["주가"] };
  const next = context.applySearchTurn(previous, {
    mode: "NEW",
    searchInput: { all: [], any: ["기후변화", "탄소중립"], exact: [], exclude: [] },
  });
  assert.deepEqual(next, { all: [], any: ["기후변화", "탄소중립"], exact: [], exclude: [] });
  assert.equal(queryBuilder.buildSearchQuery(next), "(기후변화 OR 탄소중립)");
});

test("UPDATE patch는 영향받지 않은 조건을 보존한다", () => {
  const previous = { all: ["AI", "반도체"], any: [], exact: [], exclude: [] };
  const next = context.applySearchTurn(previous, { mode: "UPDATE", patch: { add: { exclude: ["주가"] } } });
  assert.deepEqual(next, { all: ["AI", "반도체"], any: [], exact: [], exclude: ["주가"] });
  assert.equal(queryBuilder.buildSearchQuery(next), "AI AND 반도체 AND NOT 주가");
});

test("UPDATE remove와 exclude add를 함께 적용한다", () => {
  const previous = { all: ["AI", "반도체"], any: [], exact: [], exclude: ["주가"] };
  const next = context.applySearchTurn(previous, {
    mode: "UPDATE",
    patch: { remove: { all: ["반도체"] }, add: { exclude: ["반도체"] } },
  });
  assert.deepEqual(next, { all: ["AI"], any: [], exact: [], exclude: ["주가", "반도체"] });
});

test("NOT_SEARCH와 DIAGNOSIS는 SearchContext를 변경하지 않는다", () => {
  const previous = { all: ["AI"], any: [], exact: [], exclude: [] };
  assert.deepEqual(context.applySearchTurn(previous, { mode: "NOT_SEARCH" }), previous);
  assert.deepEqual(context.applySearchTurn(previous, { mode: "DIAGNOSIS" }), previous);
  assert.deepEqual(context.applySearchTurn(null, { mode: "NOT_SEARCH" }), null);
  assert.deepEqual(empty, { all: [], any: [], exact: [], exclude: [] });
});

test("exact phrase는 일반 검색어 정규화와 분리된다", () => {
  const next = context.applySearchTurn(null, {
    mode: "NEW",
    searchInput: { all: [normalizer.normalizeSearchTerm("탄핵당한")[0]], any: [], exact: ["4차 산업혁명"], exclude: [] },
  });
  assert.deepEqual(next, { all: ["탄핵"], any: [], exact: ["4차 산업혁명"], exclude: [] });
});

test("검색식 validator는 명령형·질문형 garbage를 제거하고 exact phrase는 보존한다", () => {
  const validated = queryBuilder.validateSearchInput({
    all: ["AI", "포함해줘", "언급되는지", "기사"],
    any: ["검색결과", "반도체"],
    exact: ["탄핵당한 대통령"],
    exclude: ["주가"],
  });
  assert.deepEqual(validated, {
    all: ["AI"],
    any: ["반도체"],
    exact: ["탄핵당한 대통령"],
    exclude: ["주가"],
  });
});

test("Sequence A는 NEW 교체와 UPDATE patch를 엄격히 구분한다", () => {
  const q1 = intents.classifySearchTurn("AI 반도체 관련 기사를 찾고 싶어요.", false);
  assert.equal(q1.mode, "NEW");
  let state = context.applySearchTurn(null, q1);
  assert.equal(queryBuilder.buildSearchQuery(state), "AI AND 반도체");

  const q2 = intents.classifySearchTurn("주가는 빼줘.", true);
  assert.equal(q2.mode, "UPDATE");
  state = context.applySearchTurn(state, q2);
  assert.equal(queryBuilder.buildSearchQuery(state), "AI AND 반도체 AND NOT 주가");

  const q3 = intents.classifySearchTurn("전기차도 꼭 넣어줘.", true);
  assert.equal(q3.mode, "UPDATE");
  state = context.applySearchTurn(state, q3);
  assert.equal(queryBuilder.buildSearchQuery(state), "AI AND 반도체 AND 전기차 AND NOT 주가");

  const q4 = intents.classifySearchTurn("기후변화나 탄소중립 둘 중 하나가 들어간 기사만 찾고 싶어.", true);
  assert.equal(q4.mode, "NEW");
  state = context.applySearchTurn(state, q4);
  assert.equal(queryBuilder.buildSearchQuery(state), "(기후변화 OR 탄소중립)");
  assert.deepEqual(state, { all: [], any: ["기후변화", "탄소중립"], exact: [], exclude: [] });
});

test("Sequence B-D는 새 검색·비검색·정확문구를 오염 없이 처리한다", () => {
  let state = { all: [], any: ["기후변화", "탄소중립"], exact: [], exclude: [] };
  const addCompany = intents.classifySearchTurn("기업도 꼭 들어가야 해.", true);
  assert.equal(addCompany.mode, "UPDATE");
  state = context.applySearchTurn(state, addCompany);
  assert.equal(queryBuilder.buildSearchQuery(state), "(기후변화 OR 탄소중립) AND 기업");

  const exactNew = intents.classifySearchTurn("정확히 \"4차 산업혁명\"이라는 표현이 들어가고 인공지능도 포함된 기사 찾고 싶어.", true);
  assert.equal(exactNew.mode, "NEW");
  state = context.applySearchTurn(state, exactNew);
  assert.equal(queryBuilder.buildSearchQuery(state), "인공지능 AND \"4차 산업혁명\"");
  assert.deepEqual(state, { all: ["인공지능"], any: [], exact: ["4차 산업혁명"], exclude: [] });

  const politicalNew = intents.classifySearchTurn("윤석열 대통령이 탄핵당한 기사를 찾고 싶어.", true);
  assert.equal(politicalNew.mode, "NEW");
  state = context.applySearchTurn(state, politicalNew);
  assert.deepEqual(state, { all: ["윤석열", "대통령", "탄핵"], any: [], exact: [], exclude: [] });

  const notSearch = intents.classifySearchTurn("손흥민 오늘 골 넣었어?", true);
  assert.equal(notSearch.mode, "NOT_SEARCH");
  assert.deepEqual(context.applySearchTurn(state, notSearch), state);
});
