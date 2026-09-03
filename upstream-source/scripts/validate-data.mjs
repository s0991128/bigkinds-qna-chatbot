import { readFile } from "node:fs/promises";
import vm from "node:vm";

const files = [
  "../public/data/official-faq.js",
  "../public/data/verified-policy.js",
  "../public/data/qna-import.js",
  "../public/data/knowledge-base.js"
];
const sandbox = { window: {} };

for (const file of files) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  vm.runInNewContext(source, sandbox, { filename: file });
}

const kb = sandbox.window.BIGKINDS_KNOWLEDGE_BASE;
const errors = [];
const ids = new Set();

for (const [index, document] of kb.documents.entries()) {
  const at = `documents[${index}]`;
  for (const key of ["id", "category", "title", "answer", "effectiveDate", "source"]) {
    if (!document[key]) errors.push(`${at}.${key} 누락`);
  }
  if (ids.has(document.id)) errors.push(`${at}.id 중복: ${document.id}`);
  ids.add(document.id);
  if (!Array.isArray(document.keywords) || !document.keywords.length) {
    errors.push(`${at}.keywords 누락`);
  }
}

const officialFaqCount = kb.documents.filter((document) => document.id.startsWith("official-faq-")).length;
if (officialFaqCount !== 23) errors.push(`공식 FAQ 건수 오류: ${officialFaqCount}/23`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`${kb.documents.length}개 문서 검증 완료 · 공식 FAQ ${officialFaqCount}건 (${kb.updatedAt})`);

