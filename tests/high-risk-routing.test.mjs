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
const intents = await loadTypeScript("../lib/question-intents.ts");
const router = await loadTypeScript("../lib/intent-router.ts");
const policy = await loadTypeScript("../lib/policy-safety.ts");

const base = { hasSearchContext: false, pageType: "HOME" };
const route = (question) => router.routeUserIntent(question, base);
const issuesOf = (question) => supportRouting.detectSupportIssues(question);

test("HR01 full article download is a service fact, not a support issue", () => {
  const question = "기사 전체 다운로드는 가능한가요?";
  assert.equal(intents.isFullTextDownloadQuestion(question), true);
  assert.equal(route(question).intent, "SERVICE_FACT");
  assert.notEqual(route(question).intent, "SUPPORT_TRIAGE");
});

test("HR02 full article body Excel request is a service fact", () => {
  const question = "기사 본문 전체를 엑셀로 받을 수 있나요?";
  assert.equal(intents.isFullTextDownloadQuestion(question), true);
  assert.equal(route(question).intent, "SERVICE_FACT");
});

test("HR03 search result Excel guidance stays a service guide", () => {
  const question = "검색결과를 엑셀로 다운로드하고 싶어요";
  assert.equal(intents.isFullTextDownloadQuestion(question), false);
  assert.equal(route(question).intent, "SERVICE_GUIDE");
  assert.notEqual(route(question).intent, "SUPPORT_TRIAGE");
  assert.deepEqual(issuesOf(question), []);
});

test("HR04 download button location stays a service guide", () => {
  const question = "다운로드 버튼은 어디 있나요?";
  assert.equal(route(question).intent, "SERVICE_GUIDE");
  assert.notEqual(route(question).intent, "SUPPORT_TRIAGE");
});

test("HR05 missing download button is download support", () => {
  const question = "다운로드 버튼이 안 보여요";
  assert.equal(route(question).intent, "SUPPORT_TRIAGE");
  assert.ok(issuesOf(question).includes("DOWNLOAD_PROBLEM"));
});

test("HR06 downloaded file that will not open is download support", () => {
  const question = "다운로드한 파일이 열리지 않아요";
  assert.equal(route(question).intent, "SUPPORT_TRIAGE");
  assert.ok(issuesOf(question).includes("DOWNLOAD_PROBLEM"));
});

test("HR07 paid-member original article distribution requires policy handoff", () => {
  const handoff = policy.getPolicyHandoff("기사 원문을 다운로드해서 유료회원에게 제공해도 되나요?");
  assert.ok(handoff);
  assert.ok(["NEWS_COPYRIGHT", "COMMERCIAL_USE"].includes(handoff.kind));
});

test("HR08 article body for AI training requires AI reuse handoff", () => {
  assert.equal(policy.getPolicyHandoff("기사 본문을 AI 학습에 사용하고 싶어요")?.kind, "AI_REUSE");
});

test("HR09 non-profit research bulk download requires research license handoff", () => {
  assert.equal(policy.getPolicyHandoff("비영리 연구 목적으로 기사를 대량 다운로드해도 되나요?")?.kind, "RESEARCH_LICENSE");
});

test("HR10 Open API wins over article research policy", () => {
  assert.equal(route("OPEN API로 기사 원문을 연구에 이용해도 되나요?").intent, "OPEN_API_REDIRECT");
});

test("HR11 news listening location is service guidance, not audio support", () => {
  const question = "뉴스 듣기는 어디서 이용하나요?";
  assert.equal(route(question).intent, "SERVICE_GUIDE");
  assert.notEqual(route(question).intent, "SUPPORT_TRIAGE");
  assert.notEqual(issuesOf(question).includes("AUDIO_PLAYBACK_PROBLEM"), true);
});

test("HR12 unclickable audio button is audio support", () => {
  const question = "뉴스 듣기 버튼이 안 눌려요";
  assert.equal(route(question).intent, "SUPPORT_TRIAGE");
  assert.ok(issuesOf(question).includes("AUDIO_PLAYBACK_PROBLEM"));
});

test("HR13 search period location is service guidance", () => {
  const question = "검색기간은 어디서 설정하나요?";
  assert.equal(route(question).intent, "SERVICE_GUIDE");
  assert.notEqual(route(question).intent, "SEARCH_NEW");
  assert.notEqual(route(question).intent, "SEARCH_UPDATE");
});

test("HR14 too many results is result diagnosis", () => {
  const question = "검색결과가 너무 많아서 기간을 줄이고 싶어요";
  assert.equal(route(question).intent, "SEARCH_RESULT_DIAGNOSIS");
  assert.notEqual(route(question).intent, "SEARCH_NEW");
});

test("HR15 mixed operator question is expression diagnosis", () => {
  const question = "AI OR 인공지능 AND 반도체 이렇게 검색하면 내가 원하는 대로 나와?";
  assert.equal(route(question).intent, "SEARCH_EXPRESSION_DIAGNOSIS");
  assert.notEqual(route(question).intent, "SEARCH_NEW");
});

test("HR16 low birth rate alternatives create an OR search", () => {
  const result = route("이번에는 저출생이나 저출산 관련 기사 찾아줘");
  assert.equal(result.intent, "SEARCH_NEW");
  assert.equal(result.searchTurn?.searchInput?.any?.join(" OR "), "저출생 OR 저출산");
});

test("HR17 extracting company and revenue uses information extraction", () => {
  const result = route("기사에서 회사명과 매출액만 뽑고 싶어요");
  assert.equal(result.intent, "FEATURE_RECOMMENDATION");
  assert.ok(result.capabilityIds?.includes("INFORMATION_EXTRACTION"));
  assert.notEqual(result.intent, "SEARCH_NEW");
});

test("HR18 own Excel graph request uses data visualization", () => {
  const result = route("내 엑셀 데이터를 그래프로 만들고 싶어요");
  assert.equal(result.intent, "FEATURE_RECOMMENDATION");
  assert.ok(result.capabilityIds?.includes("DATA_VISUALIZATION"));
  assert.notEqual(result.intent, "DOWNLOAD_PROBLEM");
  assert.notEqual(result.intent, "SEARCH_NEW");
});

test("HR19 exact historical article request uses historical lookup", () => {
  const result = route("1997년 7월경 매일경제에 실린 아시아나 직원의 노동부 장관 표창 명단을 찾고 싶어요.");
  assert.equal(result.intent, "HISTORICAL_ARTICLE_LOOKUP");
  assert.notEqual(result.intent, "SEARCH_NEW");
});

test("HR20 wrong signup email and missing verification mail uses membership support", () => {
  const question = "가입 이메일을 잘못 입력해서 인증메일을 못 받고 있어요";
  assert.equal(route(question).intent, "SUPPORT_TRIAGE");
  assert.ok(issuesOf(question).includes("MEMBERSHIP_EMAIL_PROBLEM"));
});
