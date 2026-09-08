import type { SearchTurnMode, SearchTurnPatch } from "../search-context";

export const AI_INTENTS = [
  "SEARCH_COACH",
  "SEARCH_DIAGNOSIS",
  "FEATURE_RECOMMENDATION",
  "TROUBLESHOOT",
  "FAQ_SEARCH",
  "OUT_OF_SCOPE",
  "UNKNOWN",
] as const;

export type AiIntent = (typeof AI_INTENTS)[number];
export type AiTask = "ROUTE" | "INTERPRET_SEARCH_GOAL" | "UPDATE_SEARCH" | "CLASSIFY_SEARCH_TURN";

export type AiSearchInput = {
  all: string[];
  any: string[];
  exact: string[];
  exclude: string[];
};

export type AiSuggestedTerms = {
  baseTerm: string;
  alternatives: string[];
};

export type AiInterpretation = {
  intent: AiIntent;
  searchMode?: SearchTurnMode;
  searchInput?: AiSearchInput;
  patch?: SearchTurnPatch;
  suggestedTerms?: AiSuggestedTerms[];
  capabilityIds?: string[];
  diagnosticKind?: string | null;
  needsClarification: boolean;
  clarifyingQuestion?: string | null;
};

export type AiRouterRequest = {
  question: string;
  task?: AiTask;
  pageType?: string;
  state?: {
    lastIntent?: AiIntent | null;
    lastSearchInput?: AiSearchInput | null;
    lastGeneratedQuery?: string | null;
    activeMode?: string | null;
    lastSearchMode?: SearchTurnMode | null;
    searchRevision?: number;
    searchStartedAt?: string | null;
    pageType?: string | null;
  };
};

export type AiRouterResponse = {
  available: boolean;
  interpretation?: AiInterpretation;
  reason?: "NO_KEY" | "SENSITIVE" | "OPEN_API" | "TIMEOUT" | "UPSTREAM" | "MALFORMED" | "INVALID_REQUEST";
};
