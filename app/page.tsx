"use client";

import { FormEvent, startTransition, useEffect, useMemo, useRef, useState } from "react";
import { FAQ_SOURCE_URL, faqItems } from "../lib/faq";
import { isAnswerableDocument, searchFaq, SearchableDocument } from "../lib/search";
import { evaluateSearchConfidence } from "../lib/search-confidence";
import { formatAnswer, OPEN_API_PURCHASE_URL } from "../lib/answer-format";
import { buildAnswerViewModel, AnswerViewModel } from "../lib/answer-model";
import { classifyPagePath, createPageContext, pageTypeLabels, PageContext } from "../lib/page-context";
import { buildSearchQuery, describeSearchQuery, validateSearchInput, SearchQueryInput } from "../lib/search-query-builder";
import { normalizeSearchInput } from "../lib/search-term-normalizer";
import { detectDiagnosticKind, DiagnosticFlow, getDiagnosticFlow } from "../lib/diagnostic-flows";
import { recordFeedback } from "../lib/feedback";
import { classifySearchTurn, detectSearchExpressionIntent, extractSimpleSearchGoal, isArticleContentQuestion, isChatbotMetaQuestion, isDateQuestion, isKnowledgeDocumentsQuestion, isLikelyGeneralKnowledgeQuestion, isOpenApiQuestion, isQnaRankingQuestion, isSearchGoalQuestion, isSearchUsageQuestion, isStoredArticleCountQuestion, isUnderspecifiedQuestion, todayInKorea } from "../lib/question-intents";
import { generateRecommendedQuestions } from "../lib/recommendations";
import { capabilitySourcesExist, getCapabilitiesById, recommendCapabilities, Capability } from "../lib/capabilities";
import { recordInsight } from "../lib/insights";
import { routeUserIntent } from "../lib/intent-router";
import type { UserIntent } from "../lib/intent-router";
import { diagnoseSearchExpression, parseSearchExpression, SearchDiagnosis } from "../lib/search-diagnostics";
import { archiveChatSession, ChatSession, createChatSession, loadActiveChatSession, PersistedChatMessage, PersistedMessageAction, saveActiveChatSession, shouldStartNewSession } from "../lib/chat-session";
import type { AiInterpretation, AiIntent, AiRouterResponse, AiSearchInput, AiSuggestedTerms, AiTask } from "../lib/ai/types";
import { applySearchTurn, createSearchContext, emptySearchContext, getSearchContextStatus } from "../lib/search-context";
import type { SearchContext, SearchTurnResult } from "../lib/search-context";
import { buildLookupStrategies, type LookupStrategy } from "../lib/article-lookup-strategy";
import { createArticleLookupHistorySummary, createLookupReplyDraft, emptyArticleLookupContext, extractArticleLookupCase, isHistoricalArticleLookupQuestion, sanitizeLookupRequestForHistory, updateArticleLookupCase, type ArticleLookupCase, type ArticleLookupContext, type ArticleLookupResultStatus } from "../lib/article-lookup";
import { createSupportCase, summarizeSupportCase, summarizeSupportRequest, type SupportCase, type SupportIssueKind } from "../lib/support-case";
import { detectSupportIssues, supportIssueLabel } from "../lib/support-routing";
import { getPolicyHandoff, type PolicyHandoff } from "../lib/policy-safety";

declare global {
  interface Window {
    BIGKINDS_KNOWLEDGE_BASE?: { documents?: SearchableDocument[]; updatedAt?: string };
  }
}

type Message = {
  id: number | string;
  role: "assistant" | "user";
  text: string;
  matchedId?: string;
  relatedIds?: string[];
  isFallback?: boolean;
  answerModel?: AnswerViewModel;
  diagnostic?: DiagnosticFlow;
  supportCase?: SupportCase;
  supportDiagnostics?: DiagnosticFlow[];
  question?: string;
  apiRedirect?: boolean;
  searchQuery?: { value: string; description: string; input?: AiSearchInput };
  usedSupplement?: boolean;
  capabilities?: Capability[];
  capabilityComparison?: Capability[];
  fallbackKind?: "SEARCH_GOAL";
  actions?: PersistedMessageAction[];
  intent?: string;
  capabilityId?: string;
  searchDiagnosis?: SearchDiagnosis;
  manualReference?: { label: string; section: string };
  articleLookupCase?: ArticleLookupCase;
  lookupStrategies?: LookupStrategy[];
  lookupResultStatus?: ArticleLookupResultStatus;
  replyDraft?: string;
  articleLookupRequest?: boolean;
  supportRequest?: boolean;
  policyHandoff?: boolean;
  suggestedTerms?: AiSuggestedTerms[];
};

type StartMode = "NEWS_FIND" | "SEARCH_BUILD" | "SEARCH_DIAGNOSIS" | "FEATURE_RECOMMENDATION" | "TROUBLESHOOT" | "USAGE_GUIDE" | "ARTICLE_LOOKUP" | null;
type PurposeMode = Exclude<StartMode, null> | "OPEN_API";
type SearchWorkingState = {
  lastIntent: AiIntent | UserIntent | null;
  lastSearchInput: AiSearchInput | null;
  lastGeneratedQuery: string | null;
  lastCapabilityId: string | null;
  activeMode: StartMode;
  lastSearchMode: SearchTurnResult["mode"] | null;
  searchRevision: number;
  searchStartedAt: string | null;
  searchContext: SearchContext;
  articleLookupContext: ArticleLookupContext;
};

const welcomeMessage: Message = {
  id: 1,
  role: "assistant",
  text: "안녕하세요. 빅카인즈 공식 Q&A·FAQ·소개·정책 문서를 바탕으로 뉴스 검색·분석 이용 방법을 안내해 드릴게요. 기사 원문 검색·요약은 지원하지 않으니 궁금한 이용 방법을 편하게 물어보세요.",
};

const purposeMenu: Array<{ label: string; description: string; mode: PurposeMode }> = [
  { label: "뉴스 찾기", description: "원하는 주제의 기사 찾기", mode: "NEWS_FIND" },
  { label: "기사·자료 찾기", description: "날짜·언론사·인물·사건 단서로 과거 기사와 지면 자료를 찾습니다.", mode: "ARTICLE_LOOKUP" },
  { label: "검색식 만들기", description: "AND·OR·NOT 없이 조건 만들기", mode: "SEARCH_BUILD" },
  { label: "검색식 진단", description: "검색식 의도와 괄호 확인", mode: "SEARCH_DIAGNOSIS" },
  { label: "기능 추천", description: "목적에 맞는 기능 찾기", mode: "FEATURE_RECOMMENDATION" },
  { label: "문제 해결", description: "검색·다운로드 문제 해결", mode: "TROUBLESHOOT" },
  { label: "이용 안내", description: "수록·다운로드·분석 안내", mode: "USAGE_GUIDE" },
  { label: "OPEN API", description: "뉴스토어 신청·계약 안내", mode: "OPEN_API" },
];

const searchGoalFallbackQuestions = [
  "검색식 만들어보기",
  "검색조건을 더 자세히 입력하기",
  "검색식 사용법 보기",
];

const dataScriptPaths = [
  "/data/config.js",
  "/data/official-faq.js",
  "/data/verified-policy.js",
  "/data/qna-import.js",
  ...Array.from({ length: 21 }, (_, index) => `/data/qna-data-${String(index + 1).padStart(2, "0")}.js`),
  "/data/support-manual.js",
  "/data/openapi-reference.js",
  "/data/knowledge-base.js",
  "/data/official-intro.js",
  "/data/manual-knowledge.js",
  "/data/historical-lookup.js",
];

const QNA_SOURCE_URL = "https://www.bigkinds.or.kr/news/qnaList.do";
const materialTypeLabels: Record<ArticleLookupCase["materialType"], string> = {
  ARTICLE: "기사",
  PAGE: "신문 지면",
  BOX_LIST: "지면 내 명단·박스 가능성",
  AWARD_LIST: "수상자·표창 명단 가능성",
  ADVERTISEMENT: "광고 가능성",
  UNKNOWN: "미확인",
};

const supportIssueInsightEvents: Partial<Record<SupportIssueKind, "SEARCH_FILTER_PROBLEM" | "MEMBERSHIP_EMAIL_PROBLEM" | "AUDIO_PLAYBACK_PROBLEM" | "RIGHTS_LICENSE_INQUIRY" | "RIGHTS_RESEARCH_INQUIRY">> = {
  SEARCH_FILTER_PROBLEM: "SEARCH_FILTER_PROBLEM",
  MEMBERSHIP_EMAIL_PROBLEM: "MEMBERSHIP_EMAIL_PROBLEM",
  AUDIO_PLAYBACK_PROBLEM: "AUDIO_PLAYBACK_PROBLEM",
  RIGHTS_LICENSE: "RIGHTS_LICENSE_INQUIRY",
  RIGHTS_RESEARCH: "RIGHTS_RESEARCH_INQUIRY",
};

const SUPPORT_QNA_URL = QNA_SOURCE_URL;

function loadScript(path: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = path;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`데이터를 불러오지 못했습니다: ${path}`));
    document.head.appendChild(script);
  });
}

function normalizeKnowledgeDocument(document: SearchableDocument): SearchableDocument {
  const authority = document.authority ?? (document.id.startsWith("official-faq-") ? "OFFICIAL_FAQ" : document.id.startsWith("bigkinds-intro-") ? "CURRENT_OFFICIAL_INTRO" : document.id.startsWith("manual-") ? "USER_MANUAL_V4_2" : document.id.startsWith("qna-") ? "VERIFIED_QNA" : "CURRENT_POLICY");
  const status = document.status === "SUPERSEDED"
    ? "SUPERSEDED"
    : document.requiresReview === true || document.alwaysEscalate === true
      ? "REVIEW_REQUIRED"
      : document.status ?? (document.id.startsWith("qna-") ? "REVIEW_REQUIRED" : "CURRENT");
  return {
    ...document,
    question: document.question || document.title || document.questions?.[0] || "공식 안내",
    category: document.category || "기타",
    keywords: document.keywords || [],
    answer: document.answer || "공식 답변을 확인해 주세요.",
    answerMode: document.answerMode ?? (document.requiresReview === true || document.alwaysEscalate === true ? "HANDOFF_ONLY" : "USER_FACING"),
    authority,
    status,
  };
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

function toPersistedMessage(message: Message): PersistedChatMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.articleLookupRequest ? sanitizeLookupRequestForHistory(message.text) : message.supportRequest ? summarizeSupportRequest(message.text, message.supportCase?.issues || detectSupportIssues(message.text)) : message.text,
    matchedId: message.matchedId,
    relatedIds: message.relatedIds,
    isFallback: message.isFallback,
    question: message.articleLookupRequest && message.question ? sanitizeLookupRequestForHistory(message.question) : message.supportRequest && message.question ? summarizeSupportRequest(message.question, message.supportCase?.issues || detectSupportIssues(message.question)) : message.question,
    apiRedirect: message.apiRedirect,
    searchQuery: message.searchQuery ? { value: message.searchQuery.value, description: message.searchQuery.description } : undefined,
    searchInput: message.searchQuery?.input,
    capabilityId: message.capabilityId || message.capabilities?.[0]?.id,
    capabilityIds: message.capabilities?.map((capability) => capability.id),
    intent: message.intent,
    actions: message.actions,
    answerModel: message.answerModel,
    diagnostic: message.diagnostic,
    supportCaseSummary: summarizeSupportCase(message.supportCase || (message.supportRequest ? {
      caseId: "support-history",
      sanitizedQuestion: "",
      summary: summarizeSupportRequest(message.text, detectSupportIssues(message.text)),
      issues: detectSupportIssues(message.text),
      primaryIssue: detectSupportIssues(message.text)[0] || null,
      status: "OPEN",
      createdAt: "",
      updatedAt: "",
    } : null)) || undefined,
    searchDiagnosis: message.searchDiagnosis,
    manualReference: message.manualReference,
    articleLookupSummary: createArticleLookupHistorySummary(message.articleLookupCase || null),
    lookupResultStatus: message.lookupResultStatus,
    replyDraft: message.replyDraft,
    lookupStrategies: message.lookupStrategies,
    capabilities: message.capabilities,
    suggestedTerms: message.suggestedTerms,
  };
}

