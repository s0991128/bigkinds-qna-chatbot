import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const history = await readFile(new URL("../app/history/page.tsx", import.meta.url), "utf8");
const insights = await readFile(new URL("../lib/insights.ts", import.meta.url), "utf8");
const session = await readFile(new URL("../lib/chat-session.ts", import.meta.url), "utf8");

test("SupportCase UI renders per-issue guidance, provenance, and next actions", () => {
  for (const text of ["두 가지 문제가 함께 있는 것으로 보입니다.", "확인된 공식 안내", "단계", "출처", "다음 행동", "공식 문의하기", "이용범위 문의", "문의내용 복사", "문제 해결", "Q&A 문의"]) {
    assert.match(page, new RegExp(text));
  }
  assert.match(page, /issueKinds\?\.includes\(issue\)/);
  assert.match(page, /SUPPORT_ESCALATED/);
});

test("History stores support summaries and removes Article Lookup strategy memory", () => {
  assert.match(page, /summarizeSupportRequest/);
  assert.match(history, /supportCaseSummary\.summary/);
  assert.match(session, /lookupStrategies: undefined/);
  assert.match(session, /currentCase: null/);
  assert.doesNotMatch(history, /sanitizedQuestion/);
});

test("anonymous support insight categories are available", () => {
  for (const eventType of ["SUPPORT_CASE_STARTED", "MULTI_ISSUE_SUPPORT", "SEARCH_FILTER_PROBLEM", "MEMBERSHIP_EMAIL_PROBLEM", "AUDIO_PLAYBACK_PROBLEM", "RIGHTS_LICENSE_INQUIRY", "RIGHTS_RESEARCH_INQUIRY", "SUPPORT_ESCALATED"]) {
    assert.match(insights, new RegExp(eventType));
  }
  assert.doesNotMatch(insights, /rawQuestion/);
});
