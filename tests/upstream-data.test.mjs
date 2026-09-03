import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const sandbox = { window: {} };
for (const file of [
  "../public/data/official-faq.js",
  "../public/data/verified-policy.js",
  "../public/data/qna-import.js",
  ...Array.from({ length: 21 }, (_, index) => `../public/data/qna-data-${String(index + 1).padStart(2, "0")}.js`),
  "../public/data/knowledge-base.js",
]) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  vm.runInNewContext(source, sandbox, { filename: file });
}

const kb = sandbox.window.BIGKINDS_KNOWLEDGE_BASE;

test("downloaded upstream data is merged into one knowledge base", () => {
  assert.ok(kb.documents.length >= 36);
  assert.equal(kb.documents.filter((item) => item.id.startsWith("official-faq-")).length, 23);
  assert.ok(kb.documents.some((item) => item.id === "api-pricing"));
  assert.ok(kb.documents.some((item) => item.id === "api-purchase-official"));
  assert.ok(kb.documents.some((item) => item.id === "privacy-security"));
});

test("every downloaded document contains answer and provenance metadata", () => {
  const ids = new Set();
  for (const document of kb.documents) {
    assert.ok(document.id && document.title && document.answer);
    assert.ok(document.effectiveDate);
    assert.ok(document.source?.label);
    assert.ok(Array.isArray(document.keywords) && document.keywords.length);
    assert.equal(ids.has(document.id), false);
    ids.add(document.id);
  }
});
