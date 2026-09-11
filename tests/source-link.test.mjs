import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

const source = ts.transpileModule(
  await (await import("node:fs/promises")).readFile(new URL("../lib/source-link.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const moduleRecord = { exports: {} };
new Function("exports", "module", source)(moduleRecord.exports, moduleRecord);
const { getDocumentSourceUrl } = moduleRecord.exports;

test("manual source links target the official PDF page", () => {
  assert.equal(
    getDocumentSourceUrl({
      sourceType: "USER_MANUAL",
      source: { url: "https://www.bigkinds.or.kr/manual/%EB%B9%85%EC%B9%B4%EC%9D%B8%EC%A6%88_%EC%82%AC%EC%9A%A9%EC%9E%90%EB%A7%A4%EB%89%B4%EC%96%BC.pdf" },
      pdfPageStart: 44,
    }),
    "https://www.bigkinds.or.kr/manual/%EB%B9%85%EC%B9%B4%EC%9D%B8%EC%A6%88_%EC%82%AC%EC%9A%A9%EC%9E%90%EB%A7%A4%EB%89%B4%EC%96%BC.pdf#page=44",
  );
});

test("non-manual source links remain unchanged", () => {
  assert.equal(
    getDocumentSourceUrl({ sourceType: "OFFICIAL_FAQ", source: { url: "https://www.bigkinds.or.kr/faq" }, pdfPageStart: 44 }),
    "https://www.bigkinds.or.kr/faq",
  );
});
