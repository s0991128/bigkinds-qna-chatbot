import { buildSearchQuery, validateSearchInput } from "./search-query-builder";
import type { SearchQueryInput } from "./search-query-builder";
import { normalizeSearchInput } from "./search-term-normalizer";

export type SearchTurnMode = "NEW" | "UPDATE" | "DIAGNOSIS" | "NOT_SEARCH" | "CLARIFY";
export type SearchContextStatus = "ACTIVE" | "PROPOSED" | "STALE";
export type SearchContextSource = "NEW" | "DIAGNOSIS" | "UPDATE" | null;

export type SearchContext = {
  status: SearchContextStatus;
  input: SearchQueryInput | null;
  query: string | null;
  source: SearchContextSource;
  updatedAt: string | null;
  revision: number;
};

export const SEARCH_CONTEXT_TTL_MS = 30 * 60 * 1000;

export type SearchTurnPatch = {
  add?: Partial<SearchQueryInput>;
  remove?: Partial<SearchQueryInput>;
};

export type SearchTurnResult = {
  mode: SearchTurnMode;
  searchInput?: SearchQueryInput;
  patch?: SearchTurnPatch;
  needsClarification?: boolean;
  clarifyingQuestion?: string | null;
};

const searchFields = ["all", "any", "exact", "exclude"] as const;
type SearchField = (typeof searchFields)[number];

function values(input: SearchQueryInput | undefined, field: SearchField) {
  return input?.[field] || [];
}

function normalizedPatchPart(input: Partial<SearchQueryInput> | undefined): SearchQueryInput {
  return validateSearchInput(normalizeSearchInput({
    all: values(input, "all"),
    any: values(input, "any"),
    exact: values(input, "exact"),
    exclude: values(input, "exclude"),
  }));
}

export function applySearchPatch(previous: SearchQueryInput, patch: SearchTurnPatch): SearchQueryInput {
  const current = validateSearchInput(normalizeSearchInput(previous));
  const add = normalizedPatchPart(patch.add);
  const remove = normalizedPatchPart(patch.remove);

  return validateSearchInput(normalizeSearchInput(Object.fromEntries(searchFields.map((field) => [
    field,
    [...values(current, field).filter((term) => !values(remove, field).includes(term)), ...values(add, field)],
  ])) as SearchQueryInput));
}

export function applySearchTurn(previous: SearchQueryInput | null, turn: SearchTurnResult): SearchQueryInput | null {
  if (turn.mode === "NEW") return turn.searchInput ? validateSearchInput(normalizeSearchInput(turn.searchInput)) : null;
  if (turn.mode === "UPDATE") return previous && turn.patch ? applySearchPatch(previous, turn.patch) : previous;
  return previous;
}

export function emptySearchContext(): SearchContext {
  return { status: "STALE", input: null, query: null, source: null, updatedAt: null, revision: 0 };
}

export function getSearchContextStatus(context: SearchContext | null | undefined, now = Date.now()): SearchContextStatus {
  if (!context?.input || !context.updatedAt) return "STALE";
  const updatedAt = Date.parse(context.updatedAt);
  return Number.isFinite(updatedAt) && now - updatedAt <= SEARCH_CONTEXT_TTL_MS ? context.status : "STALE";
}

export function isUsableSearchContext(context: SearchContext | null | undefined, now = Date.now()) {
  const status = getSearchContextStatus(context, now);
  return status === "ACTIVE" || status === "PROPOSED";
}

export function createSearchContext(input: SearchQueryInput, source: Exclude<SearchContextSource, null>, options: {
  status?: Exclude<SearchContextStatus, "STALE">;
  previous?: SearchContext | null;
  now?: string;
} = {}): SearchContext {
  const normalized = validateSearchInput(normalizeSearchInput(input));
  return {
    status: options.status || "ACTIVE",
    input: normalized,
    query: buildSearchQuery(normalized) || null,
    source,
    updatedAt: options.now || new Date().toISOString(),
    revision: (options.previous?.revision || 0) + 1,
  };
}

export function applySearchTurnToContext(previous: SearchContext | null | undefined, turn: SearchTurnResult, now?: string): SearchContext {
  const priorInput = isUsableSearchContext(previous) ? previous?.input || null : null;
  const nextInput = applySearchTurn(priorInput, turn);
  if (!nextInput) return previous ? { ...previous, status: getSearchContextStatus(previous) } : emptySearchContext();
  const source: Exclude<SearchContextSource, null> = turn.mode === "UPDATE" ? "UPDATE" : "NEW";
  return createSearchContext(nextInput, source, { previous, now });
}
