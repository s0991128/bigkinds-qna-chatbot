"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { FAQ_SOURCE_URL, faqItems } from "../lib/faq";
import { searchFaq, SearchableDocument } from "../lib/search";
import { CHAT_HISTORY_KEY, formatAnswer } from "../lib/answer-format";

declare global {
  interface Window {
    BIGKINDS_KNOWLEDGE_BASE?: { documents?: SearchableDocument[]; updatedAt?: string };
  }
}

type Message = {
  id: number;
  role: "assistant" | "user";
  text: string;
  matchedId?: string;
  relatedIds?: string[];
  isFallback?: boolean;
};

const welcomeMessage: Message = {
  id: 1,
  role: "assistant",
  text: "안녕하세요. 빅카인즈 공식 FAQ를 바탕으로 이용 방법을 안내해 드릴게요. 궁금한 내용을 편하게 물어보세요.",
};

const starterQuestions = [
  "검색식과 연산자는 어떻게 쓰나요?",
  "기사 본문 전체를 받을 수 있나요?",
  "형태소와 바이그램은 뭐가 다른가요?",
];

const categoryPrompts = [
  { label: "뉴스 검색", question: "검색조건의 기본값을 알려줘" },
  { label: "Open API", question: "Open API 신청과 사용 방법을 알려줘" },
  { label: "요금·정책", question: "API 이용요금과 정책이 궁금해" },
  { label: "개인정보", question: "비밀번호나 인증키를 입력해도 돼?" },
];

const dataScriptPaths = [
  "/data/config.js",
  "/data/official-faq.js",
  "/data/verified-policy.js",
  "/data/qna-import.js",
  ...Array.from({ length: 21 }, (_, index) => `/data/qna-data-${String(index + 1).padStart(2, "0")}.js`),
  "/data/knowledge-base.js",
];

function loadScript(path: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = path;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`데이터를 불러오지 못했습니다: ${path}`));
    document.head.appendChild(script);
  });
}

function saveHistory(question: string, answer: string, item: SearchableDocument) {
  try {
    const current = JSON.parse(window.localStorage.getItem(CHAT_HISTORY_KEY) || "[]");
    const next = [{ id: `${Date.now()}-${item.id}`, question, answer, category: item.category,
      sourceLabel: item.source?.label, sourceUrl: item.source?.url ?? FAQ_SOURCE_URL,
      createdAt: new Date().toISOString() }, ...current].slice(0, 100);
    window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(next));
  } catch { /* 저장이 차단된 환경에서도 답변은 계속 제공합니다. */ }
}

