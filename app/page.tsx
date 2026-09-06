"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { FAQ_SOURCE_URL, faqItems } from "../lib/faq";
import { searchFaq, SearchableDocument } from "../lib/search";
import { CHAT_HISTORY_KEY, formatAnswer } from "../lib/answer-format";
import { buildAnswerViewModel, AnswerViewModel } from "../lib/answer-model";
import { classifyPagePath, createPageContext, pageTypeLabels, PageContext, starterQuestionsByPage } from "../lib/page-context";
import { buildSearchQuery, describeSearchQuery, SearchQueryInput } from "../lib/search-query-builder";
import { detectDiagnosticKind, DiagnosticFlow, getDiagnosticFlow } from "../lib/diagnostic-flows";
import { recordFeedback } from "../lib/feedback";

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
  answerModel?: AnswerViewModel;
  diagnostic?: DiagnosticFlow;
  question?: string;
  apiRedirect?: boolean;
};

const welcomeMessage: Message = {
  id: 1,
  role: "assistant",
  text: "안녕하세요. 빅카인즈 공식 자료를 바탕으로 뉴스 검색·분석과 이용 방법을 안내해 드릴게요. 궁금한 내용을 편하게 물어보세요.",
};

const starterQuestions = [
  "검색식과 연산자는 어떻게 쓰나요?",
  "기사 본문 전체를 받을 수 있나요?",
  "형태소와 바이그램은 뭐가 다른가요?",
];

const OPEN_API_PURCHASE_URL = "https://www.newstore.or.kr/store/prodct/newsdata/list.do";

const categoryPrompts = [
  { label: "뉴스 검색", question: "검색조건의 기본값을 알려줘" },
  { label: "Open API", question: "OPEN API 관련 문의는 어디로 해야 하나요?" },
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
  "/data/official-intro.js",
];

const QNA_SOURCE_URL = "https://www.bigkinds.or.kr/news/qnaList.do";

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
  const authority = document.authority ?? (document.id.startsWith("official-faq-") ? "OFFICIAL_FAQ" : document.id.startsWith("bigkinds-intro-") ? "OFFICIAL_INTRO" : document.id.startsWith("qna-") ? "VERIFIED_QNA" : "CURRENT_POLICY");
  const status = document.status ?? (document.id.startsWith("qna-") ? "REVIEW_REQUIRED" : "CURRENT");
  return {
    ...document,
    question: document.question || document.title || document.questions?.[0] || "공식 안내",
    category: document.category || "기타",
    keywords: document.keywords || [],
    answer: document.answer || "공식 답변을 확인해 주세요.",
    authority,
    status,
  };
}

function isOpenApiQuestion(question: string) {
  return /open\s*api|openapi|\bapi\b|인증키|호출 오류|api 문의/i.test(question);
}

type KnowledgeType = "qna" | "faq" | "intro" | "policy";

type KnowledgeGroup = {
  key: KnowledgeType;
  label: string;
  description: string;
  count: number;
};

function getKnowledgeType(document: SearchableDocument): KnowledgeType {
  if (document.id.startsWith("qna-")) return "qna";
  if (document.id.startsWith("official-faq-")) return "faq";
  if (document.id.startsWith("bigkinds-intro-")) return "intro";
  return "policy";
}

