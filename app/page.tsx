"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { FAQ_SOURCE_URL } from "../lib/faq";
import { searchFaq, SearchableDocument } from "../lib/search";
import { CHAT_HISTORY_KEY, formatAnswer, OPEN_API_PURCHASE_URL } from "../lib/answer-format";
import { buildAnswerViewModel, AnswerViewModel } from "../lib/answer-model";
import { classifyPagePath, createPageContext, pageTypeLabels, PageContext } from "../lib/page-context";
import { buildSearchQuery, describeSearchQuery, SearchQueryInput } from "../lib/search-query-builder";
import { detectDiagnosticKind, DiagnosticFlow, getDiagnosticFlow } from "../lib/diagnostic-flows";
import { recordFeedback } from "../lib/feedback";
import { detectSearchExpressionIntent, getDirectFaqId, isApiCommercialQuestion, isApiErrorQuestion, isArticleContentQuestion, isArticleDownloadMethodQuestion, isBroadServiceQuestion, isChatbotMetaQuestion, isDateQuestion, isEscalationQuestion, isKnowledgeDocumentsQuestion, isLikelyGeneralKnowledgeQuestion, isQnaRankingQuestion, isSearchUsageQuestion, isStoredArticleCountQuestion, isUnderspecifiedQuestion, todayInKorea } from "../lib/question-intents";
import { generateRecommendedQuestions } from "../lib/recommendations";
import { applyKnowledgeAuthority } from "../lib/knowledge-authority";
import { assessPrivacy } from "../lib/privacy";
import { decideSearch } from "../lib/search-decision";

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
  searchQuery?: { value: string; description: string };
  usedSupplement?: boolean;
};

const welcomeMessage: Message = {
  id: 1,
  role: "assistant",
  text: "안녕하세요. 빅카인즈 공식 Q&A·FAQ·소개·정책 문서를 바탕으로 뉴스 검색·분석 이용 방법을 안내해 드릴게요. 기사 원문 검색·요약은 지원하지 않으니 궁금한 이용 방법을 편하게 물어보세요.",
};

const LLM_CLIENT_ENABLED = String(process.env.NEXT_PUBLIC_LLM_ENABLED || "").toLowerCase() === "true";

const categoryPrompts = [
  { label: "검색 사용법", question: "검색어는 어떤 방식으로 조합하나요?" },
  { label: "OPEN API", question: "OPEN API 관련 문의는 어디로 해야 하나요?" },
];

const dataScriptPaths = [
  "/data/config.js",
  "/data/official-faq.js",
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
  if (!assessPrivacy(question).shouldSave) return;
  try {
    const current = JSON.parse(window.localStorage.getItem(CHAT_HISTORY_KEY) || "[]");
    const next = [{ id: `${Date.now()}-${item.id}`, question, answer, category: item.category,
      sourceLabel: item.source?.label, sourceUrl: item.source?.url ?? FAQ_SOURCE_URL,
      createdAt: new Date().toISOString() }, ...current].slice(0, 100);
    window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(next));
  } catch { /* 저장이 차단된 환경에서도 답변은 계속 제공합니다. */ }
}

