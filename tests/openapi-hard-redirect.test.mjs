import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const referenceSource = await readFile(new URL("../public/data/openapi-reference.js", import.meta.url), "utf8");
const referenceSandbox = { window: {} };
vm.runInNewContext(referenceSource, referenceSandbox, { filename: "openapi-reference.js" });
const reference = referenceSandbox.window.BIGKINDS_OPENAPI_REFERENCE;
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const routerSource = await readFile(new URL("../lib/intent-router.ts", import.meta.url), "utf8");

test("Open API reference is internal-only and contains no credential values", () => {
  assert.ok(reference.length > 0);
  for (const document of reference) {
    assert.equal(document.answerMode, "INTERNAL_REFERENCE");
    assert.equal(document.sourceType, "OPENAPI_REFERENCE");
    assert.equal(document.alwaysEscalate, true);
  }
  assert.equal(/access[_ -]?key\s*[:=]\s*[A-Za-z0-9_-]{8,}|api[_ -]?key\s*[:=]\s*[A-Za-z0-9_-]{8,}|credential\s*[:=]/i.test(referenceSource), false);
});

test("Open API redirect remains before policy and knowledge retrieval", () => {
  assert.match(routerSource, /if \(isOpenApiQuestion\(clean\)\) return \{ intent: "OPEN_API_REDIRECT" \}/);
  assert.match(pageSource, /if \(isOpenApiQuestion\(cleanQuestion\)\)/);
  assert.match(pageSource, /const policyHandoff = getPolicyHandoff\(cleanQuestion\)/);
  assert.ok(pageSource.indexOf("if (isOpenApiQuestion(cleanQuestion))") < pageSource.indexOf("const policyHandoff = getPolicyHandoff(cleanQuestion)"));
});
