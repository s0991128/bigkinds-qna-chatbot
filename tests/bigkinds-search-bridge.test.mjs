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

const bridge = await loadTypeScript("../lib/bigkinds-search-bridge.ts");

test("query-only transfer preserves the existing empty filter contract", () => {
  const payload = bridge.buildBigKindsSearchPayload("AI AND 반도체");
  assert.equal(payload.searchKey, "AI AND 반도체");
  assert.equal(payload.startDate, "");
  assert.equal(payload.endDate, "");
  assert.deepEqual(payload.providerCodes, []);
});

test("historical transfer carries dates and official provider codes", () => {
  const strategy = { query: "아시아나", dateFrom: "1997-06-01", dateTo: "1997-08-31", media: ["매일경제", "경제신문"] };
  const transfer = bridge.createSearchTransfer(strategy);
  assert.deepEqual(transfer.providerCodes, ["02100101"]);
  assert.deepEqual(bridge.resolveProviderCodes(["매일경제", "경제신문", "매일 경제"]), ["02100101"]);
  assert.deepEqual(bridge.buildBigKindsSearchPayload(transfer), {
    indexName: "news",
    searchKey: "아시아나",
    searchKeys: [{}],
    searchFilterType: "1",
    searchScopeType: "1",
    searchSortType: "date",
    sortMethod: "date",
    startDate: "1997-06-01",
    endDate: "1997-08-31",
    providerCodes: ["02100101"],
    categoryCodes: [],
    incidentCodes: [],
    dateCodes: [],
  });
});