const knowledgeTypeMeta: Record<KnowledgeType, { label: string; description: string }> = {
  qna: { label: "공식 Q&A", description: "운영지원 답변" },
  faq: { label: "공식 FAQ", description: "자주 묻는 질문" },
  intro: { label: "빅카인즈 소개", description: "서비스·데이터 안내" },
  policy: { label: "정책·사용법", description: "API·저작권·이용 기준" },
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [query, setQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [embedded, setEmbedded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedKnowledgeType, setSelectedKnowledgeType] = useState<KnowledgeType | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<SearchableDocument[]>(faqItems);
  const [dataReady, setDataReady] = useState(false);
  const [feedback, setFeedback] = useState<Record<number, "up" | "down">>({});
  const [feedbackReasons, setFeedbackReasons] = useState<Record<number, string>>({});
  const [expandedMessages, setExpandedMessages] = useState<Record<number, boolean>>({});
  const [pageContext, setPageContext] = useState<PageContext>(() => createPageContext("/"));
  const [showQueryBuilder, setShowQueryBuilder] = useState(false);
  const [queryBuilder, setQueryBuilder] = useState<SearchQueryInput>({ any: [], all: [], exact: [], exclude: [] });
  const [queryBuilderText, setQueryBuilderText] = useState<Record<string, string>>({ any: "", all: "", exact: "", exclude: "" });
  const nextId = useRef(2);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isEmbed = new URLSearchParams(window.location.search).get("embed") === "1";
    setEmbedded(isEmbed);
    setChatOpen(isEmbed);
    setPageContext(createPageContext(window.location.pathname));

    const onContext = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || event.data.type !== "bigkinds-chatbot-context") return;
      const incoming = event.data.context as Partial<PageContext>;
      if (!incoming || typeof incoming.pathname !== "string") return;
      setPageContext({
        pathname: incoming.pathname,
        pageType: incoming.pageType || classifyPagePath(incoming.pathname),
        loggedIn: incoming.loggedIn ?? null,
      });
    };
    window.addEventListener("message", onContext);

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
      window.removeEventListener("message", onContext);
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

  const knowledgeGroups = useMemo(() => {
    const counts = knowledge.reduce<Record<KnowledgeType, number>>(
      (result, document) => {
        const type = getKnowledgeType(document);
        result[type] += 1;
        return result;
      },
      { qna: 0, faq: 0, intro: 0, policy: 0 },
    );

    return (Object.keys(knowledgeTypeMeta) as KnowledgeType[]).map((key) => ({
      key,
      ...knowledgeTypeMeta[key],
      count: counts[key],
    }));
  }, [knowledge]);

  const selectedKnowledgeGroup = useMemo(
    () => knowledgeGroups.find((group) => group.key === selectedKnowledgeType) ?? null,
    [knowledgeGroups, selectedKnowledgeType],
  );

  const selectedDocuments = useMemo(
    () => selectedKnowledgeType
      ? knowledge.filter((document) => getKnowledgeType(document) === selectedKnowledgeType)
      : [],
    [knowledge, selectedKnowledgeType],
  );

  const selectedDocument = useMemo(
    () => selectedDocuments.find((document) => document.id === selectedDocumentId) ?? selectedDocuments[0],
    [selectedDocumentId, selectedDocuments],
  );

  const contextualStarters = useMemo(
    () => starterQuestionsByPage[pageContext.pageType] ?? starterQuestions,
    [pageContext.pageType],
  );

  const contextLabel = pageTypeLabels[pageContext.pageType];

  const builtSearchQuery = useMemo(() => buildSearchQuery(queryBuilder), [queryBuilder]);
  const builtSearchDescription = useMemo(() => describeSearchQuery(queryBuilder), [queryBuilder]);

  function openKnowledgeGroup(group: KnowledgeGroup) {
    if (!dataReady || group.count === 0) return;
    setSelectedKnowledgeType(group.key);
    const firstDocument = knowledge.find((document) => getKnowledgeType(document) === group.key);
    setSelectedDocumentId(firstDocument?.id ?? null);
  }

  function emitHostAction(action: { type: string; label?: string; url?: string; value?: string }) {
    const parentOrigin = document.referrer ? (() => { try { return new URL(document.referrer).origin; } catch { return ""; } })() : "";
    window.parent.postMessage({ type: "bigkinds-chatbot-action", action }, parentOrigin || "*");
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }

  function builderAdd(field: keyof SearchQueryInput) {
    const value = (queryBuilderText[field] || "").trim();
    if (!value) return;
    setQueryBuilder((current) => ({ ...current, [field]: [...(current[field] || []), value] }));
    setQueryBuilderText((current) => ({ ...current, [field]: "" }));
  }

  function builderRemove(field: keyof SearchQueryInput, index: number) {
    setQueryBuilder((current) => ({ ...current, [field]: (current[field] || []).filter((_, itemIndex) => itemIndex !== index) }));
  }

  function applySearchQuery() {
    if (!builtSearchQuery) return;
    emitHostAction({ type: "APPLY_SEARCH_QUERY", label: "검색창에 적용", value: builtSearchQuery });
  }

  function handleFeedback(messageId: number, value: "up" | "down") {
    setFeedback((current) => ({ ...current, [messageId]: value }));
    const message = messages.find((item) => item.id === messageId);
    recordFeedback({ documentId: message?.matchedId, pageType: pageContext.pageType, rating: value });
    if (value === "up") setFeedbackReasons((current) => { const next = { ...current }; delete next[messageId]; return next; });
  }

  function handleFeedbackReason(messageId: number, reason: string) {
    setFeedbackReasons((current) => ({ ...current, [messageId]: reason }));
    const message = messages.find((item) => item.id === messageId);
    recordFeedback({ documentId: message?.matchedId, pageType: pageContext.pageType, rating: "down", reason });
  }

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

    const diagnosticKind = detectDiagnosticKind(cleanQuestion, pageContext.pageType);

    window.setTimeout(() => {
      const sensitive = /주민등록번호|비밀번호|인증키|api\s*key|apikey/i.test(cleanQuestion);
      const apiInquiry = isOpenApiQuestion(cleanQuestion) && !sensitive;
      const results = searchFaq(cleanQuestion, 3, knowledge);
      const privacyDocument = knowledge.find((item) => item.id === "privacy-security");
      const safeResults = sensitive && privacyDocument
        ? [{ item: privacyDocument, score: 999 }]
        : results;
      const best = safeResults[0];
      const assistantId = nextId.current++;

      if (apiInquiry) {
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: "assistant",
            text: "OPEN API 관련 문의와 구매 신청은 뉴스토어에서 확인해 주세요. 기존 챗봇에 저장된 OPEN API 안내는 최신 계약·요금 조건과 다를 수 있어 여기서 제공하지 않습니다.",
            apiRedirect: true,
            question: cleanQuestion,
          },
        ]);
      } else if (diagnosticKind && cleanQuestion.length < 40) {
        setMessages((current) => [
          ...current,
          { id: assistantId, role: "assistant", text: getDiagnosticFlow(diagnosticKind).title, diagnostic: getDiagnosticFlow(diagnosticKind), question: cleanQuestion },
        ]);
      } else if (!best) {
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: "assistant",
            text: "저장된 공식 문서에서 질문과 직접 관련된 내용을 찾지 못했어요. 이 챗봇은 빅카인즈 FAQ·정책·소개·Q&A 범위에서만 안내합니다. 질문을 조금 더 구체적으로 바꾸거나 관련 주제를 선택해 주세요.",
            isFallback: true,
            question: cleanQuestion,
          },
        ]);
      } else {
        const answerModel = buildAnswerViewModel(best.item);
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: "assistant",
            text: answerModel.summary,
            matchedId: best.item.id,
            relatedIds: safeResults.slice(1).map((result) => result.item.id),
            answerModel,
            question: cleanQuestion,
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
    setFeedbackReasons({});
    setExpandedMessages({});
  }

  function closeWidget() {
    const parentOrigin = document.referrer ? (() => { try { return new URL(document.referrer).origin; } catch { return ""; } })() : "";
    window.parent.postMessage({ type: "bigkinds-chatbot-close" }, parentOrigin || "*");
  }

  return (
    <main className={embedded ? "site embedded" : "site"}>
      {!embedded && (
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
              <div className="knowledge-breakdown" aria-label="검색 문서 유형">
                {knowledgeGroups.map((group) => (
                  <button
                    className={`knowledge-card knowledge-card-${group.key} ${selectedKnowledgeType === group.key ? "selected" : ""}`}
                    key={group.key}
                    type="button"
                    onClick={() => openKnowledgeGroup(group)}
                    disabled={!dataReady || group.count === 0}
                    aria-pressed={selectedKnowledgeType === group.key}
                  >
                    <span>{group.label}</span>
                    <strong>{dataReady ? group.count : "···"}</strong>
                    <small>{group.description}</small>
                  </button>
                ))}
              </div>
              {!selectedKnowledgeGroup && (
                <p className="knowledge-detail-hint">문서 유형을 선택하면 실제 검색문서와 상세 내용을 한 화면에서 확인할 수 있습니다.</p>
              )}
              {selectedKnowledgeGroup && selectedDocument && (
                <section className="knowledge-detail" aria-label={`${selectedKnowledgeGroup.label} 상세 내용`}>
                  <div className="knowledge-detail-header">
                    <div>
                      <p className="section-label">검색 문서 상세</p>
                      <h2>{selectedKnowledgeGroup.label}</h2>
                      <p>{selectedKnowledgeGroup.count}건의 {selectedKnowledgeGroup.description} 문서</p>
                    </div>
                    <button className="knowledge-detail-close" type="button" onClick={() => setSelectedKnowledgeType(null)}>닫기</button>
                  </div>
                  <div className="knowledge-detail-body">
                    <div className="knowledge-document-list" aria-label="문서 목록">
                      {selectedDocuments.map((document) => (
                        <button
                          key={document.id}
                          type="button"
                          className={selectedDocument.id === document.id ? "active" : ""}
                          onClick={() => setSelectedDocumentId(document.id)}
                        >
                          <span>{document.category}</span>
                          <strong>{document.title || document.question}</strong>
                        </button>
                      ))}
                    </div>
                    <article className="knowledge-document-detail">
                      <span className="knowledge-document-category">{selectedDocument.category}</span>
                      <h3>{selectedDocument.title || selectedDocument.question}</h3>
                      <p className="knowledge-document-answer">{formatAnswer(selectedDocument.answer)}</p>
                      {selectedDocument.facts && selectedDocument.facts.length > 0 && (
                        <div className="knowledge-document-block">
                          <strong>핵심 사실</strong>
                          <ul>{selectedDocument.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
                        </div>
                      )}
                      {selectedDocument.steps && selectedDocument.steps.length > 0 && (
                        <div className="knowledge-document-block">
                          <strong>이용 순서</strong>
                          <ol>{selectedDocument.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                        </div>
                      )}
                      <div className="knowledge-document-source">
                        <span>기준일 {selectedDocument.effectiveDate || "-"}</span>
                        {selectedDocument.source?.url ? (
                          <a href={selectedDocument.source.url} target="_blank" rel="noreferrer">공식 원문 확인 ↗</a>
                        ) : <span>{selectedDocument.source?.label || "공식 자료"}</span>}
                      </div>
                    </article>
                  </div>
                </section>
              )}
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
          <button type="button" onClick={() => setShowQueryBuilder((current) => !current)} aria-expanded={showQueryBuilder}>
            검색식 만들기
          </button>
          {categoryPrompts.map((item) => (
            <button key={item.label} type="button" onClick={() => ask(item.question)} disabled={isTyping}>
              {item.label}
            </button>
          ))}
        </div>

        {contextLabel && <p className="context-note" role="status">{contextLabel}</p>}

        {showQueryBuilder && (
          <section className="query-builder" aria-label="BIGKinds 검색식 만들기">
            <div className="query-builder-heading">
              <strong>추천 검색식</strong>
              <button type="button" onClick={() => setShowQueryBuilder(false)} aria-label="검색식 만들기 닫기">×</button>
            </div>
            <p className="query-builder-help">조건을 입력하면 AND, OR, NOT 규칙에 맞춰 검색식을 만듭니다.</p>
            {(["any", "all", "exact", "exclude"] as const).map((field) => {
              const labels = { any: "하나 이상 포함(OR)", all: "모두 포함(AND)", exact: "정확히 일치", exclude: "제외(NOT)" };
              return <div className="builder-field" key={field}>
                <label htmlFor={`builder-${field}`}>{labels[field]}</label>
                <div className="builder-input-row">
                  <input id={`builder-${field}`} value={queryBuilderText[field] || ""} onChange={(event) => setQueryBuilderText((current) => ({ ...current, [field]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); builderAdd(field); } }} placeholder="단어를 입력하세요" />
                  <button type="button" onClick={() => builderAdd(field)} aria-label={`${labels[field]} 추가`}>+</button>
                </div>
                <div className="builder-chips">{(queryBuilder[field] || []).map((term, index) => <button type="button" key={`${term}-${index}`} onClick={() => builderRemove(field, index)}>{term} ×</button>)}</div>
              </div>;
            })}
            <output className="query-result" aria-live="polite">{builtSearchQuery || "검색어를 입력해 주세요"}</output>
            <p className="query-description">{builtSearchDescription}</p>
            <div className="query-actions">
              <button type="button" disabled={!builtSearchQuery} onClick={applySearchQuery}>검색창에 적용</button>
              <button type="button" disabled={!builtSearchQuery} onClick={() => copyText(builtSearchQuery)}>검색식 복사</button>
              <button type="button" onClick={() => emitHostAction({ type: "OPEN_URL", label: "뉴스검색 화면 열기", url: "https://www.bigkinds.or.kr/v2/news/search.do" })}>뉴스검색 화면 열기</button>
            </div>
            <small>BIGKinds 검색연산자는 AND, OR, NOT을 대문자로 입력합니다.</small>
          </section>
        )}

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
                    {message.apiRedirect && <div className="api-redirect"><button type="button" onClick={() => emitHostAction({ type: "OPEN_URL", label: "뉴스토어에서 OPEN API 문의하기", url: OPEN_API_PURCHASE_URL })}>뉴스토어에서 OPEN API 문의하기 ↗</button></div>}
                    {message.answerModel && (
                      <div className="structured-answer">
                        <button className="answer-expand" type="button" aria-expanded={Boolean(expandedMessages[message.id])} onClick={() => setExpandedMessages((current) => ({ ...current, [message.id]: !current[message.id] }))}>{expandedMessages[message.id] ? "간단히 보기" : "자세히 보기"}</button>
                        {expandedMessages[message.id] && <p className="answer-full">{message.answerModel.details}</p>}
                        {message.answerModel.steps.length > 0 && <div className="answer-block"><strong>이용 순서</strong><ol>{message.answerModel.steps.map((step) => <li key={step}>{formatAnswer(step)}</li>)}</ol></div>}
                        {message.answerModel.cautions.length > 0 && <div className="answer-block caution-block"><strong>주의</strong><ul>{message.answerModel.cautions.map((caution) => <li key={caution}>{formatAnswer(caution)}</li>)}</ul></div>}
                      </div>
                    )}
                    {message.diagnostic && <div className="diagnostic-flow"><strong>{message.diagnostic.title}</strong><div>{message.diagnostic.options.map((option) => <button type="button" key={option.label} onClick={() => ask(option.question)}>{option.label}</button>)}</div></div>}
                  </div>

                  {matched && (
                    <div className="answer-meta">
                      <div className="source-meta">
                      <a href={matched?.source?.url ?? FAQ_SOURCE_URL} target="_blank" rel="noreferrer">
                        공식 근거 확인 ↗
                      </a>
                      <span>{matched?.source?.label ?? "빅카인즈 공식 FAQ"}{matched?.source?.pages ? ` · ${matched.source.pages}` : ""}</span>
                      {matched?.authority && <small className="authority-badge">{matched.authority === "CURRENT_POLICY" ? "현행 정책" : matched.authority === "OFFICIAL_FAQ" ? "공식 FAQ" : matched.authority === "OFFICIAL_INTRO" ? "공식 소개" : matched.authority === "VERIFIED_QNA" ? "검증된 Q&A" : "과거 Q&A 참고"}{matched.status === "REVIEW_REQUIRED" ? " · 검토 필요" : ""}</small>}
                      {matched?.effectiveDate && <small className="effective-date">기준일 {matched.effectiveDate}</small>}
                    </div>
                      <div className="feedback" aria-label="답변 평가">
                        <span>도움이 됐나요?</span>
                        <button
                          type="button"
                          className={feedback[message.id] === "up" ? "selected" : ""}
                          onClick={() => handleFeedback(message.id, "up")}
                          aria-label="도움이 됐어요"
                        >＋</button>
                        <button
                          type="button"
                          className={feedback[message.id] === "down" ? "selected" : ""}
                          onClick={() => handleFeedback(message.id, "down")}
                          aria-label="도움이 안 됐어요"
                        >−</button>
                      </div>
                      {feedback[message.id] === "down" && <div className="feedback-reasons" role="group" aria-label="도움이 되지 않은 이유">{["답변이 틀렸어요", "정보가 오래됐어요", "질문과 다른 답이에요", "설명이 어려워요", "원하는 내용이 없어요"].map((reason) => <button type="button" key={reason} className={feedbackReasons[message.id] === reason ? "selected" : ""} onClick={() => handleFeedbackReason(message.id, reason)}>{reason}</button>)}</div>}
                    </div>
                  )}

                  {index === 0 && messages.length === 1 && (
                    <div className="starter-list">
                      {contextualStarters.map((question) => (
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
                      {message.isFallback && <div className="escalation-actions"><span>해결되지 않으면 문의 내용을 정리해 공식 Q&amp;A로 연결할 수 있습니다.</span><button type="button" onClick={() => copyText(`문의 유형: ${pageContext.pageType}\n질문: ${message.question || message.text}`)}>내용 복사</button><button type="button" onClick={() => emitHostAction({ type: "OPEN_QNA", label: "Q&A 열기", url: QNA_SOURCE_URL })}>Q&amp;A 열기</button></div>}
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
