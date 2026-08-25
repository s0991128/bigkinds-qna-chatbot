import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const sandbox = { window: {} };
for (const file of [
  "../public/data/official-faq.js",
  "../public/data/verified-policy.js",
  "../public/data/qna-import.js",
  "../public/data/knowledge-base.js"
]) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  vm.runInNewContext(source, sandbox, { filename: file });
}
const kb = sandbox.window.BIGKINDS_KNOWLEDGE_BASE;

test("공식 자료가 모두 지식베이스에 병합된다", () => {
  assert.ok(kb.documents.length >= 36);
  assert.equal(kb.documents.filter((item) => item.id.startsWith("official-faq-")).length, 23);
  assert.ok(kb.documents.some((item) => item.id === "api-pricing"));
  assert.ok(kb.documents.some((item) => item.id === "api-purchase-official"));
});

test("모든 문서에 운영 메타데이터가 있다", () => {
  const ids = new Set();
  for (const document of kb.documents) {
    assert.ok(document.id);
    assert.ok(document.title);
    assert.ok(document.answer);
    assert.ok(document.effectiveDate);
    assert.ok(document.source?.label);
    assert.ok(Array.isArray(document.keywords) && document.keywords.length);
    assert.equal(ids.has(document.id), false);
    ids.add(document.id);
  }
});

test("API 유료화 핵심 사실이 포함된다", () => {
  const pricing = kb.documents.find((item) => item.id === "api-pricing");
  assert.equal(pricing.requiresReview, false);
  assert.match(pricing.answer, /2026년 1월 1일/);
  assert.match(pricing.answer, /2026년 12월 31일/);
  assert.ok(pricing.facts.some((fact) => /11,270원/.test(fact)));
  assert.ok(pricing.facts.some((fact) => /50%/.test(fact)));
});

test("공식 API 신청 경로와 운영 한도가 포함된다", () => {
  const purchase = kb.documents.find((item) => item.id === "api-purchase-official");
  const limits = kb.documents.find((item) => item.id === "api-operational-limits");
  assert.match(purchase.answer, /뉴스토어/);
  assert.ok(purchase.facts.some((fact) => /forms\.gle/.test(fact)));
  assert.match(limits.answer, /10,000건/);
  assert.match(limits.answer, /20,000/);
});