function normalizeKnowledgeDocument(document: SearchableDocument): SearchableDocument {
  return {
    ...document,
    question: document.question || document.title || document.questions?.[0] || "공식 안내",
    category: document.category || "기타",
    keywords: document.keywords || [],
    answer: document.answer || "공식 답변을 확인해 주세요.",
  };
}
function conciseAnswer(value: string) {
  const paragraphs = formatAnswer(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const compact = paragraphs.slice(0, 2).join("\n\n");
  if (compact.length <= 520) return compact;

  const sentences = compact.match(/[^.!?。！？]+[.!?。！？]+/g) ?? [compact];
  let result = "";
  for (const sentence of sentences) {
    if (result && result.length + sentence.length > 520) break;
    result += sentence;
    if (result.length >= 300) break;
  }
  return result.trim() || `${compact.slice(0, 517).trimEnd()}...`;
}


export default function Home() {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [query, setQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [embedded, setEmbedded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [knowledge, setKnowledge] = useState<SearchableDocument[]>(faqItems);
  const [dataReady, setDataReady] = useState(false);
  const [feedback, setFeedback] = useState<Record<number, "up" | "down">>({});
  const nextId = useRef(2);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isEmbed = new URLSearchParams(window.location.search).get("embed") === "1";
    setEmbedded(isEmbed);
    setChatOpen(true);

    let cancelled = false;
    (async () => {
      try {
        for (const path of dataScriptPaths) await loadScript(path);
        const documents = window.BIGKINDS_KNOWLEDGE_BASE?.documents ?? [];
        if (!cancelled && documents.length) {
          setKnowledge(documents.map(normalizeKnowledgeDocument));
          setDataReady(true);
        }
      } catch {
        if (!cancelled) setDataReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isTyping]);

  const answeredCount = useMemo(
    () => messages.filter((message) => message.role === "assistant" && message.matchedId).length,
    [messages],
  );

  const faqCount = useMemo(
    () => knowledge.filter((item) => item.id.startsWith("official-faq-")).length || 23,
    [knowledge],
  );

  function ask(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || isTyping) return;

    const userMessage: Message = {
      id: nextId.current++,
      role: "user",
      text: cleanQuestion,
    };

    setMessages((current) => [...current, userMessage]);
    setQuery("");
    setIsTyping(true);

    window.setTimeout(() => {
      const sensitive = /주민등록번호|비밀번호|인증키|api\s*key|apikey/i.test(cleanQuestion);
      const results = searchFaq(cleanQuestion, 3, knowledge);
      const privacyDocument = knowledge.find((item) => item.id === "privacy-security");
      const safeResults = sensitive && privacyDocument
        ? [{ item: privacyDocument, score: 999 }]
        : results;
      const best = safeResults[0];
      const assistantId = nextId.current++;

      if (!best) {
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: "assistant",
            text: "공식 FAQ에서 질문과 충분히 가까운 내용을 찾지 못했어요. 질문을 짧게 바꾸거나 아래 주제 중 하나를 선택해 주세요. 계속 해결되지 않으면 bigkinds@kpf.or.kr로 문의할 수 있습니다.",
            isFallback: true,
          },
        ]);
      } else {
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: "assistant",
            text: conciseAnswer(best.item.answer),
            matchedId: best.item.id,
            relatedIds: safeResults.slice(1).map((result) => result.item.id),
          },
        ]);
        saveHistory(cleanQuestion, best.item.answer, best.item);
      }

      setIsTyping(false);
    }, 420);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(query);
  }

  function resetConversation() {
    setMessages([{ ...welcomeMessage, id: nextId.current++ }]);
    setFeedback({});
  }

  function closeWidget() {
    window.parent.postMessage({ type: "bigkinds-chatbot-close" }, "*");
  }

  return (
    <main className={embedded ? "site embedded" : chatOpen ? "site standalone" : "site"}>
      {!embedded && !chatOpen && (
        <>
          <div className="gov-strip">이 화면은 빅카인즈 웹사이트 부착형 챗봇의 구현 예시입니다.</div>
          <header className="site-header">
            <a className="site-brand" href={FAQ_SOURCE_URL} target="_blank" rel="noreferrer">
              <span className="brand-tile">B</span>
              <span>
                <strong>BIGKinds</strong>
                <small>뉴스빅데이터 분석서비스</small>
              </span>
            </a>
            <div className="header-context">
              <span className="service-badge">공식 이용 안내</span>
              <a className="header-date history-link" href="/history">대화 기록 보기&nbsp;↗</a>
            </div>
          </header>

          <section className="demo-content">
            <div className="demo-copy">
              <p className="section-label">BIG KINDS · 이용 Q&amp;A</p>
              <h1>빅카인즈 이용,<br />필요한 답부터 찾으세요.</h1>
              <p className="lead">
                검색·Open API·데이터 이용 방법을 공식 안내와 Q&amp;A에서 찾아
                이해하기 쉬운 답변으로 정리해 드립니다.
              </p>
              <div className="metric-row" aria-label="프로토타입 특징">
              <div><strong>{faqCount}</strong><span>공식 FAQ</span></div>
                <div><strong>{knowledge.length}</strong><span>검색 문서</span></div>
                <div><strong>0건</strong><span>기사 본문 저장</span></div>
              </div>
              <div className="trust-note">
                <span aria-hidden="true">✓</span>
                <p><strong>공식 자료를 우선합니다.</strong> 근거가 없으면 추측하지 않습니다.</p>
              </div>
            </div>

            <aside className="flow-card" aria-label="답변 생성 흐름">
              <div className="flow-heading">답변 원칙</div>
              <p><b>01</b><span>질문의 핵심어를 파악합니다</span></p>
              <p><b>02</b><span>공식 FAQ·정책을 대조합니다</span></p>
              <p><b>03</b><span>절차와 출처를 함께 안내합니다</span></p>
            </aside>
          </section>
        </>
      )}

      {(embedded || chatOpen) && <section className="chat-widget" aria-label="빅카인즈 이용 도우미">
        <header className="chat-header">
          <div className="bot-identity">
            <span className="bot-avatar">B</span>
            <div>
              <strong>빅카인즈 이용 도우미</strong>
              <span><i /> {dataReady ? `${faqCount} FAQ · ${knowledge.length - faqCount} 정책/Q&A` : "공식 FAQ 연결 중"}</span>
            </div>
          </div>
          <div className="header-actions">
            {answeredCount > 0 && (
              <button className="icon-button reset-button" type="button" onClick={resetConversation} aria-label="대화 초기화" title="대화 초기화">↻</button>
            )}
            <button className="icon-button" type="button" onClick={() => embedded ? closeWidget() : setChatOpen(false)} aria-label="챗봇 닫기">×</button>
          </div>
        </header>

        <div className="topic-strip" aria-label="빠른 주제 선택">
          {categoryPrompts.map((item) => (
            <button key={item.label} type="button" onClick={() => ask(item.question)} disabled={isTyping}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="conversation" aria-live="polite">
          <div className="day-divider"><span>오늘</span></div>
          {messages.map((message, index) => {
            const matched = message.matchedId
              ? knowledge.find((item) => item.id === message.matchedId)
              : undefined;
            const related = (message.relatedIds ?? [])
              .map((id) => knowledge.find((item) => item.id === id))
              .filter(Boolean);

            return (
              <div key={message.id} className={`message-row ${message.role}`}>
                {message.role === "assistant" && <span className="message-avatar">B</span>}
                <div className="message-stack">
                  <div className="bubble">
                    {matched && <span className="answer-label">{matched.category}</span>}
                    <p>{message.text}</p>
                  </div>

                  {matched && (
                    <div className="answer-meta">
                      <div className="source-meta">
                      <a href={matched?.source?.url ?? FAQ_SOURCE_URL} target="_blank" rel="noreferrer">
                        공식 근거 확인 ↗
                      </a>
                      <span>{matched?.source?.label ?? "빅카인즈 공식 FAQ"}{matched?.source?.pages ? ` · ${matched.source.pages}` : ""}</span>
                    </div>
                      <div className="feedback" aria-label="답변 평가">
                        <span>도움이 됐나요?</span>
                        <button
                          type="button"
                          className={feedback[message.id] === "up" ? "selected" : ""}
                          onClick={() => setFeedback((current) => ({ ...current, [message.id]: "up" }))}
                          aria-label="도움이 됐어요"
                        >＋</button>
                        <button
                          type="button"
                          className={feedback[message.id] === "down" ? "selected" : ""}
                          onClick={() => setFeedback((current) => ({ ...current, [message.id]: "down" }))}
                          aria-label="도움이 안 됐어요"
                        >−</button>
                      </div>
                    </div>
                  )}

                  {index === 0 && messages.length === 1 && (
                    <div className="starter-list">
                      {starterQuestions.map((question) => (
                        <button key={question} type="button" onClick={() => ask(question)}>
                          {question}<span aria-hidden="true">›</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {(related.length > 0 || message.isFallback) && (
                    <div className="related-list">
                      <span>{message.isFallback ? "이런 주제는 답할 수 있어요" : "함께 볼 질문"}</span>
                      {(message.isFallback ? knowledge.slice(6, 9) : related).map((item) => item && (
                        <button key={item.id} type="button" onClick={() => ask(item.question)}>
                          {item.question}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="message-row assistant">
              <span className="message-avatar">B</span>
              <div className="typing" aria-label="답변 작성 중"><i /><i /><i /></div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form className="composer" onSubmit={submit}>
          <label htmlFor="question">빅카인즈 이용 방법 질문</label>
          <div className="input-wrap">
            <input
              id="question"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="궁금한 내용을 입력해 주세요"
              autoComplete="off"
              disabled={isTyping}
            />
            <button type="submit" disabled={!query.trim() || isTyping} aria-label="질문 보내기">↑</button>
          </div>
          <p>FAQ 기반 자동 답변입니다. 중요한 내용은 공식 원문을 확인해 주세요.</p>
        </form>
      </section>}
      {!embedded && !chatOpen && (
        <button className="page-launcher" type="button" onClick={() => setChatOpen(true)} aria-label="빅카인즈 이용 도우미 열기">
          B<span aria-hidden="true" />
        </button>
      )}
    </main>
  );
}

