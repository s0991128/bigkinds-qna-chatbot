import type { PageType } from "./page-context";
import type { SearchableDocument } from "./search";

export type RecommendationMode = "NEWS_FIND" | "SEARCH_BUILD" | "SEARCH_DIAGNOSIS" | "FEATURE_RECOMMENDATION" | "TROUBLESHOOT" | "USAGE_GUIDE" | "ARTICLE_LOOKUP" | "OPEN_API";
export type RecommendationKind = "MODE" | "QUESTION" | "CAPABILITY" | "TROUBLESHOOT" | "GUIDE";
export type RecommendationSource = "CONTEXT_RULE" | "LLM_RERANK";

export type RecommendationCandidate = {
  id: string;
  kind: RecommendationKind;
  label: string;
  description?: string;
  mode?: RecommendationMode;
  question?: string;
  capabilityId?: string;
  pageTypes?: PageType[];
  intents?: string[];
  activeModes?: string[];
  requiresSearchContext?: boolean;
  requiresKnowledgeIds?: string[];
  baseScore: number;
};

export type RecommendationContext = {
  pageType: PageType;
  loggedIn: boolean | null;
  activeMode: string | null;
  lastIntent: string | null;
  lastCapabilityId: string | null;
  searchContextStatus: "EMPTY" | "ACTIVE" | "STALE";
  searchRevision: number;
  recentRecommendationIds: string[];
};

export type RankedRecommendation = {
  candidate: RecommendationCandidate;
  score: number;
  reasons: string[];
  source: RecommendationSource;
};

export const RECOMMENDATION_WEIGHTS = {
  pageTypeExact: 50,
  activeModeMatch: 35,
  lastIntentMatch: 30,
  nextCapability: 25,
  activeSearchContext: 25,
  searchRevision: 15,
  sourceAvailable: 15,
  directAction: 10,
  repeatedImmediately: -40,
  repeatedRecently: -20,
  contextMismatch: -60,
  unavailableSource: -100,
} as const;

