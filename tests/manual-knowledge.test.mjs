import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../public/data/manual-knowledge.js", import.meta.url), "utf8");
const searchSource = await readFile(new URL("../lib/search.ts", import.meta.url), "utf8");
const sandbox = { window: { BIGKINDS_KNOWLEDGE_BASE: { documents: [] } } };
vm.runInNewContext(source, sandbox, { filename: "manual-knowledge.js" });
const kb = sandbox.window.BIGKINDS_KNOWLEDGE_BASE;
const manualDocuments = kb.documents;
const byId = (id) => manualDocuments.find((document) => document.id === id);

test("manual KB contains v4.2 source and procedure chunks", () => {
  assert.equal(kb.manualSource.version, "4.2");
  assert.equal(kb.manualSource.effectiveDate, "2025-04-30");
  assert.equal(kb.manualSource.pageCount, 112);
  assert.ok(manualDocuments.length >= 20);
  for (const document of manualDocuments) {
    assert.equal(document.sourceType, "USER_MANUAL");
    assert.equal(document.version, "4.2");
    assert.equal(document.effectiveDate, "2025-04-30");
    assert.equal(document.authority, "USER_MANUAL_V4_2");
    assert.ok(document.section);
    assert.ok(Number.isInteger(document.manualPageStart));
    assert.ok(Number.isInteger(document.manualPageEnd));
    assert.ok(Number.isInteger(document.pdfPageStart));
    assert.ok(Number.isInteger(document.pdfPageEnd));
    assert.equal(document.source.document, "빅카인즈_사용자매뉴얼.pdf");
    assert.ok(Array.isArray(document.capabilityIds));
    assert.ok(Array.isArray(document.cautions));
  }
});

test("manual chunks cover the required capability mapping", () => {
  for (const id of [
    "manual-search-operators",
    "manual-network-analysis",
    "manual-keyword-trend",
    "manual-related-words",
    "manual-information-extraction",
    "manual-morpheme-ner",
    "manual-data-visualization",
    "manual-report-create",
    "manual-regional-issue",
    "manual-old-newspaper",
    "manual-download",
  ]) {
    assert.ok(byId(id), id);
  }
  assert.deepEqual([...byId("manual-network-analysis").capabilityIds], ["NETWORK_ANALYSIS"]);
  assert.deepEqual([...byId("manual-regional-issue").capabilityIds], ["REGIONAL_ISSUE"]);
});

test("manual freshness-sensitive facts do not replace current canonical facts", () => {
  assert.equal(byId("manual-latest-news").freshnessSensitive, true);
  assert.equal(byId("manual-regional-issue").freshnessSensitive, true);
  assert.equal(byId("manual-download").freshnessSensitive, true);
  assert.match(searchSource, /USER_MANUAL_V4_2: 25/);
  assert.match(searchSource, /CURRENT_CANONICAL: 50/);
  assert.match(searchSource, /excludeFreshnessSensitive/);
});

test("manual answer text does not expose raw PDF data or internal document counts", () => {
  for (const document of manualDocuments) {
    assert.equal(/knowledge\.length|documents\.length/.test(document.answer), false);
    assert.equal(document.answer.includes("data:"), false);
    assert.ok(document.answer.length < 1200);
  }
});
