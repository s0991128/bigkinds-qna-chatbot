import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

function loadCommonJs(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleRecord = { exports: {} };
  new Function("exports", "module", output)(moduleRecord.exports, moduleRecord);
  return moduleRecord.exports;
}

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const source = await readFile(new URL("../lib/chat-session.ts", import.meta.url), "utf8");
const session = loadCommonJs(source);

function userMessage(id, text, searchQuery) {
  return { id, role: "user", text, ...(searchQuery ? { searchQuery } : {}) };
}

test("active session은 닫고 다시 열어도 messages와 workingState를 복원한다", () => {
  const storage = new MemoryStorage();
  const active = session.createChatSession("2026-09-08T00:00:00.000Z");
  active.messages = [userMessage(1, "AI 반도체 기사 찾아줘", { value: "AI AND 반도체", description: "모두 포함" })];
  active.workingState.lastSearchInput = { all: ["AI", "반도체"], any: [], exact: [], exclude: [] };
  active.workingState.lastGeneratedQuery = "AI AND 반도체";
  session.saveActiveChatSession(active, storage);
  assert.deepEqual(session.loadActiveChatSession(storage), active);
});

test("동일 session id는 archive를 여러 번 해도 하나로 upsert된다", () => {
  const storage = new MemoryStorage();
  const active = session.createChatSession();
  active.messages = [userMessage(1, "AI 반도체 기사 찾아줘")];
  session.archiveChatSession(active, storage);
  active.messages.push(userMessage(2, "주가는 빼줘", { value: "AI AND 반도체 NOT 주가", description: "제외" }));
  session.archiveChatSession(active, storage);
  session.archiveChatSession(active, storage);
  const sessions = session.loadChatSessions(storage);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].messages.length, 2);
});

test("archive는 Article Lookup 인물명과 검색 전략을 History에 보관하지 않는다", () => {
  const storage = new MemoryStorage();
  const active = session.createChatSession();
  active.messages = [
    userMessage(1, "[인물명 비공개] 교수의 기사 찾기"),
    {
      id: 2,
      role: "assistant",
      text: "검색 전략",
      articleLookupSummary: { period: { originalText: "1997년", precision: "APPROXIMATE" }, media: ["매일경제"], organizations: [], events: [], materialType: "ARTICLE", pageHints: [], status: "READY" },
      lookupStrategies: [{ id: "lookup-direct", title: "직접", description: "", searchInput: { all: ["홍길동"], any: [], exact: [], exclude: [] }, query: "홍길동" }],
    },
  ];
  active.workingState.articleLookupContext = { currentCase: { id: "lookup-1", period: { originalText: "1997년", precision: "APPROXIMATE" }, media: [], persons: ["홍길동"], organizations: [], roles: [], events: [], awards: [], keywords: ["홍길동"], pageHints: [], materialType: "ARTICLE", status: "READY", createdAt: "", updatedAt: "" }, selectedStrategyId: "lookup-direct", lastResultStatus: null };
  session.archiveChatSession(active, storage);
  const archived = session.loadChatSessions(storage)[0];
  assert.equal(archived.messages[1].lookupStrategies, undefined);
  assert.equal(archived.workingState.articleLookupContext.currentCase, null);
  assert.doesNotMatch(JSON.stringify(archived), /홍길동/);
});

test("welcome-only session은 archive하지 않고 새 session은 id가 달라진다", () => {
  const storage = new MemoryStorage();
  const welcome = session.createChatSession();
  welcome.messages = [{ id: 1, role: "assistant", text: "안녕하세요" }];
  session.archiveChatSession(welcome, storage);
  assert.equal(session.loadChatSessions(storage).length, 0);
  const next = session.createChatSession();
  assert.notEqual(welcome.id, next.id);
});

test("session CSV flatten은 검색식과 문서 ID만 포함하고 내부 AI 데이터는 포함하지 않는다", () => {
  const active = session.createChatSession();
  active.messages = [{ id: 1, role: "assistant", text: "검색식", matchedId: "faq-1", searchQuery: { value: "AI AND 반도체", description: "" } }];
  const rows = session.flattenChatSessions([active]);
  assert.deepEqual(rows[0], { sessionId: active.id, startedAt: active.startedAt, closedAt: "", sequence: 1, role: "assistant", content: "검색식", searchQuery: "AI AND 반도체", documentId: "faq-1" });
});

test("2시간 유휴 또는 날짜 변경 시에는 새 세션을 시작한다", () => {
  const active = session.createChatSession("2026-09-08T00:00:00.000Z");
  assert.equal(session.shouldStartNewSession(active, "2026-09-08T01:59:59.000Z"), false);
  assert.equal(session.shouldStartNewSession(active, "2026-09-08T02:00:01.000Z"), true);
  assert.equal(session.shouldStartNewSession(active, "2026-09-09T00:00:00.000Z"), true);
});

test("30일이 지난 보관 세션은 조회 중 정리한다", () => {
  const storage = new MemoryStorage();
  const old = session.createChatSession("2020-01-01T00:00:00.000Z");
  old.messages = [userMessage(1, "오래된 대화")];
  storage.setItem(session.CHAT_SESSIONS_KEY, JSON.stringify([old]));
  assert.deepEqual(session.loadChatSessions(storage), []);
  assert.equal(storage.getItem(session.CHAT_SESSIONS_KEY), "[]");
});
