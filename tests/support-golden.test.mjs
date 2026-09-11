import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const cache = new Map();
async function loadTypeScript(relativePath) {
  const filename = resolve(dirname(fileURLToPath(import.meta.url)), relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const source = await readFile(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const moduleRecord = { exports: {} };
  cache.set(filename, moduleRecord);
  const require = (request) => {
    const dependency = resolve(dirname(filename), `${request}.ts`);
    const dependencySource = cache.get(dependency);
    if (!dependencySource) throw new Error(`Unloaded dependency: ${dependency}`);
    return dependencySource.exports;
  };
  new Function("exports", "module", "require", output)(moduleRecord.exports, moduleRecord, require);
  return moduleRecord.exports;
}

await loadTypeScript("../lib/privacy-sanitizer.ts");
await loadTypeScript("../lib/support-case.ts");
const supportRouting = await loadTypeScript("../lib/support-routing.ts");
await loadTypeScript("../lib/search-term-normalizer.ts");
await loadTypeScript("../lib/search-query-builder.ts");
await loadTypeScript("../lib/search-context.ts");
await loadTypeScript("../lib/diagnostic-flows.ts");
await loadTypeScript("../lib/capabilities.ts");
await loadTypeScript("../lib/article-lookup.ts");
await loadTypeScript("../lib/question-intents.ts");
const router = await loadTypeScript("../lib/intent-router.ts");

const context = { hasSearchContext: false, pageType: "HOME" };
const goldenCases = [
  ["검색결과 없음과 다운로드 실패", "검색결과가 0건이고 다운로드한 파일도 열리지 않아요", ["SEARCH_NO_RESULT", "DOWNLOAD_PROBLEM"]],
  ["검색 필터와 결과 이상", "검색 필터가 적용되지 않고 검색 결과가 이상해요", ["SEARCH_NO_RESULT", "SEARCH_FILTER_PROBLEM"]],
  ["다운로드 파일 문제", "다운로드한 엑셀 파일이 열리지 않아요", ["DOWNLOAD_PROBLEM"]],
  ["오디오 재생 문제", "오디오 재생이 안 돼요", ["AUDIO_PLAYBACK_PROBLEM"]],
  ["회원 인증메일 문제", "회원가입 인증메일이 오지 않아요", ["MEMBERSHIP_EMAIL_PROBLEM", "ACCOUNT_PROBLEM"]],
  ["로그인 문제", "로그인이 안 돼요", ["ACCOUNT_PROBLEM"]],
  ["저작권 이용권 문의", "기사 저작권과 원문 이용권이 궁금해요", ["RIGHTS_LICENSE"]],
  ["연구 이용 문의", "연구 목적으로 기사 원문을 이용하고 싶어요", ["RIGHTS_LICENSE", "RIGHTS_RESEARCH"]],
  ["AI 재이용 문의", "AI 학습에 뉴스 데이터를 재이용해도 되나요?", ["RIGHTS_LICENSE"]],
  ["검색 기간 필터 문제", "검색 기간 필터가 이상해요", ["SEARCH_FILTER_PROBLEM"]],
  ["이메일 변경 인증 문제", "이메일 변경 인증이 안 돼요", ["MEMBERSHIP_EMAIL_PROBLEM", "ACCOUNT_PROBLEM"]],
  ["오디오 끊김 문제", "기사 소리가 끊겨서 오디오를 못 들어요", ["AUDIO_PLAYBACK_PROBLEM"]],
  ["검색기간 선택 불가", "검색결과가 0건이고 검색기간도 선택할 수 없어요.", ["SEARCH_NO_RESULT", "SEARCH_FILTER_PROBLEM"]],
  ["기간 선택 불가", "검색결과가 0건이고 기간도 선택할 수 없어요.", ["SEARCH_NO_RESULT", "SEARCH_FILTER_PROBLEM"]],
  ["검색결과와 다른 이메일 가입 문의", "검색결과가 안 나오는데 다른 이메일로 다시 가입하면 되나요?", ["SEARCH_NO_RESULT", "MEMBERSHIP_EMAIL_PROBLEM", "ACCOUNT_PROBLEM"]],
  ["가입 이메일 오입력", "가입할 때 이메일을 잘못 적어서 인증메일을 못 받고 있어요.", ["MEMBERSHIP_EMAIL_PROBLEM", "ACCOUNT_PROBLEM"]],
  ["유료 회원 AI 요약 제공", "유료 회원에게 기사 제목과 AI 요약을 제공해도 되나요?", ["RIGHTS_LICENSE"]],
  ["비영리 연구 분석", "다운로드한 기사를 비영리 연구에서 로컬 Python으로 분석해도 되나요?", ["RIGHTS_RESEARCH"]],
  ["AI 요약 유료 제공 정책", "AI로 뉴스를 요약해서 유료 회원에게 제공해도 되나요?", ["RIGHTS_LICENSE"]],
];

for (const [label, question, expectedIssues] of goldenCases) {
  test(`golden support: ${label}`, () => {
    assert.equal(router.routeUserIntent(question, context).intent, "SUPPORT_TRIAGE");
    assert.deepEqual(supportRouting.detectSupportIssues(question), expectedIssues);
  });
}
