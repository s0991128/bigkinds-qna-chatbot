"use client";

import { useEffect, useState } from "react";
import { CHAT_HISTORY_KEY, ChatHistoryItem, formatAnswer } from "../../lib/answer-format";

export default function HistoryPage() {
  const [items, setItems] = useState<ChatHistoryItem[]>([]);

  useEffect(() => {
    try { setItems(JSON.parse(window.localStorage.getItem(CHAT_HISTORY_KEY) || "[]")); } catch { setItems([]); }
  }, []);

  function clearHistory() {
    window.localStorage.removeItem(CHAT_HISTORY_KEY);
    setItems([]);
  }

  return (
    <main className="history-page">
      <header className="history-header">
        <a className="site-brand" href="/"><span className="brand-tile">B</span><span><strong>BIGKinds</strong><small>뉴스빅데이터 분석서비스</small></span></a>
        <a className="back-link" href="/">← 챗봇으로 돌아가기</a>
      </header>
      <section className="history-content">
        <div className="history-title-row"><div><p className="section-label">BIG KINDS · Q&amp;A 기록</p><h1>질문답변 내역</h1><p>이 기기에서 확인한 질문과 공식 답변을 모아봤습니다.</p></div><button className="clear-history" type="button" onClick={clearHistory} disabled={!items.length}>기록 지우기</button></div>
        {items.length === 0 ? <div className="history-empty"><strong>아직 저장된 질문이 없습니다.</strong><span>챗봇에서 질문을 남기면 이곳에서 다시 확인할 수 있습니다.</span><a href="/">첫 질문 남기기 →</a></div> : <div className="history-list">{items.map((item) => <article className="history-card" key={item.id}><div className="history-card-meta"><span>{item.category || "이용 안내"}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}</time></div><h2>{item.question}</h2><p>{formatAnswer(item.answer)}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceLabel || "공식 원문 확인"} ↗</a>}</article>)}</div>}
      </section>
    </main>
  );
}