function fromPersistedMessage(message: PersistedChatMessage): Message {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    matchedId: message.matchedId,
    relatedIds: message.relatedIds,
    isFallback: message.isFallback,
    question: message.question,
    apiRedirect: message.apiRedirect,
    searchQuery: message.searchQuery ? { ...message.searchQuery, input: message.searchInput } : undefined,
    intent: message.intent,
    capabilityId: message.capabilityId,
    actions: message.actions,
    answerModel: message.answerModel,
    diagnostic: message.diagnostic,
    supportCase: message.supportCaseSummary ? {
      caseId: "support-restored",
      sanitizedQuestion: message.supportCaseSummary.summary,
      summary: message.supportCaseSummary.summary,
      issues: message.supportCaseSummary.issues,
      primaryIssue: message.supportCaseSummary.primaryIssue,
      status: message.supportCaseSummary.status,
      createdAt: "",
      updatedAt: "",
    } : undefined,
    searchDiagnosis: message.searchDiagnosis,
    manualReference: message.manualReference,
    lookupResultStatus: message.lookupResultStatus,
    replyDraft: message.replyDraft,
    lookupStrategies: message.lookupStrategies,
    capabilities: message.capabilities,
    suggestedTerms: message.suggestedTerms,
  };
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [query, setQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [embedded, setEmbedded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedKnowledgeType, setSelectedKnowledgeType] = useState<KnowledgeType | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<SearchableDocument[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [feedback, setFeedback] = useState<Record<number, "up" | "down">>({});
  const [feedbackReasons, setFeedbackReasons] = useState<Record<number, string>>({});
  const [expandedMessages, setExpandedMessages] = useState<Record<number, boolean>>({});
  const [pageContext, setPageContext] = useState<PageContext>(() => createPageContext("/"));
  const [showQueryBuilder, setShowQueryBuilder] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(true);
  const [showPurposeMenu, setShowPurposeMenu] = useState(true);
  const [activeMode, setActiveMode] = useState<StartMode>(null);
  const [recommendedQuestions, setRecommendedQuestions] = useState<string[]>(() => generateRecommendedQuestions("HOME", faqItems));
  const [queryBuilder, setQueryBuilder] = useState<SearchQueryInput>({ any: [], all: [], exact: [], exclude: [] });
  const [queryBuilderText, setQueryBuilderText] = useState<Record<string, string>>({ any: "", all: "", exact: "", exclude: "" });
  const nextId = useRef(2);
  const endRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<ChatSession>(createChatSession());
  const sessionIdRef = useRef(sessionRef.current.id);
  const messagesRef = useRef<Message[]>([welcomeMessage]);
  const hydratedRef = useRef(false);
  const workingStateRef = useRef<SearchWorkingState>({
    lastIntent: null,
    lastSearchInput: null,
    lastGeneratedQuery: null,
    lastCapabilityId: null,
    activeMode: null,
    lastSearchMode: null,
    searchRevision: 0,
    searchStartedAt: null,
    searchContext: emptySearchContext(),
    articleLookupContext: emptyArticleLookupContext(),
  });
  const aiStateRef = workingStateRef;

  useEffect(() => {
    const isEmbed = new URLSearchParams(window.location.search).get("embed") === "1";
    const restored = loadActiveChatSession();
    if (restored && !shouldStartNewSession(restored)) {
      sessionRef.current = restored;
      sessionIdRef.current = restored.id;
      const restoredMessages = restored.messages.length ? restored.messages.map(fromPersistedMessage) : [{ ...welcomeMessage, id: 1 }];
      messagesRef.current = restoredMessages;
      const state = restored.workingState;
      const restoredContext = state.searchContext;
      const restoredInput = restoredContext?.input || state.lastSearchInput || null;
      const restoredQuery = restoredContext?.query || restoredContext?.generatedQuery || state.lastGeneratedQuery || null;
      const restoredRevision = restoredContext?.revision ?? state.searchRevision ?? 0;
      const restoredUpdatedAt = restoredContext?.updatedAt || state.searchStartedAt || null;
      aiStateRef.current = {
        lastIntent: (state.lastIntent as AiIntent | null) || null,
        lastSearchInput: restoredInput,
        lastGeneratedQuery: restoredQuery,
        lastCapabilityId: state.lastCapabilityId || null,
        activeMode: (state.activeMode as StartMode) || null,
        lastSearchMode: state.lastSearchMode || null,
        searchRevision: restoredRevision,
        searchStartedAt: restoredUpdatedAt,
        searchContext: {
          status: getSearchContextStatus(restoredContext as SearchContext),
          input: restoredInput,
          query: restoredQuery,
          source: restoredContext?.source || null,
          revision: restoredRevision,
          updatedAt: restoredUpdatedAt,
        },
        articleLookupContext: state.articleLookupContext || emptyArticleLookupContext(),
      };
      startTransition(() => {
        setMessages(restoredMessages);
        setActiveMode((state.activeMode as StartMode) || null);
        setShowPurposeMenu(!restoredMessages.some((message) => message.role === "user"));
      });
      const numericIds = restoredMessages.map((message) => typeof message.id === "number" ? message.id : 0);
      nextId.current = Math.max(1, ...numericIds) + 1;
    } else {
      if (restored) archiveChatSession(restored);
      sessionRef.current = createChatSession();
      sessionIdRef.current = sessionRef.current.id;
      saveActiveChatSession(sessionRef.current);
    }
    hydratedRef.current = true;
    startTransition(() => {
      setEmbedded(isEmbed);
      setChatOpen(isEmbed);
      setShowRecommendations(true);
      setPageContext(createPageContext(window.location.pathname));
    });

    const onContext = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || event.data.type !== "bigkinds-chatbot-context") return;
      const incoming = event.data.context as Partial<PageContext>;
      if (!incoming || typeof incoming.pathname !== "string") return;
      setPageContext({
        pathname: incoming.pathname,
        pageType: incoming.pageType || classifyPagePath(incoming.pathname),
        loggedIn: incoming.loggedIn ?? null,
      });
      setRecommendedQuestions((current) => generateRecommendedQuestions(incoming.pageType || classifyPagePath(incoming.pathname), knowledge, current));
      setShowRecommendations(true);
    };
    window.addEventListener("message", onContext);
    const onPageHide = () => {
      persistCurrentSessionNow();
    };
    window.addEventListener("pagehide", onPageHide);

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
      window.removeEventListener("pagehide", onPageHide);
    };
  // knowledge is populated by the same one-time loader; including it would re-register the message listener.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isTyping]);

  function persistCurrentSessionNow(currentMessages = messagesRef.current) {
    if (!hydratedRef.current) return;
    const firstUser = currentMessages.find((message) => message.role === "user");
    sessionRef.current.id = sessionIdRef.current;
    sessionRef.current.messages = currentMessages.map(toPersistedMessage);
    sessionRef.current.title = firstUser?.text ? (firstUser.articleLookupRequest ? sanitizeLookupRequestForHistory(firstUser.text) : firstUser.supportRequest ? summarizeSupportRequest(firstUser.text, detectSupportIssues(firstUser.text)) : firstUser.text).slice(0, 80) : sessionRef.current.title;
    sessionRef.current.updatedAt = new Date().toISOString();
    delete sessionRef.current.closedAt;
    sessionRef.current.workingState = {
      lastIntent: aiStateRef.current.lastIntent,
      lastSearchInput: aiStateRef.current.lastSearchInput,
      lastGeneratedQuery: aiStateRef.current.lastGeneratedQuery,
      lastCapabilityId: aiStateRef.current.lastCapabilityId,
      activeMode: aiStateRef.current.activeMode,
      lastSearchMode: aiStateRef.current.lastSearchMode,
      searchRevision: aiStateRef.current.searchRevision,
      searchStartedAt: aiStateRef.current.searchStartedAt,
      searchContext: aiStateRef.current.searchContext,
      articleLookupContext: aiStateRef.current.articleLookupContext,
    };
    saveActiveChatSession(sessionRef.current);
    if (currentMessages.some((message) => message.role === "user")) archiveChatSession(sessionRef.current);
  }

  function updateWorkingState(partial: Partial<SearchWorkingState>) {
    aiStateRef.current = { ...aiStateRef.current, ...partial };
    persistCurrentSessionNow();
  }

  useEffect(() => {
    messagesRef.current = messages;
    persistCurrentSessionNow(messages);
  // Persist only when the message list changes; refs hold the working state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

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

  async function requestAi(question: string, task: AiTask = "ROUTE", stateOverride?: Partial<SearchWorkingState>) : Promise<AiRouterResponse> {
    if (aiStateRef.current.activeMode === "ARTICLE_LOOKUP" || aiStateRef.current.articleLookupContext.currentCase) {
      return { available: false, reason: "SENSITIVE" };
    }
    const state = stateOverride || (task === "INTERPRET_SEARCH_GOAL" || task === "CLASSIFY_SEARCH_TURN"
      ? { activeMode: aiStateRef.current.activeMode }
      : aiStateRef.current);
    const requestState = Object.fromEntries(Object.entries(state).filter(([key]) => key !== "articleLookupContext"));
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          task,
          pageType: pageContext.pageType,
          state: { ...requestState, pageType: pageContext.pageType },
        }),
      });
      return await response.json() as AiRouterResponse;
    } catch {
      return { available: false, reason: "UPSTREAM" };
    }
  }

  async function resolveSearchTurn(question: string): Promise<SearchTurnResult> {
    const previous = aiStateRef.current.lastSearchInput;
    const deterministic = classifySearchTurn(question, Boolean(previous));
    if (deterministic.mode !== "CLARIFY") return deterministic;

    const result = await requestAi(question, "CLASSIFY_SEARCH_TURN", {
      activeMode: aiStateRef.current.activeMode,
      lastSearchInput: previous,
      lastSearchMode: aiStateRef.current.lastSearchMode,
    });
    const interpretation = result.interpretation;
    if (!result.available || !interpretation?.searchMode) return deterministic;
    if (interpretation.searchMode === "NEW") {
      return interpretation.searchInput
        ? { mode: "NEW", searchInput: normalizeSearchInput(interpretation.searchInput) }
        : deterministic;
    }
    if (interpretation.searchMode === "UPDATE") {
      const patch = interpretation.patch || (interpretation.searchInput ? { add: interpretation.searchInput } : undefined);
      return patch ? { mode: "UPDATE", patch } : deterministic;
    }
    return {
      mode: interpretation.searchMode,
      needsClarification: interpretation.needsClarification,
      clarifyingQuestion: interpretation.clarifyingQuestion,
    };
  }

  function renderSearchCoachMessage(input: AiSearchInput, cleanQuestion: string, text: string | undefined = undefined, suggestedTerms: AiSuggestedTerms[] = [], mode: "NEW" | "UPDATE" = "NEW") {
    const normalizedInput = validateSearchInput(normalizeSearchInput(input));
    const value = buildSearchQuery(normalizedInput);
    if (!value) return false;
    const description = describeSearchQuery(normalizedInput);
    const searchContext = createSearchContext(normalizedInput, mode === "UPDATE" ? "UPDATE" : "NEW", { previous: aiStateRef.current.searchContext });
    updateWorkingState({
      lastIntent: "SEARCH_COACH",
      lastSearchInput: normalizedInput as AiSearchInput,
      lastGeneratedQuery: value,
      lastSearchMode: mode,
      searchRevision: searchContext.revision,
      searchStartedAt: mode === "NEW" ? searchContext.updatedAt : aiStateRef.current.searchStartedAt || searchContext.updatedAt,
      searchContext,
    });
    const assistantId = nextId.current++;
    setMessages((current) => [...current, {
      id: assistantId,
      role: "assistant",
      text: text || (mode === "UPDATE" ? "기존 검색조건에 요청하신 조건을 반영했습니다." : "새로운 검색 주제로 이해했습니다. 찾고 싶은 뉴스 주제를 기준으로 검색조건을 정리했습니다."),
      searchQuery: { value, description, input: normalizedInput as AiSearchInput },
      question: cleanQuestion,
      intent: mode === "UPDATE" ? "SEARCH_UPDATE" : "SEARCH_NEW",
      suggestedTerms,
      actions: [
        { id: `copy-query-${assistantId}`, label: "검색식 복사", type: "COPY_QUERY", value },
        { id: `edit-query-${assistantId}`, label: "조건 수정", type: "SET_MODE", value: "SEARCH_BUILD" },
        { id: `new-search-${assistantId}`, label: "새 검색", type: "RESET_SEARCH" },
      ],
    }]);
    recordInsight({ eventType: "SEARCH_COACH_USED", pageType: pageContext.pageType });
    return true;
  }

  function showCapabilityRecommendation(matches: Capability[], cleanQuestion: string) {
    if (!matches.length) return false;
    const capability = matches[0];
    const guideQuestions: Record<string, string> = {
      NEWS_SEARCH: "뉴스 검색은 어떻게 이용하나요?",
      SEARCH_EXPRESSION: "검색어는 어떤 방식으로 조합하나요?",
      SEARCH_REFINEMENT: "검색결과가 너무 많을 때 어떻게 줄이나요?",
      DOWNLOAD: "검색결과를 엑셀로 받을 수 있어?",
      MORPHEME_ANALYSIS: "형태소 분석은 어디서 해?",
      VISUALIZATION: "뉴스 분석과 시각화는 어떻게 이용하나요?",
      NETWORK_ANALYSIS: "관계도 분석은 어떻게 써?",
      RELATED_WORDS: "연관어 분석은 어떻게 이용하나요?",
      KEYWORD_TREND: "키워드 트렌드는 어떻게 사용하나요?",
      INFORMATION_EXTRACTION: "정보추출은 어떻게 사용하나요?",
      MORPHEME_NER: "형태소·개체명 분석은 어떻게 사용하나요?",
      DATA_VISUALIZATION: "분석 결과를 시각화하려면 어떻게 하나요?",
      VISUALIZATION_REPORT: "시각화보고서는 어떻게 만들어요?",
      QUOTATION_SEARCH: "정확한 인용문은 어떻게 검색하나요?",
      SAVED_SEARCH: "검색식 저장은 어떻게 하나요?",
      LATEST_NEWS: "최신뉴스는 어떻게 보나요?",
      WEEKLY_ISSUE: "주간이슈는 어떻게 보나요?",
      REGIONAL_ISSUE: "지역이슈분석은 어떻게 이용하나요?",
      ISSUE_REPORT: "이슈 리포트는 어떻게 이용하나요?",
      LEGISLATOR_NEWS: "국회의원 뉴스 분석은 어떻게 하나요?",
      MY_NEWS: "나의 뉴스는 어떻게 관리하나요?",
      SCRAP: "스크랩한 뉴스는 어디서 보나요?",
      MY_ANALYSIS: "나의 분석 자료는 어디서 보나요?",
      OLD_NEWSPAPER: "고신문은 어떻게 이용하나요?",
    };
    updateWorkingState({ lastIntent: "FEATURE_RECOMMENDATION", lastCapabilityId: matches[0]?.id || null });
    setMessages((current) => [...current, {
      id: nextId.current++, role: "assistant", text: `추천 기능: ${matches[0].label}`,
      capabilities: matches, capabilityId: matches[0]?.id, intent: "FEATURE_RECOMMENDATION", question: cleanQuestion,
      actions: capability ? [{ id: `capability-${capability.id}`, label: `${capability.label} 사용법 보기`, type: "SHOW_GUIDE", value: guideQuestions[capability.id] || `${capability.label} 사용법을 알려줘` }] : [],
    }]);
    matches.forEach((capability) => recordInsight({ eventType: "FEATURE_RECOMMENDED", pageType: pageContext.pageType, capabilityId: capability.id }));
    return true;
  }

  function showCapabilityComparison(cleanQuestion: string) {
    const matches = getCapabilitiesById(["NETWORK_ANALYSIS", "RELATED_WORDS", "KEYWORD_TREND", "INFORMATION_EXTRACTION"])
      .filter((capability) => capabilitySourcesExist(capability, knowledge));
    if (matches.length < 2) return false;
    updateWorkingState({ lastIntent: "FEATURE_RECOMMENDATION", lastCapabilityId: null });
    setMessages((current) => [...current, {
      id: nextId.current++, role: "assistant", text: "기능 비교: 목적에 따라 이렇게 구분할 수 있습니다.",
      capabilityComparison: matches, intent: "FEATURE_RECOMMENDATION", question: cleanQuestion,
    }]);
    matches.forEach((capability) => recordInsight({ eventType: "FEATURE_RECOMMENDED", pageType: pageContext.pageType, capabilityId: capability.id }));
    return true;
  }

  function recommendFeatureForQuestion(cleanQuestion: string, capabilityIds?: string[]) {
    if (/관계도.*연관어|연관어.*관계도|관계도.*차이|연관어.*차이/i.test(cleanQuestion) && showCapabilityComparison(cleanQuestion)) return true;
    const matches = (capabilityIds?.length ? getCapabilitiesById(capabilityIds) : recommendCapabilities(cleanQuestion))
      .filter((capability) => capabilitySourcesExist(capability, knowledge));
    return showCapabilityRecommendation(matches, cleanQuestion);
  }

  async function answerWithAi(cleanQuestion: string, task: AiTask = "ROUTE") {
    const result = await requestAi(cleanQuestion, task);
    if (!result.available || !result.interpretation) {
      if (result.reason !== "OPEN_API" && result.reason !== "SENSITIVE") {
        recordInsight({ eventType: "GEMINI_UNAVAILABLE", pageType: pageContext.pageType });
      }
      return false;
    }

    const interpretation: AiInterpretation = result.interpretation;
    if (interpretation.intent === "SEARCH_COACH") {
      if (task === "UPDATE_SEARCH") {
        const previous = aiStateRef.current.lastSearchInput;
        const patch = interpretation.patch || (interpretation.searchInput ? { add: interpretation.searchInput } : undefined);
        const input = previous && patch ? applySearchTurn(previous, { mode: "UPDATE", patch }) : null;
        if (input && renderSearchCoachMessage(input, cleanQuestion, undefined, interpretation.suggestedTerms || [], "UPDATE")) return true;
      } else if (interpretation.searchInput) {
        const input = normalizeSearchInput(interpretation.searchInput);
        if (renderSearchCoachMessage(input, cleanQuestion, undefined, interpretation.suggestedTerms || [], "NEW")) return true;
      }
    }

    if (interpretation.intent === "FEATURE_RECOMMENDATION") {
      return recommendFeatureForQuestion(cleanQuestion, interpretation.capabilityIds);
    }

    if (interpretation.intent === "SEARCH_DIAGNOSIS" || interpretation.intent === "TROUBLESHOOT") {
      const kind = interpretation.diagnosticKind;
      if (kind === "SEARCH_NO_RESULT" || kind === "DOWNLOAD_PROBLEM" || kind === "API_ERROR") {
        const flow = getDiagnosticFlow(kind);
        setMessages((current) => [...current, { id: nextId.current++, role: "assistant", text: flow.title, diagnostic: flow, question: cleanQuestion }]);
        recordInsight({ eventType: interpretation.intent === "SEARCH_DIAGNOSIS" ? "SEARCH_DIAGNOSIS_USED" : "TROUBLESHOOT_USED", pageType: pageContext.pageType });
        return true;
      }
    }

    if (interpretation.needsClarification && interpretation.clarifyingQuestion) {
      setMessages((current) => [...current, { id: nextId.current++, role: "assistant", text: interpretation.clarifyingQuestion || "원하는 목적을 조금 더 알려주세요.", isFallback: true, question: cleanQuestion }]);
      return true;
    }

    if (interpretation.intent === "OUT_OF_SCOPE") {
      setMessages((current) => [...current, { id: nextId.current++, role: "assistant", text: "해당 질문은 빅카인즈 이용 방법과 관련된 질문이 아닙니다. 이 서비스는 빅카인즈 검색·분석·다운로드·수록 데이터 등 서비스 이용을 안내합니다.", isFallback: true, question: cleanQuestion, intent: "OUT_OF_SCOPE", actions: [
        { id: "out-news", label: "뉴스 찾기", type: "SET_MODE", value: "NEWS_FIND" },
        { id: "out-search", label: "검색식 만들기", type: "SET_MODE", value: "SEARCH_BUILD" },
        { id: "out-feature", label: "기능 추천", type: "SET_MODE", value: "FEATURE_RECOMMENDATION" },
      ] }]);
      recordInsight({ eventType: "OUT_OF_SCOPE", pageType: pageContext.pageType });
      return true;
    }
    return false;
  }

  async function answerSearchGoal(cleanQuestion: string) {
    if (await answerWithAi(cleanQuestion, "INTERPRET_SEARCH_GOAL")) return true;
    const simpleInput = extractSimpleSearchGoal(cleanQuestion);
    if (!simpleInput) return false;
    if (!simpleInput.all.length && !simpleInput.any.length && !simpleInput.exact.length && !simpleInput.exclude.length) return false;
    return renderSearchCoachMessage(normalizeSearchInput(simpleInput), cleanQuestion, undefined, [], "NEW");
  }

  function showArticleLookupCase(question: string, isUpdate = false) {
    const currentCase = aiStateRef.current.articleLookupContext.currentCase;
    const articleLookupCase = isUpdate && currentCase
      ? updateArticleLookupCase(currentCase, question)
      : extractArticleLookupCase(question);
    updateWorkingState({
      activeMode: "ARTICLE_LOOKUP",
      lastIntent: "HISTORICAL_ARTICLE_LOOKUP",
      articleLookupContext: {
        currentCase: articleLookupCase,
        selectedStrategyId: isUpdate ? aiStateRef.current.articleLookupContext.selectedStrategyId : null,
        lastResultStatus: isUpdate ? aiStateRef.current.articleLookupContext.lastResultStatus : null,
      },
    });
    setMessages((current) => [...current, {
      id: nextId.current++, role: "assistant",
      text: isUpdate ? "수정한 단서를 반영했습니다. 찾으시는 자료의 조건을 다시 확인해 주세요." : "찾으시는 자료의 조건을 이렇게 이해했습니다.",
      articleLookupCase,
      intent: "HISTORICAL_ARTICLE_LOOKUP",
      actions: [
        { id: "confirm-lookup-case", label: "이 조건으로 찾기", type: "CONFIRM_LOOKUP_CASE" },
        { id: "edit-lookup-case", label: "조건 수정", type: "EDIT_LOOKUP_CASE" },
        { id: "reset-lookup-case", label: "처음부터 다시", type: "RESET_ARTICLE_LOOKUP" },
      ],
    }]);
    if (!isUpdate) recordInsight({ eventType: "ARTICLE_LOOKUP_STARTED", pageType: pageContext.pageType });
  }

  function showLookupStrategies() {
    const articleLookupCase = aiStateRef.current.articleLookupContext.currentCase;
    if (!articleLookupCase) return;
    const lookupStrategies = buildLookupStrategies(articleLookupCase);
    setMessages((current) => [...current, {
      id: nextId.current++, role: "assistant",
      text: lookupStrategies.length ? "다음 순서로 찾아보는 것을 권장합니다." : "현재 단서만으로는 검색식을 만들기 어렵습니다. 기간·언론사·인물·소속 중 아는 정보를 더 입력해 주세요.",
      articleLookupCase,
      lookupStrategies,
      intent: "HISTORICAL_ARTICLE_LOOKUP",
      actions: lookupStrategies.length ? [{ id: "edit-lookup-after-strategy", label: "조건 수정", type: "EDIT_LOOKUP_CASE" }] : [{ id: "edit-lookup-missing", label: "단서 추가", type: "EDIT_LOOKUP_CASE" }],
    }]);
  }

  function applyLookupStrategy(strategyId: string) {
    const articleLookupCase = aiStateRef.current.articleLookupContext.currentCase;
    if (!articleLookupCase) return;
    const strategy = buildLookupStrategies(articleLookupCase).find((item) => item.id === strategyId);
    if (!strategy) return;
    updateWorkingState({ articleLookupContext: { ...aiStateRef.current.articleLookupContext, selectedStrategyId: strategyId } });
    recordInsight({ eventType: "ARTICLE_LOOKUP_STRATEGY_USED", pageType: pageContext.pageType });
    setMessages((current) => [...current, {
      id: nextId.current++, role: "assistant",
      text: `선택한 검색식: ${strategy.query}\nBIGKinds에서 검색한 뒤 결과 상태를 선택해 주세요.`,
      articleLookupCase,
      lookupStrategies: [strategy],
      intent: "HISTORICAL_ARTICLE_LOOKUP",
      actions: [
        { id: "lookup-found", label: "관련 자료를 찾았어요", type: "SET_LOOKUP_RESULT", value: "FOUND" },
        { id: "lookup-not-found", label: "찾지 못했어요", type: "SET_LOOKUP_RESULT", value: "NOT_FOUND" },
        { id: "lookup-candidate", label: "비슷한 자료만 있어요", type: "SET_LOOKUP_RESULT", value: "CANDIDATE" },
      ],
    }]);
  }

  function setLookupResultStatus(result: ArticleLookupResultStatus) {
    const articleLookupCase = aiStateRef.current.articleLookupContext.currentCase;
    if (!articleLookupCase) return;
    updateWorkingState({ articleLookupContext: { ...aiStateRef.current.articleLookupContext, lastResultStatus: result } });
    const eventType = result === "FOUND" ? "ARTICLE_LOOKUP_FOUND" : result === "NOT_FOUND" ? "ARTICLE_LOOKUP_NO_RESULT" : "ARTICLE_LOOKUP_CANDIDATE";
    recordInsight({ eventType, pageType: pageContext.pageType });
    const notFound = result === "NOT_FOUND";
    setMessages((current) => [...current, {
      id: nextId.current++, role: "assistant",
      text: result === "FOUND"
        ? "관련 자료를 찾으셨군요. 기사 제목·날짜·URL을 확인해 두면 후속 회신에 반영할 수 있습니다."
        : result === "CANDIDATE"
          ? "비슷한 자료는 확인됐지만 정확히 동일한 자료인지 추가 확인이 필요합니다."
          : "현재 입력한 조건의 BIGKinds 검색에서는 요청 자료를 확인하지 못했습니다.",
      articleLookupCase,
      lookupResultStatus: result,
      intent: "HISTORICAL_ARTICLE_LOOKUP",
      actions: notFound ? [
        { id: "lookup-expand-period", label: "기간 넓혀보기", type: "USE_LOOKUP_STRATEGY", value: "lookup-expand-period" },
        { id: "lookup-edit-terms", label: "다른 검색어 시도", type: "EDIT_LOOKUP_CASE" },
        { id: "lookup-page-guidance", label: "원지면 확인 방법", type: "SHOW_LOOKUP_GUIDANCE" },
        { id: "lookup-reply", label: "문의 회신 초안", type: "GENERATE_LOOKUP_REPLY" },
      ] : [
        { id: "lookup-reply", label: "문의 회신 초안", type: "GENERATE_LOOKUP_REPLY" },
        { id: "lookup-edit", label: "조건 수정", type: "EDIT_LOOKUP_CASE" },
      ],
    }]);
  }

  function showLookupReplyDraft() {
    const articleLookupCase = aiStateRef.current.articleLookupContext.currentCase;
    const result = aiStateRef.current.articleLookupContext.lastResultStatus;
    if (!articleLookupCase || !result) return;
    const replyDraft = createLookupReplyDraft(articleLookupCase, result);
    if (!replyDraft) return;
    recordInsight({ eventType: "ARTICLE_LOOKUP_REPLY_DRAFTED", pageType: pageContext.pageType });
    setMessages((current) => [...current, { id: nextId.current++, role: "assistant", text: "문의 회신 초안입니다. 담당자명과 연락처는 자동으로 넣지 않았습니다.", articleLookupCase, lookupResultStatus: result, replyDraft, intent: "HISTORICAL_ARTICLE_LOOKUP" }]);
  }

  function resetArticleLookup() {
    setActiveMode("ARTICLE_LOOKUP");
    updateWorkingState({ activeMode: "ARTICLE_LOOKUP", lastIntent: "HISTORICAL_ARTICLE_LOOKUP", articleLookupContext: emptyArticleLookupContext() });
    setMessages((current) => [...current, { id: nextId.current++, role: "assistant", text: "찾으시는 자료에 대해 알고 있는 내용을 입력해 주세요.\n\n예: 1997년 7월경 매일경제에 실린 아시아나 직원의 노동부장관 표창 명단을 찾고 싶어요.", intent: "ARTICLE_LOOKUP" }]);
  }

  function startMode(mode: PurposeMode) {
    setShowPurposeMenu(false);
    setShowRecommendations(false);
    if (mode === "OPEN_API") {
      updateWorkingState({ activeMode: null, lastIntent: "OPEN_API_REDIRECT" as AiIntent });
      setMessages((current) => [...current, {
        id: nextId.current++, role: "assistant",
        text: "OPEN API 관련 사항은 뉴스토어에서 확인해 주세요.",
        apiRedirect: true,
        intent: "OPEN_API_REDIRECT",
        actions: [{ id: "open-api", label: "뉴스토어 OPEN API 확인", type: "OPEN_URL", url: OPEN_API_PURCHASE_URL }],
      }]);
      recordInsight({ eventType: "OPEN_API_REDIRECT", pageType: pageContext.pageType });
      return;
    }
    const prompts: Record<Exclude<StartMode, null>, { text: string; actions?: PersistedMessageAction[] }> = {
      NEWS_FIND: { text: "찾고 싶은 뉴스 주제를 평소 말하듯 입력해 주세요.\n예: 저출생 관련 뉴스를 찾아보고 싶어요." },
      SEARCH_BUILD: { text: "AND·OR·NOT을 몰라도 괜찮아요. 포함하거나 제외할 주제를 문장으로 입력해 주세요.\n예: 인공지능과 반도체가 들어가고 주가는 빼줘." },
      SEARCH_DIAGNOSIS: { text: "확인하고 싶은 검색식을 입력해 주세요.\n예: AI OR 인공지능 AND 반도체" },
      FEATURE_RECOMMENDATION: { text: "빅카인즈에서 하고 싶은 일을 설명해 주세요.\n예: 기사에서 어떤 기업들이 같이 언급되는지 보고 싶어요." },
      ARTICLE_LOOKUP: { text: "찾으시는 자료에 대해 알고 있는 내용을 입력해 주세요.\n\n예: 1997년 7월경 매일경제에 실린 아시아나 직원의 노동부장관 표창 명단을 찾고 싶어요." },
      TROUBLESHOOT: { text: "검색·다운로드 중 어떤 문제가 있었는지 평소 말하듯 입력해 주세요." },
      USAGE_GUIDE: {
        text: "어떤 이용 안내가 필요하신가요?",
        actions: [
          { id: "guide-coverage", label: "뉴스 수록 범위", type: "SHOW_GUIDE", value: "빅카인즈에는 어떤 규모의 뉴스가 수록되어 있나요?" },
          { id: "guide-search", label: "검색 사용법", type: "SHOW_GUIDE", value: "검색어는 어떤 방식으로 조합하나요?" },
          { id: "guide-download", label: "다운로드", type: "SHOW_GUIDE", value: "검색 결과를 다운로드하고 싶어요" },
          { id: "guide-analysis", label: "분석 기능", type: "SHOW_GUIDE", value: "뉴스 분석과 시각화는 어떻게 이용하나요?" },
          { id: "guide-old", label: "고신문", type: "SHOW_GUIDE", value: "고신문은 어떻게 이용하나요?" },
          { id: "guide-membership", label: "회원·이용 문제", type: "SHOW_GUIDE", value: "회원가입 인증메일이 오지 않아요" },
        ],
      },
    };
    const prompt = prompts[mode];
    setActiveMode(mode);
    updateWorkingState({ activeMode: mode, lastIntent: mode as AiIntent });
    setMessages((current) => [...current, { id: nextId.current++, role: "assistant", text: prompt.text, intent: mode, actions: prompt.actions }]);
  }

  function handleMessageAction(action: PersistedMessageAction) {
    if (action.type === "SET_MODE" && action.value) startMode(action.value as PurposeMode);
    else if (action.type === "CONFIRM_LOOKUP_CASE") showLookupStrategies();
    else if (action.type === "EDIT_LOOKUP_CASE") setMessages((current) => [...current, { id: nextId.current++, role: "assistant", text: "수정할 조건을 입력해 주세요.\n예: 기간을 1997년 6~8월로 바꿔줘, 언론사는 매일경제만, 아시아나항공도 검색어에 넣어줘.", intent: "ARTICLE_LOOKUP" }]);
    else if (action.type === "RESET_ARTICLE_LOOKUP") resetArticleLookup();
    else if (action.type === "USE_LOOKUP_STRATEGY" && action.value) applyLookupStrategy(action.value);
    else if (action.type === "SET_LOOKUP_RESULT" && (action.value === "FOUND" || action.value === "NOT_FOUND" || action.value === "CANDIDATE")) setLookupResultStatus(action.value);
    else if (action.type === "GENERATE_LOOKUP_REPLY") showLookupReplyDraft();
    else if (action.type === "SHOW_LOOKUP_GUIDANCE") {
      recordInsight({ eventType: "ARTICLE_LOOKUP_ESCALATED", pageType: pageContext.pageType });
      setMessages((current) => [...current, { id: nextId.current++, role: "assistant", text: "일반 기사 형태가 아니라 지면의 별도 명단·박스 자료일 가능성이 있습니다. BIGKinds는 협약 언론사로부터 제공받은 기사 데이터를 기반으로 하므로, 정확한 원지면 확인이 필요하면 해당 언론사에 해당 일자·지면의 열람 가능 여부를 문의할 수 있습니다.", intent: "HISTORICAL_ARTICLE_LOOKUP" }]);
    }
    else if (action.type === "COPY_QUERY" && action.value) void copyText(action.value);
    else if (action.type === "COPY_SUPPORT_REQUEST" && action.value) void copyText(action.value);
    else if (action.type === "SUPPORT_ESCALATE" && action.url) {
      recordInsight({ eventType: "SUPPORT_ESCALATED", pageType: pageContext.pageType });
      emitHostAction({ type: "OPEN_URL", label: action.label, url: action.url });
    }
    else if (action.type === "OPEN_URL" && action.url) emitHostAction({ type: "OPEN_URL", label: action.label, url: action.url });
    else if (action.type === "SHOW_GUIDE" && action.value) ask(action.value);
    else if (action.type === "OPEN_QNA") emitHostAction({ type: "OPEN_QNA", label: action.label, url: QNA_SOURCE_URL });
    else if (action.type === "RESET_SEARCH") resetSearchContext();
    else if (action.type === "APPLY_SEARCH_DIAGNOSIS" && action.value) {
      const input = parseSearchExpression(action.value);
      if (input.all?.length || input.any?.length || input.exact?.length || input.exclude?.length) {
        renderSearchCoachMessage(input, "수정 검색식 사용", "수정한 검색식을 검색조건에 적용했습니다.", [], "NEW");
      }
    }
    else if (action.type === "USE_ALL_SUGGESTIONS" && action.value) {
      try {
        const suggestion = JSON.parse(action.value) as { baseTerm: string; alternatives: string[] };
        const current = aiStateRef.current.lastSearchInput;
        if (current) {
          const all = current.all.filter((term) => term !== suggestion.baseTerm);
          const input = { ...current, all, any: [...new Set([...(current.any || []), suggestion.baseTerm, ...suggestion.alternatives])] };
          renderSearchCoachMessage(input, "관련 표현도 함께 검색", "관련 표현을 포함하도록 검색조건을 넓혔습니다.", [], "UPDATE");
        }
      } catch { /* ignore malformed client action data */ }
    }
  }

  function resetSearchContext() {
    setActiveMode("NEWS_FIND");
    updateWorkingState({
      activeMode: "NEWS_FIND",
      lastIntent: "SEARCH_COACH",
      lastSearchInput: null,
      lastGeneratedQuery: null,
      lastSearchMode: null,
      searchStartedAt: null,
      searchContext: emptySearchContext(),
    });
    setMessages((current) => [...current, {
      id: nextId.current++,
      role: "assistant",
      text: "새로 찾고 싶은 뉴스 주제를 입력해 주세요.",
      intent: "SEARCH_NEW",
    }]);
  }

  function showSearchDiagnosis(diagnosis: SearchDiagnosis, question: string) {
    const input = parseSearchExpression(diagnosis.suggestion);
    const proposed = createSearchContext(input, "DIAGNOSIS", { status: "PROPOSED", previous: aiStateRef.current.searchContext });
    setMessages((current) => [...current, {
      id: nextId.current++, role: "assistant",
      text: diagnosis.message,
      searchDiagnosis: diagnosis,
      manualReference: { label: "빅카인즈 사용자매뉴얼 v4.2", section: "4.1" },
      question,
      intent: "SEARCH_DIAGNOSIS",
      actions: [
        { id: "copy-diagnosis-query", label: "수정 검색식 복사", type: "COPY_QUERY", value: diagnosis.suggestion },
        { id: "apply-diagnosis-query", label: "수정 검색식 사용", type: "APPLY_SEARCH_DIAGNOSIS", value: diagnosis.suggestion },
      ],
    }]);
    updateWorkingState({
      lastIntent: "SEARCH_EXPRESSION_DIAGNOSIS",
      lastSearchInput: proposed.input as AiSearchInput,
      lastGeneratedQuery: proposed.query,
      searchRevision: proposed.revision,
      searchContext: proposed,
    });
    recordInsight({ eventType: "SEARCH_DIAGNOSIS_USED", pageType: pageContext.pageType });
  }

  function showSearchResultDiagnosis(question: string, previousSearch: AiSearchInput | null) {
    const currentQuery = previousSearch ? buildSearchQuery(previousSearch) : "";
    const text = currentQuery
      ? `현재 검색조건을 더 좁힐 수 있습니다.\n현재 검색식: ${currentQuery}`
      : "현재 검색식이나 찾으려는 주제를 알려주시면 결과를 좁히는 조건을 함께 정리해 드릴게요.";
    setMessages((current) => [...current, {
      id: nextId.current++, role: "assistant", text,
      intent: "SEARCH_DIAGNOSIS", question,
      actions: [
        { id: "add-required", label: "반드시 포함할 단어 추가", type: "SET_MODE", value: "SEARCH_BUILD" },
        { id: "add-exact", label: "정확한 문구 지정", type: "SET_MODE", value: "SEARCH_BUILD" },
        { id: "add-exclude", label: "제외할 단어 추가", type: "SET_MODE", value: "SEARCH_BUILD" },
        { id: "check-period", label: "검색기간 확인", type: "SHOW_GUIDE", value: "검색기간은 어떻게 설정하나요?" },
        { id: "check-media", label: "언론사 지정", type: "SHOW_GUIDE", value: "언론사는 어디에서 선택하나요?" },
        { id: "check-category", label: "통합분류 선택", type: "SHOW_GUIDE", value: "통합분류는 어떻게 선택하나요?" },
        { id: "check-within-results", label: "결과 내 재검색", type: "SHOW_GUIDE", value: "검색결과 안에서 다시 검색할 수 있나요?" },
      ],
    }]);
    updateWorkingState({ lastIntent: "SEARCH_DIAGNOSIS", lastSearchMode: "DIAGNOSIS" });
    recordInsight({ eventType: "SEARCH_DIAGNOSIS_USED", pageType: pageContext.pageType });
  }

  function showOfficialDocument(document: SearchableDocument, question: string, intent: UserIntent) {
    const answerModel = buildAnswerViewModel(document);
    const actions: PersistedMessageAction[] = [];
    if (intent === "SERVICE_OVERVIEW") {
      actions.push(
        { id: "overview-news", label: "뉴스 찾기", type: "SET_MODE", value: "NEWS_FIND" },
        { id: "overview-search", label: "검색식 만들기", type: "SET_MODE", value: "SEARCH_BUILD" },
        { id: "overview-feature", label: "기능 추천", type: "SET_MODE", value: "FEATURE_RECOMMENDATION" },
        { id: "overview-guide", label: "이용 방법", type: "SET_MODE", value: "USAGE_GUIDE" },
      );
    } else if (document.source?.url) {
      actions.push({ id: `source-${document.id}`, label: document.sourceType === "USER_MANUAL" ? "매뉴얼 근거 보기" : "공식 원문 보기", type: "OPEN_URL", url: document.source.url });
    }
    const summary = intent === "SERVICE_OVERVIEW"
      ? `${answerModel.summary}\n\n주요 활용:\n${(document.facts || []).map((fact) => `- ${fact}`).join("\n")}\n\n어떤 작업을 하시려는지 알려주시면 맞는 기능을 찾아드릴게요.`
      : answerModel.summary;
    const eventType = intent === "SERVICE_OVERVIEW"
      ? "SERVICE_OVERVIEW_USED"
      : intent === "SERVICE_FACT" ? "SERVICE_FACT_USED" : "SERVICE_GUIDE_USED";
    updateWorkingState({ lastIntent: intent });
    recordInsight({ eventType, pageType: pageContext.pageType, documentId: document.id });
    if (document.sourceType === "USER_MANUAL") {
      recordInsight({ eventType: "MANUAL_GUIDE_USED", pageType: pageContext.pageType, documentId: document.id, capabilityId: document.capabilityIds?.[0] });
    }
    setMessages((current) => [...current, {
      id: nextId.current++,
      role: "assistant",
      text: summary,
      matchedId: document.id,
      answerModel,
      question,
      intent,
      actions,
    }]);
  }

  function recordSupportCaseInsights(issues: SupportIssueKind[]) {
    recordInsight({ eventType: "SUPPORT_CASE_STARTED", pageType: pageContext.pageType });
    if (issues.length > 1) recordInsight({ eventType: "MULTI_ISSUE_SUPPORT", pageType: pageContext.pageType });
    issues.forEach((issue) => {
      const eventType = supportIssueInsightEvents[issue];
      if (eventType) recordInsight({ eventType, pageType: pageContext.pageType });
    });
  }

  function getSupportDocument(issue: SupportIssueKind) {
    return knowledge.find((document) => document.answerMode === "USER_FACING" && document.issueKinds?.includes(issue));
  }

  function supportInquiryText(supportCase: SupportCase, issue: SupportIssueKind) {
    return `문의 유형: ${supportIssueLabel(issue)}\n문의 요약: ${supportCase.summary}`;
  }

  function supportIssueActions(supportCase: SupportCase, issue: SupportIssueKind, flow: DiagnosticFlow | undefined): PersistedMessageAction[] {
    const inquiryText = supportInquiryText(supportCase, issue);
    if (issue === "RIGHTS_LICENSE" || issue === "RIGHTS_RESEARCH") {
      return [
        {
          id: `support-escalate-${issue}`,
          label: issue === "RIGHTS_LICENSE" ? "공식 문의하기" : "이용범위 문의",
          type: "SUPPORT_ESCALATE",
          url: SUPPORT_QNA_URL,
        },
        { id: `support-copy-${issue}`, label: "문의내용 복사", type: "COPY_SUPPORT_REQUEST", value: inquiryText },
      ];
    }
    return [
      { id: `support-guide-${issue}`, label: "문제 해결", type: "SHOW_GUIDE", value: flow?.options[0]?.question || "문제 해결 방법을 알려줘" },
      { id: `support-qna-${issue}`, label: "Q&A 문의", type: "SUPPORT_ESCALATE", url: SUPPORT_QNA_URL },
    ];
  }

  function showPolicyHandoff(question: string, handoff: PolicyHandoff) {
    const supportIssues = detectSupportIssues(question);
    const supportCase = createSupportCase(question, supportIssues);
    const text = `${handoff.label} 관련 문의는 이용 조건·계약·저작권 판단이 필요해 챗봇이 허용 여부, 금액, 계약 기간을 추정하거나 단정하지 않습니다.\n\n${handoff.guidance}`;
    updateWorkingState({ lastIntent: "SUPPORT_TRIAGE" });
    recordInsight({ eventType: "SUPPORT_TRIAGE_USED", pageType: pageContext.pageType });
    if (supportIssues.length) recordSupportCaseInsights(supportIssues);
    setMessages((current) => [...current, {
      id: nextId.current++,
      role: "assistant",
      text,
      intent: "SUPPORT_TRIAGE",
      question,
      supportRequest: true,
      supportCase: supportIssues.length ? supportCase : undefined,
      supportDiagnostics: supportIssues.map((issue) => getDiagnosticFlow(issue)),
      policyHandoff: true,
      actions: [{ id: "policy-official-contact", label: "공식 안내 확인", type: "SUPPORT_ESCALATE", url: handoff.url }],
    }]);
  }

  function ask(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || isTyping) return;
    const supportRequest = detectSupportIssues(cleanQuestion).length > 0;
    const articleLookupRequest = aiStateRef.current.activeMode === "ARTICLE_LOOKUP"
      || Boolean(aiStateRef.current.articleLookupContext.currentCase)
      || isHistoricalArticleLookupQuestion(cleanQuestion);

    const userMessage: Message = {
      id: nextId.current++,
      role: "user",
      text: cleanQuestion,
      articleLookupRequest,
      supportRequest,
      intent: articleLookupRequest ? "HISTORICAL_ARTICLE_LOOKUP" : undefined,
    };

    setMessages((current) => [...current, userMessage]);
    setQuery("");
    setIsTyping(true);
    setShowRecommendations(false);
    setShowPurposeMenu(false);

    const dateQuestion = isDateQuestion(cleanQuestion);
    const diagnosticKind = detectDiagnosticKind(cleanQuestion, pageContext.pageType);
    const sensitive = /주민등록번호|비밀번호|인증키|api\s*key|apikey/i.test(cleanQuestion);
    const generalKnowledgeQuestion = !sensitive && isLikelyGeneralKnowledgeQuestion(cleanQuestion);

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

      if (isOpenApiQuestion(cleanQuestion)) {
        recordInsight({ eventType: "OPEN_API_REDIRECT", pageType: pageContext.pageType });
        setMessages((current) => [...current, {
          id: nextId.current++, role: "assistant",
          text: "OPEN API 관련 문의는 뉴스토어에서 확인해 주세요. OPEN API의 구매, 계약, 이용 방법, 오류 및 데이터 활용 관련 사항은 담당 부서에서 안내하고 있습니다.",
          apiRedirect: true, question: cleanQuestion, intent: "OPEN_API_REDIRECT",
          actions: [{ id: "open-api", label: "뉴스토어 OPEN API 확인", type: "OPEN_URL", url: OPEN_API_PURCHASE_URL }],
        }]);
        setIsTyping(false);
        return;
      }

      const policyHandoff = getPolicyHandoff(cleanQuestion);
      if (policyHandoff) {
        showPolicyHandoff(cleanQuestion, policyHandoff);
        setIsTyping(false);
        return;
      }

      const searchContext = aiStateRef.current.searchContext;
      const previousSearch = getSearchContextStatus(searchContext) === "STALE" ? null : searchContext.input as AiSearchInput | null;
      const routed = routeUserIntent(cleanQuestion, {
        hasSearchContext: Boolean(searchContext.input),
        searchContext,
        lastCapabilityId: aiStateRef.current.lastCapabilityId,
        pageType: pageContext.pageType,
        hasArticleLookupContext: Boolean(aiStateRef.current.articleLookupContext.currentCase),
      });

      if (routed.intent === "ARTICLE_UNSUPPORTED") {
        setMessages((current) => [...current, {
          id: nextId.current++, role: "assistant",
          text: "기사 원문을 직접 읽거나 요약하는 기능은 제공하지 않습니다. 대신 해당 주제의 기사를 더 정확하게 찾을 수 있도록 검색식을 만들어드릴 수 있습니다.",
          isFallback: true, intent: "ARTICLE_UNSUPPORTED",
          actions: [{ id: "article-search-build", label: "검색식 만들어보기", type: "SET_MODE", value: "SEARCH_BUILD" }],
          question: cleanQuestion,
        }]);
        setIsTyping(false);
        return;
      }

      if (routed.intent === "SUPPORT_TRIAGE") {
        const supportCase = createSupportCase(cleanQuestion, routed.supportIssues || []);
        const supportDiagnostics = supportCase.issues.map((issue) => getDiagnosticFlow(issue));
        recordSupportCaseInsights(supportCase.issues);
        setMessages((current) => [...current, {
          id: nextId.current++, role: "assistant",
          text: supportCase.issues.length > 1
            ? `문의 내용을 ${supportCase.issues.length}개 항목으로 나누어 확인해 볼게요: ${supportCase.issues.map(supportIssueLabel).join(", ")}`
            : `${supportIssueLabel(supportCase.primaryIssue || "ACCOUNT_PROBLEM")} 문의로 분류했어요. 아래 항목을 선택해 주세요.`,
          supportCase,
          supportDiagnostics,
          intent: "SUPPORT_TRIAGE",
          question: cleanQuestion,
          supportRequest: true,
        }]);
        updateWorkingState({ lastIntent: "SUPPORT_TRIAGE" });
        setIsTyping(false);
        return;
      }

      if (routed.intent === "META") {
        setMessages((current) => [...current, {
          id: nextId.current++, role: "assistant",
          text: "빅카인즈 검색·분석·다운로드 이용 방법과 공식 안내를 도와드려요. 원하는 목적을 골라보세요.",
          isFallback: true, question: cleanQuestion, intent: "META",
          actions: purposeMenu.filter((item) => item.mode !== "OPEN_API").map((item) => ({ id: `meta-${item.label}`, label: item.label, type: "SET_MODE", value: item.mode })),
        }]);
        setIsTyping(false);
        return;
      }

      if (routed.intent === "SERVICE_OVERVIEW") {
        const overview = knowledge.find((item) => item.id === "bigkinds-intro-overview");
        if (overview) {
          showOfficialDocument(overview, cleanQuestion, "SERVICE_OVERVIEW");
          setIsTyping(false);
          return;
        }
      }

      if (routed.intent === "SERVICE_GUIDE" && routed.capabilityIds?.length) {
        const capability = getCapabilitiesById(routed.capabilityIds)[0];
        const guideDocument = capability
          ? capability.sourceIds.map((id) => knowledge.find((item) => item.id === id)).find(Boolean)
          : undefined;
        if (guideDocument) {
          showOfficialDocument(guideDocument, cleanQuestion, "SERVICE_GUIDE");
          setIsTyping(false);
          return;
        }
      }

      if (routed.intent === "SERVICE_GUIDE") {
        const manualGuide = searchFaq(cleanQuestion, 1, knowledge, { preferredAuthority: "USER_MANUAL_V4_2" })[0]?.item;
        if (manualGuide?.sourceType === "USER_MANUAL") {
          showOfficialDocument(manualGuide, cleanQuestion, "SERVICE_GUIDE");
          setIsTyping(false);
          return;
        }
      }

      if (routed.intent === "SERVICE_FACT") {
        const coverageQuestion = /1990년대|몇\s*년도|이전\s*뉴스|고신문|신문/i.test(cleanQuestion);
        const scaleQuestion = /언론사|수록|몇\s*건|보유|전체\s*기사/i.test(cleanQuestion);
        const factDocument = scaleQuestion
          ? knowledge.find((item) => item.id === "bigkinds-intro-data-scale")
          : coverageQuestion ? knowledge.find((item) => item.id === "bigkinds-canonical-coverage")
          : undefined;
        if (factDocument) {
          showOfficialDocument(factDocument, cleanQuestion, "SERVICE_FACT");
          setIsTyping(false);
          return;
        }
      }

      if (routed.intent === "HISTORICAL_ARTICLE_LOOKUP" || (aiStateRef.current.activeMode === "ARTICLE_LOOKUP" && routed.intent === "CLARIFY")) {
        showArticleLookupCase(cleanQuestion, Boolean(routed.articleLookupUpdate));
        setIsTyping(false);
        return;
      }

      if (routed.intent === "SEARCH_EXPRESSION_DIAGNOSIS") {
        const diagnosis = diagnoseSearchExpression(cleanQuestion);
        if (diagnosis) {
          showSearchDiagnosis(diagnosis, cleanQuestion);
          setIsTyping(false);
          return;
        }
      }

      if (routed.intent === "SEARCH_RESULT_DIAGNOSIS") {
        showSearchResultDiagnosis(cleanQuestion, previousSearch);
        setIsTyping(false);
        return;
      }

      if (routed.intent === "FEATURE_RECOMMENDATION") {
        if (recommendFeatureForQuestion(cleanQuestion, routed.capabilityIds)) {
          setIsTyping(false);
          return;
        }
        if (await answerWithAi(cleanQuestion, "ROUTE")) {
          setIsTyping(false);
          return;
        }
      }

      if (routed.intent === "TROUBLESHOOT") {
        const diagnosticKind = routed.diagnosticKind;
        if (diagnosticKind) {
          setMessages((current) => [...current, {
            id: nextId.current++, role: "assistant", text: getDiagnosticFlow(diagnosticKind).title,
            diagnostic: getDiagnosticFlow(diagnosticKind), intent: "TROUBLESHOOT", question: cleanQuestion,
          }]);
          updateWorkingState({ lastIntent: "TROUBLESHOOT" });
          recordInsight({ eventType: "TROUBLESHOOT_USED", pageType: pageContext.pageType });
          setIsTyping(false);
          return;
        }
      }

      let searchTurn = routed.searchTurn;
      if (routed.intent === "CLARIFY") {
        searchTurn = await resolveSearchTurn(cleanQuestion);
      }

      if (routed.intent === "SEARCH_NEW" || searchTurn?.mode === "NEW") {
        const answeredBySearchCoach = await answerSearchGoal(cleanQuestion);
        if (answeredBySearchCoach || (searchTurn?.searchInput && renderSearchCoachMessage(searchTurn.searchInput, cleanQuestion, undefined, [], "NEW"))) {
          setIsTyping(false);
          return;
        }
      }

      if (routed.intent === "SEARCH_UPDATE" || searchTurn?.mode === "UPDATE") {
        const input = searchTurn ? applySearchTurn(previousSearch, searchTurn) : null;
        if (input && renderSearchCoachMessage(input, cleanQuestion, undefined, [], "UPDATE")) {
          setIsTyping(false);
          return;
        }
      }

      if (routed.intent === "CLARIFY" && searchTurn?.mode === "CLARIFY") {
        setMessages((current) => [...current, {
          id: nextId.current++, role: "assistant",
          text: searchTurn.clarifyingQuestion || "기존 검색식에 조건을 추가할까요, 아니면 새 검색을 시작할까요?",
          isFallback: true, intent: "CLARIFY", question: cleanQuestion,
          actions: [
            { id: "clarify-update", label: "이전 검색 이어가기", type: "SET_MODE", value: "SEARCH_BUILD" },
            { id: "clarify-new", label: "새 검색 시작", type: "RESET_SEARCH" },
          ],
        }]);
        setIsTyping(false);
        return;
      }

      if (routed.intent === "OUT_OF_SCOPE") {
        setMessages((current) => [...current, {
          id: nextId.current++, role: "assistant",
          text: "해당 질문은 빅카인즈 이용 방법과 관련된 질문이 아닙니다. 빅카인즈 검색·분석·다운로드 이용을 안내해 드릴게요.",
          isFallback: true, intent: "OUT_OF_SCOPE", question: cleanQuestion,
          actions: [
            { id: "not-search-news", label: "뉴스 찾기", type: "SET_MODE", value: "NEWS_FIND" },
            { id: "not-search-guide", label: "이용 안내", type: "SET_MODE", value: "USAGE_GUIDE" },
          ],
        }]);
        updateWorkingState({ lastIntent: "OUT_OF_SCOPE", lastSearchMode: "NOT_SEARCH" });
        recordInsight({ eventType: "OUT_OF_SCOPE", pageType: pageContext.pageType });
        setIsTyping(false);
        return;
      }

      if (activeMode === "SEARCH_DIAGNOSIS") {
        const diagnosis = diagnoseSearchExpression(cleanQuestion);
        if (diagnosis) {
          showSearchDiagnosis(diagnosis, cleanQuestion);
          setIsTyping(false);
          return;
        }
      }

      if (diagnosticKind && /안\s*나|없|오류|에러|실패|작동하지|문제/i.test(cleanQuestion)) {
        setMessages((current) => [...current, {
          id: nextId.current++, role: "assistant", text: getDiagnosticFlow(diagnosticKind).title,
          diagnostic: getDiagnosticFlow(diagnosticKind), intent: diagnosticKind === "API_ERROR" ? "OPEN_API_REDIRECT" : "TROUBLESHOOT",
          question: cleanQuestion,
        }]);
        updateWorkingState({ lastIntent: diagnosticKind === "API_ERROR" ? "TROUBLESHOOT" : "SEARCH_DIAGNOSIS" });
        recordInsight({ eventType: diagnosticKind === "API_ERROR" ? "TROUBLESHOOT_USED" : "SEARCH_DIAGNOSIS_USED", pageType: pageContext.pageType });
        setIsTyping(false);
        return;
      }

      const searchExpressionIntent = detectSearchExpressionIntent(cleanQuestion);
      if (searchExpressionIntent && !isOpenApiQuestion(cleanQuestion) && !isArticleContentQuestion(cleanQuestion) && !generalKnowledgeQuestion) {
        if (renderSearchCoachMessage(searchExpressionIntent.input, cleanQuestion, "새로운 검색 주제로 이해했습니다. 요청하신 조건으로 BIG KINDS 검색식을 만들었습니다.", [], "NEW")) {
          setIsTyping(false);
          return;
        }
      }

      if (isChatbotMetaQuestion(cleanQuestion)) {
        setMessages((current) => [...current, {
          id: nextId.current++, role: "assistant",
          text: "빅카인즈 검색·분석·다운로드 이용 방법과 공식 안내를 도와드려요. 원하는 목적을 골라보세요.",
          isFallback: true, question: cleanQuestion, intent: "META",
          actions: purposeMenu.filter((item) => item.mode !== "OPEN_API").map((item) => ({ id: `meta-${item.label}`, label: item.label, type: "SET_MODE", value: item.mode })),
        }]);
        setIsTyping(false);
        return;
      }

      if (isStoredArticleCountQuestion(cleanQuestion)) {
        const scaleDocument = knowledge.find((item) => item.id === "bigkinds-intro-data-scale");
        if (scaleDocument) {
          showOfficialDocument(scaleDocument, cleanQuestion, "SERVICE_FACT");
          setIsTyping(false);
          return;
        }
        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            role: "assistant",
            text: "저장된 공식 문서에서는 현재 전체 기사 수의 최신 값을 확인할 수 없습니다. 정확한 수록 현황은 빅카인즈 공식 안내에서 확인해 주세요.",
            isFallback: true,
            question: cleanQuestion,
            intent: "SERVICE_FACT",
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

      if (isArticleContentQuestion(cleanQuestion)) {
        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            role: "assistant",
            text: "기사 원문을 직접 읽거나 요약하는 기능은 제공하지 않습니다. 대신 해당 주제의 기사를 더 정확하게 찾을 수 있도록 검색식을 만들어드릴 수 있습니다.",
            isFallback: true, intent: "ARTICLE_UNSUPPORTED",
            actions: [{ id: "article-search-build", label: "검색식 만들어보기", type: "SET_MODE", value: "SEARCH_BUILD" }],
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
            text: "해당 질문은 빅카인즈 이용 방법과 관련된 질문이 아닙니다. 빅카인즈 검색·분석·다운로드·수록 데이터 이용을 안내해 드릴게요.",
            isFallback: true, intent: "OUT_OF_SCOPE",
            actions: [
              { id: "general-news", label: "뉴스 찾기", type: "SET_MODE", value: "NEWS_FIND" },
              { id: "general-search", label: "검색식 만들기", type: "SET_MODE", value: "SEARCH_BUILD" },
              { id: "general-feature", label: "기능 추천", type: "SET_MODE", value: "FEATURE_RECOMMENDATION" },
            ],
            question: cleanQuestion,
          },
        ]);
        setIsTyping(false);
        return;
      }

      if (isSearchGoalQuestion(cleanQuestion)) {
        const answeredBySearchCoach = await answerSearchGoal(cleanQuestion);
        if (answeredBySearchCoach) {
          setIsTyping(false);
          return;
        }
        recordInsight({ eventType: "NO_CONFIDENT_MATCH", pageType: pageContext.pageType });
        setMessages((current) => [...current, {
          id: nextId.current++,
          role: "assistant",
          text: "찾고 싶은 주제를 검색어와 조건으로 조금 더 구체적으로 알려주세요. 검색식으로 바꾸어 드릴게요.",
          isFallback: true,
          fallbackKind: "SEARCH_GOAL",
          question: cleanQuestion,
        }]);
        setIsTyping(false);
        return;
      }

      if (!dataReady) {
        setMessages((current) => [...current, {
          id: nextId.current++, role: "assistant",
          text: "공식 Q&A 데이터를 불러오는 중입니다. 데이터 로딩이 완료된 뒤 다시 질문해 주세요.",
          isFallback: true, question: cleanQuestion,
        }]);
        setIsTyping(false);
        return;
      }

      const searchHelp = /검색식|검색어|연산자/i.test(cleanQuestion) && /어떻게|방법|사용|쓰|조합/i.test(cleanQuestion);
      const searchHelpDocument = searchHelp ? knowledge.find((item) => item.id === "official-faq-17") : undefined;
      const searchUsageDocument = isSearchUsageQuestion(cleanQuestion)
        ? knowledge.find((item) => item.id === "bigkinds-intro-overview")
        : undefined;
      const fullTextDownload = /기사.*(?:전체|본문|전문)|(?:전체|본문|전문).*기사/i.test(cleanQuestion);
      const downloadDocument = routed.intent === "SERVICE_GUIDE"
        ? knowledge.find((item) => item.id === (fullTextDownload ? "bigkinds-canonical-fulltext-download" : "bigkinds-canonical-download"))
        : undefined;
      const results = downloadDocument
        ? [{ item: downloadDocument, score: 999 }]
        : searchHelpDocument
        ? [{ item: searchHelpDocument, score: 999 }]
        : searchUsageDocument
          ? [{ item: searchUsageDocument, score: 999 }]
          : searchFaq(cleanQuestion, 3, knowledge, { excludeFreshnessSensitive: routed.intent === "SERVICE_FACT" });
      const privacyDocument = knowledge.find((item) => item.id === "privacy-security");
      const safeResults = sensitive && privacyDocument
        ? [{ item: privacyDocument, score: 999 }]
        : results;
      const best = safeResults[0];
      const assistantId = nextId.current++;

      const confidence = evaluateSearchConfidence(cleanQuestion, safeResults);
      if (diagnosticKind && cleanQuestion.length < 40) {
        recordInsight({ eventType: "SEARCH_DIAGNOSIS_USED", pageType: pageContext.pageType });
        setMessages((current) => [
          ...current,
          { id: assistantId, role: "assistant", text: getDiagnosticFlow(diagnosticKind).title, diagnostic: getDiagnosticFlow(diagnosticKind), question: cleanQuestion },
        ]);
      } else if (!best || !confidence.accepted || !isAnswerableDocument(best.item)) {
        const answeredByAi = await answerWithAi(cleanQuestion);
        if (answeredByAi) {
          setIsTyping(false);
          return;
        }
        recordInsight({ eventType: "NO_CONFIDENT_MATCH", pageType: pageContext.pageType });
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: "assistant",
            text: "저장된 공식 문서에서 질문과 충분히 일치하는 근거를 찾지 못했습니다. 잘못된 안내를 피하기 위해 추정해서 답변하지 않습니다. 질문을 조금 더 구체적으로 입력하거나 빅카인즈 공식 Q&A에서 확인해 주세요.",
            isFallback: true,
            question: cleanQuestion,
          },
        ]);
      } else {
        const answerModel = buildAnswerViewModel(best.item);
        const supplementAnswer = null;
        updateWorkingState({ lastIntent: routed.intent === "SERVICE_FACT" || routed.intent === "SERVICE_GUIDE" ? routed.intent : "FAQ_SEARCH" });
        recordInsight({ eventType: "FAQ_ANSWERED", pageType: pageContext.pageType, documentId: best.item.id });
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: "assistant",
            text: supplementAnswer || answerModel.summary,
            matchedId: best.item.id,
            relatedIds: safeResults.slice(1).map((result) => result.item.id),
            answerModel,
            question: cleanQuestion,
            usedSupplement: Boolean(supplementAnswer),
            intent: routed.intent === "SERVICE_FACT" || routed.intent === "SERVICE_GUIDE" ? routed.intent : "FAQ_SEARCH",
          },
        ]);
      }

      setIsTyping(false);
    }, 420);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(query);
  }

  function resetConversation() {
    persistCurrentSessionNow();
    sessionRef.current = createChatSession();
    sessionIdRef.current = sessionRef.current.id;
    aiStateRef.current = {
      lastIntent: null,
      lastSearchInput: null,
      lastGeneratedQuery: null,
      lastCapabilityId: null,
      activeMode: null,
      lastSearchMode: null,
      searchRevision: 0,
      searchStartedAt: null,
      searchContext: emptySearchContext(),
    };
    setActiveMode(null);
    const nextMessages = [{ ...welcomeMessage, id: nextId.current++ }];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setFeedback({});
    setFeedbackReasons({});
    setExpandedMessages({});
    setRecommendedQuestions((current) => generateRecommendedQuestions(pageContext.pageType, knowledge, current));
    setShowRecommendations(true);
    setShowPurposeMenu(true);
    saveActiveChatSession(sessionRef.current);
  }

  function closeWidget() {
    persistCurrentSessionNow();
    const parentOrigin = document.referrer ? (() => { try { return new URL(document.referrer).origin; } catch { return ""; } })() : "";
    window.parent.postMessage({ type: "bigkinds-chatbot-close" }, parentOrigin || "*");
  }

  function handleCloseWidget() {
    if (embedded) closeWidget();
    else {
      persistCurrentSessionNow();
      setChatOpen(false);
    }
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
                <div><strong>공식</strong><span>근거 기반</span></div>
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
              <p className="free-usage-note">누구나 무료로 이용할 수 있습니다.</p>
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
              <span><i /> {dataReady ? "공식 문서 기반 · 기사 원문 미저장" : "공식 문서 연결 중"}</span>
            </div>
          </div>
          <div className="header-actions">
            {answeredCount > 0 && (
              <button className="icon-button reset-button" type="button" onClick={resetConversation} aria-label="대화 초기화" title="대화 초기화">↻</button>
            )}
            <button className="icon-button" type="button" onClick={handleCloseWidget} aria-label="챗봇 닫기">×</button>
          </div>
        </header>

        <div className="topic-strip" aria-label="빠른 주제 선택">
          <button type="button" onClick={() => setShowPurposeMenu((current) => !current)} aria-expanded={showPurposeMenu}>
            {showPurposeMenu ? "메뉴 접기" : "처음 메뉴"}
          </button>
          <button type="button" onClick={() => setShowQueryBuilder((current) => !current)} aria-expanded={showQueryBuilder}>
            검색식 만들기
          </button>
        </div>

        {contextLabel && <p className="context-note" role="status">{contextLabel}</p>}

        {showPurposeMenu && (
          <section className="purpose-panel" aria-label="도움이 필요한 목적 선택">
            <div className="purpose-heading"><strong>어떤 도움이 필요하신가요?</strong><span>원하는 목적을 고르면 다음 단계부터 안내해 드립니다.</span></div>
            <div className="purpose-grid">
              {purposeMenu.map((item) => <button key={item.label} type="button" onClick={() => startMode(item.mode)} disabled={isTyping}><b>{item.label}</b><small>{item.description}</small></button>)}
            </div>
            <p className="direct-question-note">직접 질문해도 됩니다.</p>
            <button className="direct-question-example" type="button" onClick={() => setQuery("반도체와 인공지능 관련 뉴스에서 주가는 빼고 검색하고 싶어요.")}>예: 반도체와 인공지능 관련 뉴스에서 주가는 빼고 검색하고 싶어요.</button>
          </section>
        )}

        {showRecommendations && !showPurposeMenu && (
          <section className="recommendation-panel" aria-label="추천 질문">
            <div className="recommendation-heading"><strong>추천 질문</strong><span>페이지와 문서 유형에 맞춰 매번 새로 추천합니다</span></div>
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
                    {message.apiRedirect && <div className="api-redirect"><button type="button" onClick={() => emitHostAction({ type: "OPEN_URL", label: "뉴스토어 OPEN API 확인", url: OPEN_API_PURCHASE_URL })}>뉴스토어 OPEN API 확인 ↗</button></div>}
                    {message.articleLookupCase && <div className="article-lookup-card"><strong>자료 찾기 조건</strong><dl>{[
                      ["기간", message.articleLookupCase.period.originalText || (message.articleLookupCase.period.from ? `${message.articleLookupCase.period.from} ~ ${message.articleLookupCase.period.to}` : "")],
                      ["언론사", message.articleLookupCase.media.join(", ")],
                      ["인물", message.articleLookupCase.persons.join(", ")],
                      ["소속", message.articleLookupCase.organizations.join(", ")],
                      ["직위", message.articleLookupCase.roles.join(", ")],
                      ["주제", [...message.articleLookupCase.events, ...message.articleLookupCase.awards].filter((item, index, values) => values.indexOf(item) === index).join(", ")],
                      ["지면 단서", message.articleLookupCase.pageHints.join(", ")],
                      ["자료 형태", materialTypeLabels[message.articleLookupCase.materialType]],
                    ].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>}
                    {message.lookupStrategies && message.lookupStrategies.length > 0 && <div className="lookup-strategies"><strong>검색 전략</strong>{message.lookupStrategies.map((strategy, index) => <article key={strategy.id}><span>{index + 1}</span><div><b>{strategy.title}</b><p>{strategy.description}</p><code>{strategy.query}</code>{strategy.dateFrom && <small>기간 {strategy.dateFrom} ~ {strategy.dateTo}</small>}{strategy.media?.length ? <small>언론사 {strategy.media.join(", ")}</small> : null}{strategy.relatedSuggestions?.length ? <small>검색 범위를 넓히기 위한 관련 표현: {strategy.relatedSuggestions.join(", ")}</small> : null}<div><button type="button" onClick={() => copyText(strategy.query)}>검색식 복사</button><button type="button" onClick={() => embedded ? emitHostAction({ type: "APPLY_SEARCH_QUERY", label: "검색창에 적용", value: strategy.query }) : emitHostAction({ type: "OPEN_URL", label: "BIGKinds 검색화면 열기", url: "https://www.bigkinds.or.kr/v2/news/search.do" })}>BIGKinds에서 검색</button><button type="button" onClick={() => applyLookupStrategy(strategy.id)}>이 전략 사용</button></div></div></article>)}</div>}
                    {message.replyDraft && <div className="lookup-reply-draft"><strong>문의 회신 초안</strong><p>{message.replyDraft}</p><button type="button" onClick={() => copyText(message.replyDraft || "")}>초안 복사</button></div>}
                    {message.searchQuery && (
                      <div className="search-query-answer">
                        <strong>검색 조건을 이렇게 이해했습니다</strong>
                        {message.searchQuery.input && (
                          <div className="search-query-groups">
                            {(["all", "any", "exact", "exclude"] as const).map((field) => {
                              const values = message.searchQuery?.input?.[field] || [];
                              if (!values.length) return null;
                              const labels = { all: "모두 포함", any: "하나 이상 포함", exact: "정확 문구", exclude: "제외" };
                              return <div className="search-query-group" key={field}><span>{labels[field]}</span><div>{values.map((value) => <b key={field + "-" + value}>{value}</b>)}</div></div>;
                            })}
                          </div>
                        )}
                        <strong>추천 검색식</strong>
                        <code>{message.searchQuery.value}</code>
                        <p>{message.searchQuery.description}</p>
                        {message.suggestedTerms && message.suggestedTerms.length > 0 && <div className="suggested-term-panel"><span>관련 표현도 같이 검색할까요?</span>{message.suggestedTerms.map((suggestion) => <div key={suggestion.baseTerm} className="suggested-term-row"><b>{suggestion.baseTerm}</b>{suggestion.alternatives.map((term) => <button key={term} type="button" onClick={() => handleMessageAction({ id: `suggestion-${term}`, label: term, type: "USE_ALL_SUGGESTIONS", value: JSON.stringify(suggestion) })}>{term}</button>)}</div>)}</div>}
                        <div>
                          <button type="button" onClick={() => emitHostAction({ type: "APPLY_SEARCH_QUERY", label: "검색창에 적용", value: message.searchQuery?.value })}>검색창에 적용</button>
                          <button type="button" onClick={() => copyText(message.searchQuery?.value || "")}>검색식 복사</button>
                          <button type="button" onClick={() => setShowQueryBuilder(true)}>조건 수정</button>
                          <button type="button" onClick={() => ask("검색식 사용법을 알려줘")}>검색법 보기</button>
                        </div>
                      </div>
                    )}
                    {message.searchDiagnosis && <div className="search-diagnosis"><strong>검색식 진단</strong><span>입력한 검색식</span><code>{message.searchDiagnosis.input}</code><span>권장 검색식</span><code>{message.searchDiagnosis.suggestion}</code><p>{message.searchDiagnosis.message}</p>{message.manualReference && <small className="authority-badge">{message.manualReference.label} 검색하기 {message.manualReference.section} 기준</small>}<div><button type="button" onClick={() => copyText(message.searchDiagnosis?.suggestion || "")}>수정 검색식 복사</button><button type="button" onClick={() => handleMessageAction({ id: "apply-diagnosis-inline", label: "수정 검색식 사용", type: "APPLY_SEARCH_DIAGNOSIS", value: message.searchDiagnosis?.suggestion })}>수정 검색식 사용</button></div></div>}
                    {message.supportCase && <div className="support-case-card">
                      <strong>{message.supportCase.issues.length > 1 ? "두 가지 문제가 함께 있는 것으로 보입니다." : "문의 내용을 이렇게 확인했습니다."}</strong>
                      <div className="support-issue-list">
                        {message.supportCase.issues.map((issue) => {
                          const document = getSupportDocument(issue);
                          const flow = message.supportDiagnostics?.find((candidate) => candidate.kind === issue);
                          const steps = document?.steps?.length ? document.steps : flow?.options.slice(0, 3).map((option) => option.label) || [];
                          return <article className="support-issue-card" key={issue}>
                            <h4>{supportIssueLabel(issue)}</h4>
                            <span className="support-card-label">확인된 공식 안내</span>
                            <p>{document?.summary || document?.answer || flow?.title || "공식 Q&A에서 현재 상황을 확인해 주세요."}</p>
                            {steps.length > 0 && <><span className="support-card-label">단계</span><ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol></>}
                            <span className="support-card-label">출처</span>
                            <a className="support-source" href={document?.source?.url || SUPPORT_QNA_URL} target="_blank" rel="noreferrer">{document?.source?.label || "빅카인즈 공식 Q&A"} ↗</a>
                            <span className="support-card-label">다음 행동</span>
                            <div className="support-next-actions">{supportIssueActions(message.supportCase, issue, flow).map((action) => <button type="button" key={action.id} onClick={() => handleMessageAction(action)}>{action.label}</button>)}</div>
                          </article>;
                        })}
                      </div>
                      <small>문의 원문과 개인정보는 기록에 저장하지 않고 이슈 요약만 보관합니다.</small>
                    </div>}
                    {message.supportDiagnostics?.map((flow) => <div className="diagnostic-flow" key={flow.kind}><strong>{flow.title}</strong><div>{flow.options.map((option) => <button type="button" key={option.label} onClick={() => ask(option.question)}>{option.label}</button>)}</div></div>)}
                    {message.capabilities && <div className="capability-answer"><strong>추천 기능</strong>{message.capabilities.map((capability) => {
                      const source = capability.sourceIds.map((id) => knowledge.find((item) => item.id === id)).find(Boolean);
                      return <article key={capability.id}><div><b>{capability.label}</b><p>{capability.description}</p></div><div><button type="button" onClick={() => ask(`${capability.label} 사용법을 알려줘`)}>사용법 보기</button><a href={source?.source?.url ?? FAQ_SOURCE_URL} target="_blank" rel="noreferrer">공식 근거 ↗</a></div></article>;
                    })}</div>}
                    {message.capabilityComparison && <div className="capability-answer capability-comparison"><strong>기능 비교</strong>{message.capabilityComparison.map((capability) => {
                      const comparison = capability.id === "NETWORK_ANALYSIS"
                        ? "인물·기관·장소·키워드 사이의 연결관계를 확인합니다."
                        : capability.id === "RELATED_WORDS"
                          ? "검색어와 함께 많이 나타나는 관련 키워드를 확인합니다."
                          : capability.id === "KEYWORD_TREND"
                            ? "시간에 따른 기사량과 검색어 흐름을 확인합니다."
                            : "기사 문장에서 특정 정보와 값을 추출합니다.";
                      return <article key={capability.id}><div><b>{capability.label}</b><p>{comparison}</p></div><button type="button" onClick={() => ask(`${capability.label} 사용법을 알려줘`)}>사용 방법 보기</button></article>;
                    })}</div>}
                    {message.answerModel && (
                      <div className="structured-answer">
                        <button className="answer-expand" type="button" aria-expanded={Boolean(expandedMessages[message.id])} onClick={() => setExpandedMessages((current) => ({ ...current, [message.id]: !current[message.id] }))}>{expandedMessages[message.id] ? "간단히 보기" : "자세히 보기"}</button>
                        {expandedMessages[message.id] && <p className="answer-full">{message.answerModel.details}</p>}
                        {message.answerModel.steps.length > 0 && <div className="answer-block"><strong>이용 순서</strong><ol>{message.answerModel.steps.map((step) => <li key={step}>{formatAnswer(step)}</li>)}</ol></div>}
                        {message.answerModel.cautions.length > 0 && <div className="answer-block caution-block"><strong>주의</strong><ul>{message.answerModel.cautions.map((caution) => <li key={caution}>{formatAnswer(caution)}</li>)}</ul></div>}
                      </div>
                    )}
                    {message.diagnostic && <div className="diagnostic-flow"><strong>{message.diagnostic.title}</strong><div>{message.diagnostic.options.map((option) => <button type="button" key={option.label} onClick={() => ask(option.question)}>{option.label}</button>)}</div></div>}
                    {message.actions && message.actions.length > 0 && <div className="message-actions" aria-label="다음 행동">{message.actions.map((action) => <button type="button" key={action.id} onClick={() => handleMessageAction(action)}>{action.label}</button>)}</div>}
                  </div>

                  {matched && (
                    <div className="answer-meta">
                      <div className="source-meta">
                      <strong className="source-heading">관련 공식 문서(출처)</strong>
                      <a href={matched?.source?.url ?? FAQ_SOURCE_URL} target="_blank" rel="noreferrer">
                        {matched.title || matched.question} ↗
                      </a>
                      <span>{matched?.source?.label ?? "빅카인즈 공식 FAQ"}{matched?.section ? ` · ${matched.section}` : ""}{matched?.source?.pages ? ` · ${matched.source.pages}` : ""}{matched?.source?.document ? ` · ${matched.source.document}` : ""}</span>
                      <small className="source-guidance">정확한 정보는 위 공식 원문을 확인해 주세요.</small>
                      {message.usedSupplement && <small className="authority-badge">공식 문서 기반 문장 보완</small>}
                      {matched?.authority && <small className="authority-badge">{matched.authority === "CURRENT_CANONICAL" ? "최신 공식 기준" : matched.authority === "CURRENT_POLICY" ? "현행 정책" : matched.authority === "CURRENT_OFFICIAL_GUIDE" || matched.authority === "CURRENT_GUIDE" ? "공식 이용 안내" : matched.authority === "CURRENT_OFFICIAL_INTRO" ? "공식 소개" : matched.authority === "USER_MANUAL_V4_2" ? "사용자매뉴얼 v4.2" : matched.authority === "OFFICIAL_FAQ" ? "공식 FAQ" : matched.authority === "VERIFIED_QNA" ? "검증된 Q&A" : "과거 Q&A 참고"}{matched.status === "REVIEW_REQUIRED" ? " · 검토 필요" : ""}</small>}
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
                    <div className="answer-no-source">관련 공식 문서를 찾지 못했습니다. 저장된 공식 문서 범위 밖의 내용은 추측하지 않습니다.</div>
                  )}

                  {(related.length > 0 || message.isFallback || Boolean(message.actions?.length)) && (
                    <div className="related-list">
                      <span>{message.isFallback ? "이런 주제는 답할 수 있어요" : "함께 볼 질문"}</span>
                      {message.fallbackKind === "SEARCH_GOAL"
                        ? searchGoalFallbackQuestions.map((question) => <button key={question} type="button" onClick={() => ask(question)}>{question}</button>)
                        : (message.isFallback ? recommendedQuestions.map((question) => knowledge.find((item) => item.question === question)).filter(Boolean) : related).map((item) => item && (
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
          <p className="disclaimer">빅카인즈 Q&amp;A는 저장된 공식 Q&amp;A·FAQ·소개·정책 문서를 기준으로 안내합니다.<br />정확한 정보와 최신 내용은 출처로 함께 제공되는 공식 원문을 확인해 주세요.</p>
          <p className="free-note">누구나 무료로 이용할 수 있습니다.</p>
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