const recommendationCandidates: RecommendationCandidate[] = [
  { id: "news-find", kind: "MODE", label: "뉴스 찾기", description: "주제와 조건을 말하면 검색식으로 정리합니다.", mode: "NEWS_FIND", question: "찾고 싶은 뉴스 주제를 입력해 주세요.", pageTypes: ["HOME"], baseScore: 70 },
  { id: "search-build", kind: "MODE", label: "검색식 만들기", description: "AND·OR·NOT 조건을 자연어로 만듭니다.", mode: "SEARCH_BUILD", question: "검색식을 만들어 주세요.", pageTypes: ["HOME", "NEWS_SEARCH"], intents: ["SEARCH_NEW", "SEARCH_UPDATE"], baseScore: 61 },
  { id: "feature-recommendation", kind: "MODE", label: "분석 기능 추천", description: "목적에 맞는 분석 기능을 찾습니다.", mode: "FEATURE_RECOMMENDATION", question: "목적에 맞는 분석 기능을 추천해 주세요.", pageTypes: ["HOME"], baseScore: 53 },
  { id: "article-lookup", kind: "MODE", label: "기사·자료 찾기", description: "과거 기사와 지면 자료의 조건을 정리합니다.", mode: "ARTICLE_LOOKUP", question: "과거 기사나 지면 자료를 찾고 싶어요.", pageTypes: ["HOME", "OLD_NEWSPAPER"], baseScore: 45 },
  { id: "usage-guide", kind: "MODE", label: "이용 안내", description: "수록 범위와 이용 절차를 확인합니다.", mode: "USAGE_GUIDE", question: "빅카인즈 이용 방법을 알려 주세요.", pageTypes: ["HOME"], baseScore: 34 },
  { id: "troubleshoot", kind: "MODE", label: "문제 해결", description: "검색·다운로드·로그인 문제를 살펴봅니다.", mode: "TROUBLESHOOT", question: "이용 중 문제가 생겼어요.", pageTypes: ["HOME"], baseScore: 32 },
  { id: "open-api", kind: "GUIDE", label: "OPEN API", description: "뉴스토어의 공식 API 안내로 이동합니다.", mode: "OPEN_API", question: "OPEN API 이용 문의는 어디에서 확인하나요?", pageTypes: ["HOME", "OPEN_API"], baseScore: 18 },
  { id: "search-diagnosis", kind: "MODE", label: "검색식 진단", description: "AND·OR 조합과 괄호를 점검합니다.", mode: "SEARCH_DIAGNOSIS", question: "이 검색식이 의도대로 해석되는지 확인해 주세요.", pageTypes: ["NEWS_SEARCH"], intents: ["SEARCH_EXPRESSION_DIAGNOSIS", "SEARCH_RESULT_DIAGNOSIS"], requiresSearchContext: false, baseScore: 66 },
  { id: "search-refine", kind: "QUESTION", label: "검색결과 좁히기", description: "검색 조건을 추가하거나 제외합니다.", question: "검색결과를 좁히고 싶어요.", pageTypes: ["NEWS_SEARCH"], intents: ["SEARCH_UPDATE", "SEARCH_RESULT_DIAGNOSIS"], requiresSearchContext: true, baseScore: 56 },
  { id: "search-no-result", kind: "TROUBLESHOOT", label: "검색결과가 안 나와요", description: "검색결과가 없을 때 확인할 조건을 안내합니다.", question: "검색결과가 안 나와요.", pageTypes: ["NEWS_SEARCH"], intents: ["SEARCH_RESULT_DIAGNOSIS", "TROUBLESHOOT"], baseScore: 54 },
  { id: "search-period", kind: "GUIDE", label: "기간·언론사 설정", description: "기간과 언론사 조건을 확인합니다.", question: "검색 기간과 언론사 조건은 어떻게 설정하나요?", pageTypes: ["NEWS_SEARCH"], requiresKnowledgeIds: ["manual-search-basic"], baseScore: 50 },
  { id: "download-guide", kind: "GUIDE", label: "검색결과 다운로드", description: "메타정보와 분석결과 다운로드 범위를 확인합니다.", question: "검색결과를 다운로드하고 싶어요.", pageTypes: ["NEWS_SEARCH"], requiresKnowledgeIds: ["manual-download"], baseScore: 48 },
  { id: "network-analysis", kind: "CAPABILITY", label: "관계도 분석", description: "함께 등장하는 인물·기관·기업의 연결을 봅니다.", capabilityId: "NETWORK_ANALYSIS", question: "관계도 분석은 어떻게 이용하나요?", pageTypes: ["VISUALIZATION"], requiresKnowledgeIds: ["manual-network-analysis"], baseScore: 56 },
  { id: "related-words", kind: "CAPABILITY", label: "연관어 분석", description: "검색어와 함께 나타나는 관련 키워드를 봅니다.", capabilityId: "RELATED_WORDS", question: "연관어 분석은 어떻게 이용하나요?", pageTypes: ["VISUALIZATION"], requiresKnowledgeIds: ["manual-related-words"], baseScore: 54 },
  { id: "keyword-trend", kind: "CAPABILITY", label: "키워드 트렌드", description: "시간에 따른 기사량과 검색어 흐름을 확인합니다.", capabilityId: "KEYWORD_TREND", question: "키워드 트렌드는 어떻게 이용하나요?", pageTypes: ["VISUALIZATION"], requiresKnowledgeIds: ["manual-keyword-trend"], baseScore: 52 },
  { id: "visualization-report", kind: "CAPABILITY", label: "시각화 보고서", description: "분석결과를 보고서로 구성하고 저장합니다.", capabilityId: "VISUALIZATION_REPORT", question: "분석결과를 보고서로 저장하려면 어떻게 하나요?", pageTypes: ["VISUALIZATION"], requiresKnowledgeIds: ["manual-report-create"], baseScore: 48 },
  { id: "email-auth", kind: "TROUBLESHOOT", label: "인증메일 문제", description: "가입·변경 이메일 인증 절차를 확인합니다.", question: "인증메일이 오지 않아요.", pageTypes: ["MEMBERSHIP"], requiresKnowledgeIds: ["support-member-policy"], baseScore: 58 },
  { id: "login-guide", kind: "GUIDE", label: "로그인 방법", description: "회원가입과 로그인 이용 방법을 확인합니다.", question: "회원가입과 로그인 방법을 알려 주세요.", pageTypes: ["MEMBERSHIP"], requiresKnowledgeIds: ["manual-service-overview"], baseScore: 50 },
  { id: "account-guide", kind: "GUIDE", label: "회원정보 관리", description: "회원정보와 프로필 변경 방법을 확인합니다.", question: "회원정보는 어떻게 변경하나요?", pageTypes: ["MEMBERSHIP", "MYPAGE"], requiresKnowledgeIds: ["support-profile-edit"], baseScore: 48 },
  { id: "old-newspaper-guide", kind: "GUIDE", label: "고신문 이용방법", description: "고신문 아카이브 이용 경로를 확인합니다.", question: "고신문은 어떻게 이용하나요?", pageTypes: ["OLD_NEWSPAPER"], requiresKnowledgeIds: ["manual-old-newspaper"], baseScore: 58 },
  { id: "historical-lookup", kind: "MODE", label: "과거 기사·자료 찾기", description: "날짜·언론사·인물 단서로 자료 조건을 정리합니다.", mode: "ARTICLE_LOOKUP", question: "과거 기사나 자료를 찾고 싶어요.", pageTypes: ["OLD_NEWSPAPER"], requiresKnowledgeIds: ["manual-old-newspaper"], baseScore: 56 },
  { id: "fallback-search-guide", kind: "GUIDE", label: "검색식 사용법", description: "검색 연산자와 조건 조합을 확인합니다.", question: "검색식과 연산자는 어떻게 쓰나요?", requiresKnowledgeIds: ["manual-search-operators"], baseScore: 28 },
];

