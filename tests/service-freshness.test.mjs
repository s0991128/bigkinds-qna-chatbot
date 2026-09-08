import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../public/data/official-intro.js", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const sandbox = { window: { BIGKINDS_KNOWLEDGE_BASE: { documents: [] } } };
vm.runInNewContext(source, sandbox, { filename: "official-intro.js" });

const kb = sandbox.window.BIGKINDS_KNOWLEDGE_BASE;
const documentById = (id) => kb.documents.find((document) => document.id === id);

test("service KB uses the current canonical date and authority", () => {
  assert.equal(kb.updatedAt, "2026-09-08");
  for (const id of [
    "bigkinds-canonical-coverage",
    "bigkinds-canonical-download",
    "bigkinds-canonical-fulltext-download",
  ]) {
    const document = documentById(id);
    assert.equal(document.authority, "CURRENT_CANONICAL");
    assert.equal(document.effectiveDate, "2026-09-08");
  }
});

test("old-news answers separate general search from the newspaper archive", () => {
  const document = documentById("bigkinds-canonical-coverage");
  assert.match(document.answer, /일반 BIGKinds 뉴스검색은 1990년 이후/);
  assert.match(document.answer, /고신문.*1883년대부터 1966년까지/);
  assert.match(document.facts.join(" "), /일반 BIGKinds 뉴스검색: 1990년 이후/);
});

test("Excel answers distinguish metadata and analysis downloads from full text", () => {
  const document = documentById("bigkinds-canonical-download");
  assert.match(document.answer, /뉴스 메타정보와 분석결과/);
  assert.match(document.answer, /Excel/);
  assert.match(document.answer, /기사 본문 전체를 내려받는 것과는 다르며/);
});

test("full-text Excel questions receive copyright and NewsStore guidance", () => {
  const document = documentById("bigkinds-canonical-fulltext-download");
  assert.match(document.answer, /메타정보·분석결과.*Excel/);
  assert.match(document.answer, /기사 본문 전체/);
  assert.match(document.answer, /저작권.*뉴스스토어/);
  assert.match(document.facts.join(" "), /일반 Excel 다운로드와 기사 본문 전체 이용은 별개/);
});

test("article-scale answers use an approximate official-intro basis", () => {
  const document = documentById("bigkinds-intro-data-scale");
  assert.match(document.answer, /공식 소개 페이지 기준/);
  assert.match(document.answer, /104개 매체/);
  assert.match(document.answer, /약 1억여 건/);
  assert.match(document.answer, /실시간 DB의 정확한 총 건수로 단정.*아닙니다/);
});

test("internal knowledge-document counts are not shown in the UI", () => {
  assert.doesNotMatch(page, /공식 문서 \$\{knowledge\.length\}건/);
  assert.doesNotMatch(page, /<strong>\{knowledge\.length\}<\/strong><span>검색 문서<\/span>/);
  assert.match(page, /공식 문서 기반 · 기사 원문 미저장/);
});