function normalizeKnowledgeDocument(document: SearchableDocument): SearchableDocument {
  return applyKnowledgeAuthority({
    ...document,
    question: document.question || document.title || document.questions?.[0] || "공식 안내",
    category: document.category || "기타",
    keywords: document.keywords || [],
    answer: document.answer || "공식 답변을 확인해 주세요.",
  });
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
  const [embedded] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "1");
  const [chatOpen, setChatOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "1");
  const [selectedKnowledgeType, setSelectedKnowledgeType] = useState<KnowledgeType | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<SearchableDocument[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [feedback, setFeedback] = useState<Record<number, "up" | "down">>({});
  const [feedbackReasons, setFeedbackReasons] = useState<Record<number, string>>({});
  const [expandedMessages, setExpandedMessages] = useState<Record<number, boolean>>({});
  const [pageContext, setPageContext] = useState<PageContext>(() => createPageContext(typeof window !== "undefined" ? window.location.pathname : "/"));
  const [showQueryBuilder, setShowQueryBuilder] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(true);
  const [recommendedQuestions, setRecommendedQuestions] = useState<string[]>(() => generateRecommendedQuestions("HOME", []));
  const [queryBuilder, setQueryBuilder] = useState<SearchQueryInput>({ any: [], all: [], exact: [], exclude: [] });
  const [queryBuilderText, setQueryBuilderText] = useState<Record<string, string>>({ any: "", all: "", exact: "", exclude: "" });
  const nextId = useRef(2);
  const endRef = useRef<HTMLDivElement>(null);
  const knowledgeRef = useRef<SearchableDocument[]>([]);

  useEffect(() => {
    const onContext = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || event.data.type !== "bigkinds-chatbot-context") return;
      const incoming = event.data.context as Partial<PageContext>;
      if (!incoming || typeof incoming.pathname !== "string") return;
      setPageContext({
        pathname: incoming.pathname,
        pageType: incoming.pageType || classifyPagePath(incoming.pathname),
        loggedIn: incoming.loggedIn ?? null,
      });
      const incomingPageType = incoming.pageType || classifyPagePath(incoming.pathname);
      setRecommendedQuestions((current) => generateRecommendedQuestions(incomingPageType, knowledgeRef.current, current));
      setShowRecommendations(true);
    };
    window.addEventListener("message", onContext);

    let cancelled = false;
    (async () => {
      try {
        for (const path of dataScriptPaths) await loadScript(path);
        const documents = window.BIGKINDS_KNOWLEDGE_BASE?.documents ?? [];
        if (!cancelled && documents.length) {
          const normalized = documents.map(normalizeKnowledgeDocument);
          knowledgeRef.current = normalized;
          setKnowledge(normalized);
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

  const contextLabel = pageTypeLabels[pageContext.pageType];

  const builtSearchQuery = useMemo(() => buildSearchQuery(queryBuilder), [queryBuilder]);
  const builtSearchDescription = useMemo(() => describeSearchQuery(queryBuilder), [queryBuilder]);

  function openKnowledgeGroup(group: KnowledgeGroup) {
    if (!dataReady || group.count === 0) return;
    setSelectedKnowledgeType(group.key);
    const firstDocument = knowledge.find((document) => getKnowledgeType(document) === group.key);
    setSelectedDocumentId(firstDocument?.id ?? null);
  }

  function openChat() {
    setChatOpen(true);
    setRecommendedQuestions((current) => generateRecommendedQuestions(pageContext.pageType, knowledge, current));
    setShowRecommendations(true);
  }

  function emitHostAction(action: { type: string; label?: string; url?: string; value?: string }) {
    if (window.parent === window) {
      if (action.type === "OPEN_URL" && action.url) window.open(action.url, "_blank", "noopener,noreferrer");
      return;
    }
    const parentOrigin = document.referrer ? (() => { try { return new URL(document.referrer).origin; } catch { return ""; } })() : "";
    const allowedOrigins = new Set([
      "https://www.bigkinds.or.kr",
      "https://bigkinds.or.kr",
      "http://localhost:3000",
      "http://localhost:3001",
    ]);
    if (!allowedOrigins.has(parentOrigin)) return;
    window.parent.postMessage({ type: "bigkinds-chatbot-action", action }, parentOrigin);
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

  function retryQuestion(message: Message) {
    if (message.question) ask(message.question);
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
    setShowRecommendations(false);

    const diagnosticKind = detectDiagnosticKind(cleanQuestion, pageContext.pageType);
    const privacy = assessPrivacy(cleanQuestion);
    const dateQuestion = isDateQuestion(cleanQuestion) && !isSearchUsageQuestion(cleanQuestion);
    const searchExpressionIntent = detectSearchExpressionIntent(cleanQuestion);
    const generalKnowledgeQuestion = !privacy.hasSensitiveValue && isLikelyGeneralKnowledgeQuestion(cleanQuestion);

    window.setTimeout(async () => {
      if (dateQuestion) {
        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            role: "assistant",
            text: `오늘은 ${todayInKorea()}입니다.\n\n한국 표준시(KST) 기준으로 안내했어요.`,
            question: cleanQuestion,
          },
        ]);
        setIsTyping(false);
        return;
      }

      if (isChatbotMetaQuestion(cleanQuestion)) {
        setMessages((current) => [...current, {
          id: nextId.current++,
          role: "assistant",
          text: "저는 빅카인즈 공식 FAQ·Q&A·소개 자료를 찾아 이용 방법을 안내하는 챗봇입니다. 검색·분석, 뉴스데이터, OPEN API, 회원·접속 문제를 도와드리며, 확인되지 않은 내용은 추측하지 않습니다.",
          question: cleanQuestion,
        }]);
        setIsTyping(false);
        return;
      }

      if (searchExpressionIntent) {
        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            role: "assistant",
            text: "요청하신 조건으로 BIG KINDS 검색식을 만들었습니다.",
            searchQuery: { value: searchExpressionIntent.query, description: searchExpressionIntent.description },
            question: cleanQuestion,
          },
        ]);
        setIsTyping(false);
        return;
      }

      if (isStoredArticleCountQuestion(cleanQuestion)) {
        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            role: "assistant",
            text: `이 챗봇에 저장된 데이터는 뉴스 기사 원문 전체가 아니라 빅카인즈 공식 Q&A·FAQ·소개·정책 문서입니다. 현재 ${dataReady ? `${knowledge.length}건의 공식 문서` : "확인 가능한 공식 문서"}가 저장되어 있으며, 빅카인즈 전체 기사 보유 건수는 이 챗봇 데이터만으로 확인할 수 없습니다.`,
            isFallback: true,
            question: cleanQuestion,
          },
        ]);
        setIsTyping(false);
        return;
      }

      if (isKnowledgeDocumentsQuestion(cleanQuestion)) {
        const groups = knowledgeGroups.filter((group) => group.count > 0).map((group) => `${group.label} ${group.count}건`);
        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            role: "assistant",
            text: `${groups.length ? `현재 검색 문서는 ${groups.join(", ")}로 구성되어 있습니다. ` : "검색 문서 유형을 확인하는 중입니다. "}뉴스 기사 원문 전체가 아니라 빅카인즈 공식 Q&A·FAQ·소개·정책 자료를 저장하며, 근거가 없는 질문에는 임의로 답변하지 않습니다.`,
            isFallback: true,
            question: cleanQuestion,
          },
        ]);
        setIsTyping(false);
        return;
      }

      if (isQnaRankingQuestion(cleanQuestion)) {
        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            role: "assistant",
            text: "저장된 Q&A 문서에는 조회수·추천수 같은 순위 정보가 없어 ‘가장 많이 묻는 Q&A Top 10’을 산정할 수 없습니다. 질문별 이용 빈도는 제공되지 않으므로, 아래 추천 질문이나 검색창에서 주제를 직접 찾아보세요.",
            isFallback: true,
            question: cleanQuestion,
          },
        ]);
        setIsTyping(false);
        return;
      }

      if (isUnderspecifiedQuestion(cleanQuestion)) {
        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            role: "assistant",
            text: "어떤 주제의 예시가 필요한지 조금 더 알려주세요. 예를 들어 ‘검색식을 만드는 예시를 보여줘’처럼 질문해 주시면 저장된 공식 문서를 기준으로 안내하겠습니다.",
            isFallback: true,
            question: cleanQuestion,
          },
        ]);
        setIsTyping(false);
        return;
      }

      if (isArticleDownloadMethodQuestion(cleanQuestion)) {
        const downloadDocument = knowledge.find((item) => item.id === "official-faq-18");
        if (downloadDocument) {
          const answerModel = buildAnswerViewModel(downloadDocument);
          setMessages((current) => [...current, {
            id: nextId.current++,
            role: "assistant",
            text: answerModel.summary,
            matchedId: downloadDocument.id,
            answerModel,
            question: cleanQuestion,
          }]);
          saveHistory(cleanQuestion, downloadDocument.answer, downloadDocument);
          setIsTyping(false);
          return;
        }
      }

      const directFaqId = getDirectFaqId(cleanQuestion);
      if (directFaqId) {
        const directDocument = knowledge.find((item) => item.id === directFaqId);
        if (directDocument) {
          const answerModel = buildAnswerViewModel(directDocument);
          setMessages((current) => [...current, {
            id: nextId.current++,
            role: "assistant",
            text: answerModel.summary,
            matchedId: directDocument.id,
            answerModel,
            question: cleanQuestion,
          }]);
          saveHistory(cleanQuestion, directDocument.answer, directDocument);
          setIsTyping(false);
          return;
        }
      }

      if (isArticleContentQuestion(cleanQuestion)) {
        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            role: "assistant",
            text: "이 챗봇에는 뉴스 기사 원문이 저장되어 있지 않아 특정 기사의 요약·본문·내용을 제공할 수 없습니다. 빅카인즈 사이트에서 기사를 직접 확인한 뒤, 검색·분석 이용 방법을 질문해 주세요.",
            isFallback: true,
            question: cleanQuestion,
          },
        ]);
        setIsTyping(false);
        return;
      }

      if (generalKnowledgeQuestion) {
        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            role: "assistant",
            text: "질문의 의도는 일반 상식·시사 정보 확인으로 보이지만, 저장된 빅카인즈 공식 문서에는 해당 내용이 없습니다. 이 챗봇은 빅카인즈 이용 방법과 공식 Q&A 범위에서만 답변할 수 있어요.",
            isFallback: true,
            question: cleanQuestion,
          },
        ]);
        setIsTyping(false);
        return;
      }

      if (!isApiErrorQuestion(cleanQuestion) && isEscalationQuestion(cleanQuestion)) {
        setMessages((current) => [...current, {
          id: nextId.current++,
          role: "assistant",
          text: "이용 범위·계약·권한 또는 최신 정책 확인이 필요한 질문입니다. 저장된 과거 Q&A로 조건을 확정하지 않고, 공식 원문과 담당자 확인을 권합니다.",
          isFallback: true,
          question: cleanQuestion,
        }]);
        setIsTyping(false);
        return;
      }

      if (isBroadServiceQuestion(cleanQuestion)) {
        setMessages((current) => [...current, {
          id: nextId.current++,
          role: "assistant",
          text: "어떤 기능이나 상황을 확인하려는지 조금 더 알려주세요. 예를 들어 ‘검색식을 만드는 방법’, ‘다운로드한 파일이 열리지 않음’, ‘API 신청 방법’처럼 질문해 주시면 관련 공식 문서를 찾아드릴게요.",
          isFallback: true,
          question: cleanQuestion,
        }]);
        setIsTyping(false);
        return;
      }

      const apiCommercial = isApiCommercialQuestion(cleanQuestion) && !privacy.hasSensitiveValue;
      const apiError = isApiErrorQuestion(cleanQuestion);
      const searchHelp = /검색식|검색어|연산자/i.test(cleanQuestion) && /어떻게|방법|사용|쓰|조합/i.test(cleanQuestion);
      const searchHelpDocument = searchHelp ? knowledge.find((item) => item.id === "official-faq-17") : undefined;
      const searchUsageDocument = isSearchUsageQuestion(cleanQuestion)
        ? knowledge.find((item) => item.id === "bigkinds-intro-overview")
        : undefined;
      const results = searchHelpDocument
        ? [{ item: searchHelpDocument, score: 999 }]
        : searchUsageDocument
          ? [{ item: searchUsageDocument, score: 999 }]
          : searchFaq(cleanQuestion, 8, knowledge);
      const privacyDocument = knowledge.find((item) => item.id === "official-faq-30");
      const safeResults = privacy.hasSensitiveValue && privacyDocument
        ? [{ item: privacyDocument, score: 999, exactMatch: true }]
        : results;
      const decision = privacy.hasSensitiveValue
        ? { action: "ESCALATE" as const, confidence: "HIGH" as const, candidates: safeResults, eligible: safeResults[0], reason: "민감한 값은 자동 처리하지 않습니다." }
        : decideSearch(cleanQuestion, safeResults);
      const best = decision.eligible;
      const assistantId = nextId.current++;

      if (privacy.hasSensitiveValue) {
        setMessages((current) => [...current, {
          id: assistantId,
          role: "assistant",
          text: "개인정보·비밀번호·인증키 같은 실제 값을 입력하지 마세요. 입력한 값은 자동 답변과 대화 기록에 사용하지 않으며, 이미 입력했다면 해당 메시지를 삭제하고 공식 담당자에게 직접 확인해 주세요.",
          isFallback: true,
          question: cleanQuestion,
          relatedIds: privacyDocument ? [privacyDocument.id] : [],
        }]);
      } else if (apiError && diagnosticKind) {
        setMessages((current) => [...current, {
          id: assistantId,
          role: "assistant",
          text: getDiagnosticFlow(diagnosticKind).title,
          diagnostic: getDiagnosticFlow(diagnosticKind),
          question: cleanQuestion,
        }]);
      } else if (apiCommercial) {
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
      } else if (diagnosticKind && cleanQuestion.length < 80) {
        setMessages((current) => [
          ...current,
          { id: assistantId, role: "assistant", text: getDiagnosticFlow(diagnosticKind).title, diagnostic: getDiagnosticFlow(diagnosticKind), question: cleanQuestion },
        ]);
      } else if (decision.action === "ESCALATE") {
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: "assistant",
            text: "관련 문서는 찾았지만 현재 정책·계약·권한 또는 과거 Q&A의 확인이 필요한 내용입니다. 최신 조건을 임의로 확정하지 않고, 공식 원문과 담당자 확인을 권합니다.",
            isFallback: true,
            question: cleanQuestion,
            relatedIds: decision.candidates.slice(0, 3).map((result) => result.item.id),
          },
        ]);
      } else if (decision.action === "CLARIFY") {
        setMessages((current) => [...current, {
          id: assistantId,
          role: "assistant",
          text: "질문의 범위를 조금 더 좁혀 주시면 정확하게 안내할 수 있어요. 아래 관련 문서 중 어떤 내용이 필요한지 선택해 주세요.",
          isFallback: true,
          question: cleanQuestion,
          relatedIds: decision.candidates.slice(0, 3).map((result) => result.item.id),
        }]);
      } else if (decision.action === "NO_MATCH" || !best) {
        setMessages((current) => [...current, {
          id: assistantId,
          role: "assistant",
          text: "저장된 공식 문서에서 질문과 직접 관련된 내용을 찾지 못했어요. 이 챗봇은 빅카인즈 FAQ·정책·소개·Q&A 범위에서만 안내합니다.",
          isFallback: true,
          question: cleanQuestion,
        }]);
      } else {
        const answerModel = buildAnswerViewModel(best.item);
        const supplementAnswer = LLM_CLIENT_ENABLED && decision.confidence === "HIGH" && privacy.shouldSendToLlm
          ? await requestLlmAnswer(cleanQuestion, messages)
          : null;
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: "assistant",
            text: supplementAnswer || answerModel.summary,
            matchedId: best.item.id,
            relatedIds: decision.candidates.slice(1, 4).map((result) => result.item.id),
            answerModel,
            question: cleanQuestion,
            usedSupplement: Boolean(supplementAnswer),
          },
        ]);
        saveHistory(cleanQuestion, supplementAnswer || best.item.answer, best.item);
      }

      setIsTyping(false);
    }, 420);
  }

  async function requestLlmAnswer(question: string, history: Message[]) {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          history: history.slice(-6).map((message) => ({ role: message.role, text: message.text })).filter((turn) => assessPrivacy(turn.text).shouldSendToLlm),
        }),
      });
      if (!response.ok) return null;
      const payload = await response.json() as { answer?: unknown };
      return typeof payload.answer === "string" && payload.answer.trim() ? payload.answer.trim() : null;
    } catch {
      return null;
    }
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
    setRecommendedQuestions((current) => generateRecommendedQuestions(pageContext.pageType, knowledge, current));
    setShowRecommendations(true);
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
                <strong>BIG KINDS</strong>
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
                뉴스 검색·분석 이용 방법과 OPEN API 문의 경로를 공식 안내와 Q&amp;A에서 찾아
                이해하기 쉬운 답변으로 정리해 드립니다. 기사 원문 검색·요약은 제공하지 않습니다.
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
                <p><strong>공식 자료를 우선합니다.</strong> 근거가 없으면 추측하지 않습니다.<br />빅카인즈 Q&amp;A는 저장된 공식 문서를 기준으로 안내합니다.</p>
              </div>
              <p className="guest-landing-note">로그인 없이 공식 안내를 먼저 확인해보세요.</p>
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

      {(embedded || chatOpen) && <section className="chat-widget" aria-label="빅카인즈 이용 도우미 · Q&A">
        <header className="chat-header">
          <div className="bot-identity">
            <span className="bot-avatar">B</span>
            <div>
              <strong>빅카인즈 이용 도우미 · Q&amp;A</strong>
              <span><i /> {dataReady ? `공식 문서 ${knowledge.length}건 · 기사 원문 0건` : "공식 문서 연결 중"}</span>
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

        {showRecommendations && (
          <section className="recommendation-panel" aria-label="추천 질문">
            <div className="recommendation-heading"><strong>지금 많이 묻는 질문</strong><span>페이지에 맞춰 추천합니다</span></div>
            <div className="recommendation-list">
              {recommendedQuestions.map((question) => <button key={question} type="button" onClick={() => ask(question)} disabled={isTyping}>{question}<span aria-hidden="true">›</span></button>)}
            </div>
            <details className="question-guide">
              <summary>질문을 더 정확하게 작성하는 방법</summary>
              <p><strong>[시점] + [목표] + [형식] + [어투] + [지시어]</strong></p>
              <div>
                {["최근 한 달간 ○○ 관련 뉴스 검색 방법을 요약해줘", "A언론사와 B언론사의 검색 결과를 비교해줘", "이 문서를 요약하고 관련 검색 방법을 알려줘"].map((example) => <button key={example} type="button" onClick={() => { setQuery(example); }}>{example}</button>)}
              </div>
            </details>
          </section>
        )}

        {showQueryBuilder && (
          <section className="query-builder" aria-label="BIG KINDS 검색식 만들기">
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
            <small>BIG KINDS 검색연산자는 AND, OR, NOT을 대문자로 입력합니다.</small>
          </section>
        )}

        <div className="conversation" aria-live="polite">
          <div className="day-divider"><span>오늘</span></div>
          {messages.map((message) => {
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
                    {message.searchQuery && <div className="search-query-answer"><strong>추천 검색식</strong><code>{message.searchQuery.value}</code><p>{message.searchQuery.description}</p><div><button type="button" onClick={() => emitHostAction({ type: "APPLY_SEARCH_QUERY", label: "검색창에 적용", value: message.searchQuery?.value })}>검색창에 적용</button><button type="button" onClick={() => copyText(message.searchQuery?.value || "")}>검색식 복사</button></div></div>}
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
                      <strong className="source-heading">관련 공식 문서(출처)</strong>
                      <a href={matched?.source?.url ?? FAQ_SOURCE_URL} target="_blank" rel="noreferrer">
                        {matched.title || matched.question} ↗
                      </a>
                      <span>{matched?.source?.label ?? "빅카인즈 공식 FAQ"}{matched?.source?.pages ? ` · ${matched.source.pages}` : ""}</span>
                      <small className="source-guidance">정확한 정보는 위 공식 원문을 확인해 주세요.</small>
                      {message.usedSupplement && <small className="authority-badge">공식 문서 기반 문장 보완</small>}
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
                      <div className="answer-tools" aria-label="답변 도구">
                        <button type="button" onClick={() => copyText(message.text)}>답변 복사</button>
                        {message.question && <button type="button" onClick={() => retryQuestion(message)} disabled={isTyping}>다시 답변</button>}
                      </div>
                      {feedback[message.id] === "down" && <div className="feedback-reasons" role="group" aria-label="도움이 되지 않은 이유">{["답변이 틀렸어요", "정보가 오래됐어요", "질문과 다른 답이에요", "설명이 어려워요", "원하는 내용이 없어요"].map((reason) => <button type="button" key={reason} className={feedbackReasons[message.id] === reason ? "selected" : ""} onClick={() => handleFeedbackReason(message.id, reason)}>{reason}</button>)}</div>}
                    </div>
                  )}

                  {!matched && message.role === "assistant" && (
                    <div className="answer-no-source">관련 기사를 찾지 못했습니다. 이 챗봇은 저장된 공식 문서 범위 밖의 내용을 추측하지 않습니다.</div>
                  )}

                  {(related.length > 0 || message.isFallback) && (
                    <div className="related-list">
                      <span>{message.isFallback ? "이런 주제는 답할 수 있어요" : "함께 볼 질문"}</span>
                      {(message.isFallback
                        ? (message.relatedIds?.length ? related : knowledge.filter((item) => item.status === "CURRENT").slice(0, 3))
                        : related).map((item) => item && (
                        <button key={item.id} type="button" onClick={() => ask(item.question)}>
                          {item.question}
                        </button>
                      ))}
                      {message.isFallback && <div className="escalation-actions"><span>해결되지 않으면 공식 Q&amp;A에서 담당자에게 문의할 수 있습니다.</span><button type="button" onClick={() => emitHostAction({ type: "OPEN_QNA", label: "Q&amp;A 열기", url: QNA_SOURCE_URL })}>Q&amp;A 열기</button></div>}
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
          <p className="disclaimer">빅카인즈 Q&amp;A는 저장된 공식 Q&amp;A·FAQ·소개·정책 문서를 기준으로 안내합니다.<br />정확한 정보와 최신 내용은 출처로 함께 제공되는 공식 원문을 확인해 주세요.</p>
        </form>
      </section>}
      {!embedded && !chatOpen && (
        <button className="page-launcher" type="button" onClick={openChat} aria-label="빅카인즈 이용 도우미 열기">
          B<span aria-hidden="true" />
        </button>
      )}
    </main>
  );
}
