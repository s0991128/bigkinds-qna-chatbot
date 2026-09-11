import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const session = await readFile(new URL("../lib/chat-session.ts", import.meta.url), "utf8");
const intents = await readFile(new URL("../lib/question-intents.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../lib/intent-router.ts", import.meta.url), "utf8");
const diagnostics = await readFile(new URL("../lib/search-diagnostics.ts", import.meta.url), "utf8");
const insights = await readFile(new URL("../lib/insights.ts", import.meta.url), "utf8");

test("초기 화면은 7개 목적 메뉴와 직접 질문 경로를 제공한다", () => {
  for (const label of ["뉴스 찾기", "검색식 만들기", "검색식 진단", "기능 추천", "문제 해결", "이용 안내", "OPEN API"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /직접 질문해도 됩니다/);
  assert.match(page, /showPurposeMenu/);
});

test("대화 세션은 닫기와 페이지 이탈 시 저장하고 다시 열 때 복원한다", () => {
  assert.match(page, /loadActiveChatSession/);
  assert.match(page, /archiveChatSession/);
  assert.match(page, /pagehide/);
  assert.match(page, /handleCloseWidget/);
  assert.match(page, /messagesRef/);
  assert.match(page, /workingStateRef/);
  assert.match(page, /sessionIdRef/);
  assert.match(page, /lastSearchMode/);
  assert.match(session, /ACTIVE_CHAT_SESSION_KEY/);
  assert.match(session, /CHAT_SESSIONS_KEY/);
  assert.match(session, /session\.messages\.some\(\(message\) => message\.role === "user"\)/);
});

test("검색 후속 질문은 기존 검색식에 조건을 추가하거나 제외한다", () => {
  assert.match(intents, /extractSearchPatch/);
  assert.match(page, /UPDATE_SEARCH/);
  assert.match(page, /applySearchTurn/);
  assert.match(page, /lastSearchInput/);
  assert.match(intents, /exclude/);
  assert.match(intents, /all/);
});

test("통합 Intent Router는 검색 파서보다 목적을 먼저 판정한다", () => {
  assert.match(router, /type UserIntent/);
  assert.match(router, /FEATURE_RECOMMENDATION/);
  assert.match(router, /SEARCH_RESULT_DIAGNOSIS/);
  assert.match(router, /isFeatureRecommendationQuestion/);
  assert.match(router, /isSearchDiagnosisQuestion/);
  assert.match(page, /routeUserIntent/);
  assert.match(page, /recommendFeatureForQuestion/);
  assert.match(page, /showSearchResultDiagnosis/);
});

test("검색식 진단은 모호한 AND OR 조합을 별도 안내한다", () => {
  assert.match(page, /diagnoseSearchExpression/);
  assert.match(page, /searchDiagnosis/);
  assert.match(diagnostics, /OR/);
  assert.match(diagnostics, /AND/);
  assert.match(diagnostics, /OR와 AND를 함께 사용할 때는 의도를 명확히 하기 위해 괄호로 묶는 것을 권장/);
});

test("서비스 응답은 공식 문서·다음 행동·인사이트 이벤트를 연결한다", () => {
  assert.match(page, /showOfficialDocument/);
  assert.match(page, /SERVICE_OVERVIEW/);
  assert.match(page, /SERVICE_FACT/);
  assert.match(page, /SERVICE_GUIDE/);
  assert.match(page, /공식 원문 보기/);
  assert.match(page, /overview-news/);
  assert.match(page, /lastCapabilityId/);
  assert.match(insights, /SERVICE_OVERVIEW_USED/);
  assert.match(insights, /SERVICE_FACT_USED/);
  assert.match(insights, /SERVICE_GUIDE_USED/);
  assert.match(page, /manual-search-operators/);
  assert.match(page, /getDocumentSourceUrl/);
});

test("질문 처리 예외는 안전한 답변과 로딩 종료로 수렴한다", () => {
  assert.match(page, /Chatbot request failed/);
  assert.match(page, /요청을 처리하는 중 문제가 발생했습니다/);
  assert.match(page, /finally/);
  assert.match(page, /setIsTyping\(false\)/);
});

test("지원 범위를 벗어난 질문과 기사 본문 요청에는 안전한 다음 행동을 제시한다", () => {
  assert.match(page, /OUT_OF_SCOPE/);
  assert.match(page, /기사 본문/);
  assert.match(page, /검색식 만들어보기/);
  assert.match(page, /뉴스토어 OPEN API 확인/);
});
