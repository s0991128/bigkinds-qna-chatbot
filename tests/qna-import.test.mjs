import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const sandbox = { window: {} };
for (const file of [
  "../public/data/qna-import.js",
  ...Array.from({ length: 21 }, (_, index) => `../public/data/qna-data-${String(index + 1).padStart(2, "0")}.js`),
]) {
  vm.runInNewContext(await readFile(new URL(file, import.meta.url), "utf8"), sandbox, { filename: file });
}

const qna = sandbox.window.BIGKINDS_IMPORTED_QNA;
const meta = sandbox.window.BIGKINDS_IMPORTED_QNA_META;
const serializedQna = JSON.stringify(qna);
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phonePattern = /(?<!\d)(?:01[016789]|02|0[3-6][1-5])[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/;
const rrnPattern = /(?<!\d)\d{6}[-\s]?\d{7}(?!\d)/;
const htmlPattern = /<\/?(?:p|br|div|span|script|style)\b/i;
const nameWithTitlePattern = /(?<!\[이름\s마스킹\])(?:[가-힣]{2,4})\s*(?:교수님?|선생님?|팀장님?|과장님?|차장님?|부장님?|박사님?)/;

test("official Q&A snapshot has the required coverage and stable IDs", () => {
  assert.equal(meta.snapshotDate, "2026-09-14");
  assert.equal(meta.total, 1419);
  assert.equal(meta.answered, 1413);
  assert.equal(meta.unanswered, 6);
  assert.equal(meta.source, "Q&A답변 목록");
  assert.equal(qna.length, 1419);
  assert.equal(new Set(qna.map((item) => item.id)).size, 1419);
  assert.equal(qna[0].id, "qna-official-0001");
  assert.equal(qna.at(-1).id, "qna-official-1419");
  assert.ok(qna.every((item) => item.id.startsWith("qna-")));
  assert.equal(qna.filter((item) => item.hasOfficialAnswer).length, 1413);
  assert.equal(qna.filter((item) => !item.hasOfficialAnswer).length, 6);
});

test("every Q&A is review-only and contains the required public fields", () => {
  for (const item of qna) {
    assert.ok(item.title);
    assert.ok(item.effectiveDate);
    assert.ok(item.source?.label);
    assert.ok(Array.isArray(item.keywords));
    assert.equal(item.status, "REVIEW_REQUIRED");
    assert.equal(item.requiresReview, true);
    if (item.hasOfficialAnswer) {
      assert.equal(item.answerMode, "INTERNAL_REFERENCE");
      assert.equal(item.alwaysEscalate, undefined);
    } else {
      assert.equal(item.answer, "현재 이 문의에는 공식 답변이 등록되어 있지 않습니다.");
      assert.equal(item.answerMode, "HANDOFF_ONLY");
      assert.equal(item.alwaysEscalate, true);
    }
  }
});

test("public Q&A snapshot has no raw markup, personal contact data, URLs, or responder field", () => {
  assert.equal(emailPattern.test(serializedQna), false);
  assert.equal(phonePattern.test(serializedQna), false);
  assert.equal(rrnPattern.test(serializedQna), false);
  assert.equal(htmlPattern.test(serializedQna), false);
  assert.equal(nameWithTitlePattern.test(serializedQna), false);
  assert.equal(/(?:https?:\/\/|www\.)/i.test(serializedQna), false);
  assert.ok(qna.every((item) => !("responder" in item) && !("answerer" in item) && !("답변자" in item)));
});

test("representative first, recent answered, and recent unanswered records are imported", () => {
  assert.equal(qna.find((item) => item.id === "qna-official-0001")?.title, "시각화 서비스 중 키워드 트렌드 관련 문의 드립니다.");
  assert.ok(qna.some((item) => item.title === "공공기관연계3" && item.hasOfficialAnswer));
  assert.ok(qna.some((item) => item.title.toLowerCase() === "openapi 사용 문의" && !item.hasOfficialAnswer));
});

test("Q&A coverage increases without promoting the grounded-answer scope", async () => {
  const runtime = { window: {} };
  for (const file of [
    "../public/data/config.js",
    "../public/data/official-faq.js",
    "../public/data/verified-policy.js",
    "../public/data/qna-import.js",
    ...Array.from({ length: 21 }, (_, index) => `../public/data/qna-data-${String(index + 1).padStart(2, "0")}.js`),
    "../public/data/support-manual.js",
    "../public/data/openapi-reference.js",
    "../public/data/knowledge-base.js",
    "../public/data/official-intro.js",
    "../public/data/manual-knowledge.js",
    "../public/data/historical-lookup.js",
  ]) {
    vm.runInNewContext(await readFile(new URL(file, import.meta.url), "utf8"), runtime, { filename: file });
  }
  const documents = runtime.window.BIGKINDS_KNOWLEDGE_BASE.documents;
  const normalizedDocuments = documents.map((document) => ({
    ...document,
    authority: document.authority ?? (document.id.startsWith("official-faq-") ? "OFFICIAL_FAQ" : document.id.startsWith("bigkinds-intro-") ? "CURRENT_OFFICIAL_INTRO" : document.id.startsWith("manual-") ? "USER_MANUAL_V4_2" : document.id.startsWith("qna-") ? "VERIFIED_QNA" : "CURRENT_POLICY"),
    status: document.status === "SUPERSEDED" ? "SUPERSEDED" : document.requiresReview === true || document.alwaysEscalate === true ? "REVIEW_REQUIRED" : document.status ?? (document.id.startsWith("qna-") ? "REVIEW_REQUIRED" : "CURRENT"),
    answerMode: document.answerMode ?? (document.requiresReview === true || document.alwaysEscalate === true ? "HANDOFF_ONLY" : "USER_FACING"),
  }));
  const answerableAuthorities = new Set(["CURRENT_CANONICAL", "CURRENT_OFFICIAL_INTRO", "CURRENT_OFFICIAL_GUIDE", "CURRENT_GUIDE", "CURRENT_POLICY", "USER_MANUAL_V4_2", "OFFICIAL_FAQ", "VERIFIED_QNA"]);
  const grounded = new Set(normalizedDocuments
    .filter((item) => item.status === "CURRENT" && item.requiresReview !== true && item.alwaysEscalate !== true && item.answerMode !== "HANDOFF_ONLY" && item.answerMode !== "INTERNAL_REFERENCE" && answerableAuthorities.has(item.authority))
    .map((item) => item.id));
  assert.equal(documents.filter((item) => item.id.startsWith("qna-")).length, 1419);
  assert.equal(documents.filter((item) => item.id.startsWith("official-faq-")).length, 23);
  assert.equal(grounded.size, 67);
  assert.equal(documents.filter((item) => item.id.startsWith("article-body-")).length, 0);
});