export function getRecommendationCandidates() {
  return recommendationCandidates.map((candidate) => ({ ...candidate, pageTypes: candidate.pageTypes ? [...candidate.pageTypes] : undefined, intents: candidate.intents ? [...candidate.intents] : undefined, requiresKnowledgeIds: candidate.requiresKnowledgeIds ? [...candidate.requiresKnowledgeIds] : undefined }));
}

function sourceIdsAvailable(candidate: RecommendationCandidate, documents: SearchableDocument[]) {
  const available = new Set(documents.map((document) => document.id));
  return (candidate.requiresKnowledgeIds || []).every((id) => available.has(id));
}

function scoreCandidate(candidate: RecommendationCandidate, context: RecommendationContext, documents: SearchableDocument[]): RankedRecommendation | null {
  const reasons: string[] = [];
  let score = candidate.baseScore;
  if (candidate.requiresKnowledgeIds?.length) {
    if (!sourceIdsAvailable(candidate, documents)) return null;
    score += RECOMMENDATION_WEIGHTS.sourceAvailable;
    reasons.push("OFFICIAL_SOURCE_AVAILABLE");
  }
  if (candidate.pageTypes?.length) {
    if (candidate.pageTypes.includes(context.pageType)) {
      score += RECOMMENDATION_WEIGHTS.pageTypeExact;
      reasons.push(`${context.pageType}_PAGE`);
    } else {
      score += RECOMMENDATION_WEIGHTS.contextMismatch;
      reasons.push("CONTEXT_MISMATCH");
    }
  }
  if (candidate.activeModes?.includes(context.activeMode || "")) {
    score += RECOMMENDATION_WEIGHTS.activeModeMatch;
    reasons.push("ACTIVE_MODE");
  }
  if (candidate.intents?.includes(context.lastIntent || "")) {
    score += RECOMMENDATION_WEIGHTS.lastIntentMatch;
    reasons.push("LAST_INTENT");
  }
  if (candidate.capabilityId && candidate.capabilityId === context.lastCapabilityId) {
    score += RECOMMENDATION_WEIGHTS.nextCapability;
    reasons.push("NEXT_CAPABILITY");
  }
  if (candidate.requiresSearchContext) {
    if (context.searchContextStatus !== "ACTIVE") return null;
    score += RECOMMENDATION_WEIGHTS.activeSearchContext;
    reasons.push("ACTIVE_SEARCH_CONTEXT");
  }
  if (context.searchRevision > 0 && ["search-refine", "search-no-result", "search-diagnosis"].includes(candidate.id)) {
    score += RECOMMENDATION_WEIGHTS.searchRevision;
    reasons.push("SEARCH_REVISION");
  }
  const recentIndex = context.recentRecommendationIds.indexOf(candidate.id);
  if (recentIndex === 0) score += RECOMMENDATION_WEIGHTS.repeatedImmediately;
  else if (recentIndex >= 0 && recentIndex < 3) score += RECOMMENDATION_WEIGHTS.repeatedRecently;
  if (recentIndex === 0) reasons.push("REPEATED_IMMEDIATELY");
  else if (recentIndex >= 0 && recentIndex < 3) reasons.push("REPEATED_RECENTLY");
  if (score <= 0) return null;
  return { candidate, score, reasons, source: "CONTEXT_RULE" };
}

