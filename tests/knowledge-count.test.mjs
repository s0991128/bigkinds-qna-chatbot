import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/search.ts", import.meta.url), "utf8");

function loadSearchModule() {
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const commonJsModule = { exports: {} };
  const factory = new Function("require", "module", "exports", transpiled);
  factory(() => ({ faqItems: [] }), commonJsModule, commonJsModule.exports);
  return commonJsModule.exports;
}

test("official grounded-document count deduplicates IDs and excludes non-user-facing documents", () => {
  const { countOfficialGroundedDocuments } = loadSearchModule();
  const base = {
    id: "official-1",
    question: "질문",
    answer: "답변",
    keywords: [],
    category: "정책",
    status: "CURRENT",
    authority: "OFFICIAL_FAQ",
    answerMode: "USER_FACING",
  };
  assert.equal(countOfficialGroundedDocuments([
    base,
    { ...base },
    { ...base, id: "review-1", status: "REVIEW_REQUIRED" },
    { ...base, id: "handoff-1", answerMode: "HANDOFF_ONLY" },
    { ...base, id: "internal-1", answerMode: "INTERNAL_REFERENCE" },
    { ...base, id: "superseded-1", status: "SUPERSEDED" },
    { ...base, id: "manual-1", authority: "USER_MANUAL_V4_2" },
  ]), 2);
});
