import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const policySource = await readFile(new URL("../public/data/verified-policy.js", import.meta.url), "utf8");
const policySandbox = { window: {} };
vm.runInNewContext(policySource, policySandbox, { filename: "verified-policy.js" });
const policies = policySandbox.window.BIGKINDS_VERIFIED_POLICY;

const policySafetySource = await readFile(new URL("../lib/policy-safety.ts", import.meta.url), "utf8");
const policySafetyOutput = ts.transpileModule(policySafetySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const policySafetyModule = { exports: {} };
new Function("exports", "module", policySafetyOutput)(policySafetyModule.exports, policySafetyModule);
const policySafety = policySafetyModule.exports;

test("policy documents without current canonical permission require handoff", () => {
  for (const id of ["api-purchase-official", "api-data-use-boundaries", "academic-research-data"]) {
    const policy = policies.find((document) => document.id === id);
    assert.equal(policy.answerMode, "HANDOFF_ONLY");
    assert.equal(policy.requiresReview, true);
    assert.equal(policy.alwaysEscalate, true);
  }
});

test("policy questions are classified without estimating permission or price", () => {
  for (const question of [
    "뉴스를 상업적으로 이용해도 되나요?",
    "기사 저작권과 원문 이용권이 궁금해요",
    "API 요금과 계약 기간을 알려줘",
    "AI 학습에 재이용해도 되나요?",
    "연구 목적 라이선스를 받을 수 있나요?",
    "유료 회원에게 기사 제목과 AI 요약을 제공해도 되나요?",
    "다운로드한 기사를 비영리 연구에서 로컬 Python으로 분석해도 되나요?",
    "AI로 뉴스를 요약해서 유료 회원에게 제공해도 되나요?",
  ]) {
    const handoff = policySafety.getPolicyHandoff(question);
    assert.ok(handoff, question);
    assert.match(handoff.guidance, /확인|문의/);
    assert.equal(/\d+\s*원|\d+\s*(?:개월|년)|(?:무료|유료)(?:입니다|로|인|임)|허용(?:합니다|됨)|금지(?:합니다|됨)/.test(handoff.guidance), false);
  }
});