export function rankRecommendations(context: RecommendationContext, documents: SearchableDocument[] = []) {
  return recommendationCandidates
    .map((candidate) => scoreCandidate(candidate, context, documents))
    .filter((item): item is RankedRecommendation => Boolean(item))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
}

export function selectRecommendationBuckets(ranked: RankedRecommendation[], limits: { primary?: number; suggestedQuestions?: number; followUp?: number } = {}) {
  const primaryLimit = limits.primary ?? 4;
  const questionLimit = limits.suggestedQuestions ?? 3;
  const followUpLimit = limits.followUp ?? 2;
  const primary: RankedRecommendation[] = [];
  const kinds = new Set<RecommendationKind>();
  for (const item of ranked) {
    if (!["MODE", "CAPABILITY", "GUIDE", "TROUBLESHOOT"].includes(item.candidate.kind)) continue;
    if (primary.length >= primaryLimit) break;
    if (primary.length < 2 || !kinds.has(item.candidate.kind) || item.candidate.kind === "MODE") {
      primary.push(item);
      kinds.add(item.candidate.kind);
    }
  }
  const suggestedQuestions = ranked.filter((item) => Boolean(item.candidate.question)).slice(0, questionLimit);
  const followUp = ranked.filter((item) => !primary.some((selected) => selected.candidate.id === item.candidate.id)).slice(0, followUpLimit);
  return { primary, suggestedQuestions, followUp };
}

export function isGeminiRerankEligible(ranked: RankedRecommendation[], context: RecommendationContext) {
  const [top, second] = ranked;
  if (!top || (!context.lastIntent && !context.lastCapabilityId)) return false;
  return top.score < 45 || Boolean(second && top.score - second.score < 8);
}

export function validateRerankedRecommendationIds(ids: unknown, ranked: RankedRecommendation[], max = 3) {
  if (!Array.isArray(ids)) return [];
  const allowed = new Set(ranked.map((item) => item.candidate.id));
  return ids.filter((id): id is string => typeof id === "string" && allowed.has(id)).slice(0, max);
}

export function applyRerankedRecommendationIds(ranked: RankedRecommendation[], ids: string[]) {
  const order = new Map(ids.map((id, index) => [id, index]));
  return [...ranked]
    .sort((a, b) => {
      const aIndex = order.get(a.candidate.id);
      const bIndex = order.get(b.candidate.id);
      if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;
      return b.score - a.score || a.candidate.id.localeCompare(b.candidate.id);
    })
    .map((item) => order.has(item.candidate.id) ? { ...item, source: "LLM_RERANK" as const, reasons: [...item.reasons, "LLM_RERANK"] } : item);
}
