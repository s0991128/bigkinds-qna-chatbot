import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../public/data/support-manual.js", import.meta.url), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: "support-manual.js" });
const documents = sandbox.window.BIGKINDS_SUPPORT_MANUAL;
const requiredSections = [
  "search-basic", "search-filter", "search-detail", "download", "member-policy", "profile-edit",
  "audio-feature", "qna", "old-newspaper", "network-analysis", "keyword-trend", "related-words",
  "information-extraction",
];

test("support manual is a curated set and does not load the PDF", () => {
  assert.equal(documents.length, requiredSections.length);
  assert.equal(JSON.stringify(Array.from(documents, (document) => document.section)), JSON.stringify(requiredSections));
  for (const document of documents) {
    assert.equal(document.sourceType, "USER_MANUAL");
    assert.equal(document.answerMode, "USER_FACING");
    assert.equal(document.revisionLabel, "v4.2");
    assert.equal(document.revisionDate, "2025-04-30");
    assert.equal(document.publishedRevisionDate, "2025-04-30");
    assert.match(document.source.url, /\/manual\/.*\.pdf$/);
    assert.ok(document.title);
    assert.ok(document.issueKinds.length > 0);
    assert.ok(document.steps.length > 0);
    assert.ok(document.facts.length > 0);
    assert.ok(typeof document.freshnessSensitive === "boolean");
  }
});

test("curated support answers contain no credential examples or internal counts", () => {
  for (const document of documents) {
    assert.equal(/access[_ -]?key|api[_ -]?key|credential/i.test(document.answer), false);
    assert.equal(/documents\.length|knowledge\.length|data:\w+/i.test(document.answer), false);
  }
});
