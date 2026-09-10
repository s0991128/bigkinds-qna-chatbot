/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-html-link-for-pages */
"use client";

import { useEffect, useState } from "react";
import { CHAT_HISTORY_KEY, ChatHistoryItem, formatAnswer, normalizeChatHistory } from "../../lib/answer-format";
import { ChatSession, clearChatSessions, flattenChatSessions, loadChatSessions } from "../../lib/chat-session";

function formatDate(value: string) {
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function loadLegacyHistory() {
  try {
    return normalizeChatHistory(JSON.parse(window.localStorage.getItem(CHAT_HISTORY_KEY) || "[]"));
  } catch {
    return [];
  }
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [legacyItems, setLegacyItems] = useState<ChatHistoryItem[]>([]);

  useEffect(() => {
    setSessions(loadChatSessions());
    setLegacyItems(loadLegacyHistory());
  }, []);

  function clearHistory() {
    clearChatSessions();
    window.localStorage.removeItem(CHAT_HISTORY_KEY);
    setSessions([]);
    setLegacyItems([]);
  }

  function exportHistory() {
    if (!sessions.length && !legacyItems.length) return;
    const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""').replace(/\r?\n/g, "\n")}"`;
    const sessionRows = flattenChatSessions(sessions).map((row) => [row.sessionId, row.startedAt, row.closedAt, row.sequence, row.role, row.content, row.searchQuery, row.documentId]);
    const legacyRows = legacyItems.map((item, index) => [`legacy-${item.id}`, item.createdAt, item.createdAt, index + 1, "user→assistant", `${item.question}\n${formatAnswer(item.answer)}`, "", ""]);
    const rows = [["세션ID", "대화 시작시간", "대화 종료시간", "순번", "역할", "내용", "검색식", "문서ID"], ...sessionRows, ...legacyRows];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bigkinds-chat-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const hasHistory = sessions.length > 0 || legacyItems.length > 0;

  return (
    <main className="history-page">
      <header className="history-header">
        <a className="site-brand" href="/"><span className="brand-tile">B</span><span><strong>BIG KINDS</strong><small>뉴스빅데이터 분석서비스</small></span></a>
        <a className="back-link" href="/">← 챗봇으로 돌아가기</a>
      </header>
      <section className="history-content">
        <div className="history-title-row">
          <div><p className="section-label">BIG KINDS · 대화 기록</p><h1>대화 기록</h1><p>이 브라우저 기기에서 나눈 빅카인즈 Q&amp;A 대화를 확인할 수 있습니다.</p></div>
          <div className="history-actions"><button className="export-history" type="button" onClick={exportHistory} disabled={!hasHistory}>CSV 내보내기</button><button className="clear-history" type="button" onClick={clearHistory} disabled={!hasHistory}>기록 지우기</button></div>
        </div>
        <p className="history-storage-note">대화기록은 서버로 보내지 않고 이 브라우저 기기에 최대 30일간 저장됩니다.</p>
        {!hasHistory ? <div className="history-empty"><strong>아직 저장된 대화가 없습니다.</strong><span>챗봇에서 질문을 남기면 이곳에서 다시 확인할 수 있습니다.</span><a href="/">첫 질문 남기기 →</a></div> : <>
          <div className="history-list">
            {sessions.map((session) => {
              const userCount = session.messages.filter((message) => message.role === "user").length;
              const lastQuery = [...session.messages].reverse().find((message) => message.searchQuery?.value)?.searchQuery?.value;
              return <article className="history-card session-card" key={session.id}>
                <div className="history-card-meta"><span>대화 세션</span><time dateTime={session.updatedAt}>{formatDate(session.updatedAt)}</time></div>
                <h2>{session.title}</h2>
                <p>{formatDate(session.startedAt)} · 대화 {userCount}개{lastQuery ? ` · ${lastQuery}` : ""}</p>
                <details><summary>대화 보기</summary><div className="session-transcript">{session.messages.map((message) => <div className={`history-message ${message.role}`} key={`${session.id}-${message.id}`}><b>{message.role === "user" ? "사용자" : "AI"}</b><p>{message.text}</p>{message.searchQuery?.value && <code>{message.searchQuery.value}</code>}{message.lookupStrategies?.map((strategy) => <code key={strategy.id}>{strategy.query}</code>)}{message.articleLookupSummary && <small>자료 찾기 · {message.articleLookupSummary.period.originalText || "기간 미확인"} · {message.articleLookupSummary.media.join(", ") || "언론사 미확인"} · {message.articleLookupSummary.materialType}</small>}{message.lookupResultStatus && <small>검색 결과 상태 · {message.lookupResultStatus}</small>}{message.apiRedirect && <small>OPEN API 뉴스토어 안내</small>}</div>)}</div></details>
              </article>;
            })}
          </div>
          {legacyItems.length > 0 && <section className="legacy-history"><h2>기존 질문 기록</h2><p>이전 버전에서 저장된 기록도 보존해 표시합니다.</p>{legacyItems.map((item) => <article className="history-card" key={item.id}><div className="history-card-meta"><span>{item.category || "이용 안내"}</span><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div><h3>{item.question}</h3><p>{formatAnswer(item.answer)}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceLabel || "공식 원문 확인"} ↗</a>}</article>)}</section>}
        </>}
      </section>
    </main>
  );
}
