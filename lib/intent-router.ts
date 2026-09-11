import type { PageType } from "./page-context";
import { recommendCapabilities } from "./capabilities";
import { detectDiagnosticKind } from "./diagnostic-flows";
import {
  classifySearchTurn,
  isArticleContentQuestion,
  isChatbotMetaQuestion,
  isClearlyOutOfScopeQuestion,
  isFeatureRecommendationQuestion,
  isLikelyGeneralKnowledgeQuestion,
  isOpenApiQuestion,
  isSearchDiagnosisQuestion,
  isSearchExpressionBuildQuestion,
  isSearchExpressionDiagnosisQuestion,
  isServiceFactQuestion,
  isServiceGuideQuestion,
  isServiceOverviewQuestion,
} from "./question-intents";
import { getSearchContextStatus } from "./search-context";
import type { SearchContext, SearchTurnResult } from "./search-context";
import { isArticleLookupUpdateQuestion, isHistoricalArticleLookupQuestion } from "./article-lookup";
import { detectSupportIssues } from "./support-routing";
import type { SupportIssueKind } from "./support-case";

export type UserIntent =
  | "SERVICE_OVERVIEW"
  | "SERVICE_FACT"
  | "SERVICE_GUIDE"
  | "OPEN_API_REDIRECT"
  | "SUPPORT_TRIAGE"
  | "ARTICLE_UNSUPPORTED"
  | "HISTORICAL_ARTICLE_LOOKUP"
  | "META"
  | "SEARCH_EXPRESSION_DIAGNOSIS"
  | "SEARCH_RESULT_DIAGNOSIS"
  | "FEATURE_RECOMMENDATION"
  | "TROUBLESHOOT"
  | "SEARCH_UPDATE"
  | "SEARCH_NEW"
  | "OUT_OF_SCOPE"
  | "CLARIFY";

export type IntentRoute = {
  intent: UserIntent;
  searchTurn?: SearchTurnResult;
  capabilityIds?: string[];
  diagnosticKind?: ReturnType<typeof detectDiagnosticKind>;
  sensitive?: boolean;
  articleLookupUpdate?: boolean;
  supportIssues?: SupportIssueKind[];
};

export type IntentRouteContext = {
  hasSearchContext: boolean;
  pageType: PageType;
  searchContext?: SearchContext | null;
  lastCapabilityId?: string | null;
  hasArticleLookupContext?: boolean;
};

const sensitivePattern = /(?:주민\s*등록\s*번호|\b\d{6}[-\s]\d{7}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:01[016789]|02|0[3-6][1-5])[-\s]?\d{3,4}[-\s]?\d{4}|비밀번호|password|인증키|api\s*key|apikey|bearer\s+[A-Za-z0-9._-]+)/i;

export function routeUserIntent(question: string, context: IntentRouteContext): IntentRoute {
  const clean = question.trim();
  const historicalLookup = isHistoricalArticleLookupQuestion(clean);
  const lookupUpdate = Boolean(context.hasArticleLookupContext && isArticleLookupUpdateQuestion(clean));
  if (isOpenApiQuestion(clean)) return { intent: "OPEN_API_REDIRECT" };
  if (sensitivePattern.test(clean) && !historicalLookup && !lookupUpdate) return { intent: "CLARIFY", sensitive: true };
  const supportIssues = detectSupportIssues(clean);
  const onlyLegacySearchNoResult = supportIssues.length === 1 && supportIssues[0] === "SEARCH_NO_RESULT";
  if (supportIssues.length && !onlyLegacySearchNoResult) return { intent: "SUPPORT_TRIAGE", supportIssues };
  if (isArticleContentQuestion(clean)) return { intent: "ARTICLE_UNSUPPORTED" };
  if (isChatbotMetaQuestion(clean)) return { intent: "META" };
  if (isServiceOverviewQuestion(clean)) return { intent: "SERVICE_OVERVIEW" };
  if (isServiceGuideQuestion(clean)) {
    const capabilityIds = context.lastCapabilityId
      ? [context.lastCapabilityId]
      : recommendCapabilities(clean).map((capability) => capability.id);
    return { intent: "SERVICE_GUIDE", capabilityIds: capabilityIds.length ? capabilityIds : undefined };
  }
  if (isServiceFactQuestion(clean)) return { intent: "SERVICE_FACT" };
  if (historicalLookup || lookupUpdate) return { intent: "HISTORICAL_ARTICLE_LOOKUP", articleLookupUpdate: lookupUpdate };
  if (isSearchExpressionDiagnosisQuestion(clean)) return { intent: "SEARCH_EXPRESSION_DIAGNOSIS" };
  if (isSearchDiagnosisQuestion(clean)) return { intent: "SEARCH_RESULT_DIAGNOSIS" };
  if (isSearchExpressionBuildQuestion(clean)) return { intent: "SEARCH_NEW" };

  if (isFeatureRecommendationQuestion(clean)) {
    const capabilityIds = recommendCapabilities(clean).map((capability) => capability.id);
    if (capabilityIds.length) return { intent: "FEATURE_RECOMMENDATION", capabilityIds };
  }

  const diagnosticKind = detectDiagnosticKind(clean, context.pageType);
  if (diagnosticKind && /안\s*나|없|오류|에러|실패|작동하지|문제|인증키/i.test(clean)) {
    return { intent: "TROUBLESHOOT", diagnosticKind };
  }

  const searchTurn = classifySearchTurn(clean, context.hasSearchContext);
  if (searchTurn.mode === "UPDATE") {
    if (context.searchContext && getSearchContextStatus(context.searchContext) === "STALE") {
      return { intent: "CLARIFY", searchTurn: { mode: "CLARIFY", needsClarification: true, clarifyingQuestion: "이전 검색식에 이어서 수정할까요?" } };
    }
    const existing = context.searchContext?.input;
    const excluded = searchTurn.patch?.add?.exclude || [];
    if (existing && excluded.length && searchTurn.patch) {
      const known = new Set([...(existing.all || []), ...(existing.any || []), ...(existing.exact || [])]);
      const absent = excluded.filter((term) => !known.has(term));
      const remove = excluded.filter((term) => known.has(term));
      searchTurn.patch = {
        ...searchTurn.patch,
        remove: remove.length ? {
          ...(searchTurn.patch.remove || {}),
          all: remove,
          any: remove,
          exact: remove,
        } : searchTurn.patch.remove,
        add: { ...(searchTurn.patch.add || {}), exclude: absent },
      };
    }
    return { intent: "SEARCH_UPDATE", searchTurn };
  }
  if (searchTurn.mode === "NEW") return { intent: "SEARCH_NEW", searchTurn };
  if (searchTurn.mode === "CLARIFY") return { intent: "CLARIFY", searchTurn };

  if (isLikelyGeneralKnowledgeQuestion(clean) || isClearlyOutOfScopeQuestion(clean)) {
    return { intent: "OUT_OF_SCOPE", searchTurn };
  }
  return { intent: "CLARIFY", searchTurn: { mode: "CLARIFY", needsClarification: true, clarifyingQuestion: "빅카인즈 이용 안내인지, 찾고 싶은 뉴스 주제인지 조금 더 알려주세요." } };
}
