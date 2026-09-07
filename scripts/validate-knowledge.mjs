import { readdir, readFile } from "node:fs/promises";
import vm from "node:vm";

const dataDirectory = new URL("../public/data/", import.meta.url);
const qnaFiles = (await readdir(dataDirectory)).filter((name) => /^qna-data-\d+\.js$/.test(name)).sort();
const files = ["official-faq.js", "qna-import.js", ...qnaFiles, "knowledge-base.js", "official-intro.js"];
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of files) vm.runInContext(await readFile(new URL(file, dataDirectory), "utf8"), sandbox, { filename: file });

const documents = sandbox.window.BIGKINDS_KNOWLEDGE_BASE?.documents || [];
const errors = [];
const ids = new Set();
const syntheticIds = new Set(["api-pricing", "api-application", "api-errors", "data-coverage", "news-search", "api-search-parameters", "api-services", "api-ai-use-restriction", "privacy-security", "service-terms"]);
for (const [index, document] of documents.entries()) {
  if (!document.id || ids.has(document.id)) errors.push(`documents[${index}] id 누락 또는 중복`);
  ids.add(document.id);
  if (syntheticIds.has(document.id)) errors.push(`합성 문서가 남아 있음: ${document.id}`);
  for (const key of ["category", "title", "answer", "effectiveDate", "source"]) if (!document[key]) errors.push(`documents[${index}].${key} 누락`);
  if (document.id.startsWith("qna-") && (document.authority !== "HISTORICAL_QNA" || document.status !== "REVIEW_REQUIRED" || document.reviewClass !== "STATIC_ONLY")) errors.push(`Q&A 권한 오류: ${document.id}`);
}
const faqCount = documents.filter((document) => document.id.startsWith("official-faq-")).length;
const introCount = documents.filter((document) => document.id.startsWith("bigkinds-intro-")).length;
const qnaCount = documents.filter((document) => document.id.startsWith("qna-")).length;
if (faqCount !== 23) errors.push(`공식 FAQ 건수 오류: ${faqCount}/23`);
if (introCount !== 5) errors.push(`공식 소개 건수 오류: ${introCount}/5`);
if (qnaCount !== 708) errors.push(`Q&A 건수 오류: ${qnaCount}/708`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`${documents.length}개 canonical 문서 검증 완료 · FAQ ${faqCount} · 소개 ${introCount} · Q&A ${qnaCount}`);
