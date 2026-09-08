import type { SearchQueryInput } from "./search-query-builder";

const particleSuffixes = ["에서", "에게", "으로", "이", "가", "은", "는", "을", "를", "의", "에", "도", "로"];

const eventForms = new Map<string, string>([
  ["탄핵당한", "탄핵"], ["탄핵당했다", "탄핵"], ["탄핵당해", "탄핵"], ["탄핵됐다", "탄핵"], ["탄핵된", "탄핵"], ["탄핵되었다", "탄핵"],
  ["체포당한", "체포"], ["체포당했다", "체포"], ["체포당해", "체포"], ["체포된", "체포"], ["체포됐다", "체포"], ["체포되었다", "체포"],
  ["구속당한", "구속"], ["구속당했다", "구속"], ["구속당해", "구속"], ["구속된", "구속"], ["구속됐다", "구속"], ["구속되었다", "구속"],
  ["기소당한", "기소"], ["기소당했다", "기소"], ["기소당해", "기소"], ["기소된", "기소"], ["기소됐다", "기소"], ["기소되었다", "기소"],
  ["파면된", "파면"], ["파면됐다", "파면"], ["파면되었다", "파면"],
  ["해임된", "해임"], ["해임됐다", "해임"], ["해임되었다", "해임"],
  ["당선된", "당선"], ["당선됐다", "당선"], ["당선되었다", "당선"],
  ["취임한", "취임"], ["취임했다", "취임"],
  ["사퇴한", "사퇴"], ["사퇴했다", "사퇴"],
]);

function trimTermBoundary(value: string) {
  return value.replace(/^[\s([{“”'"「『]+|[\s)]}“”'"」』.,]+$/g, "").trim();
}

function normalizeEventExpression(value: string) {
  return eventForms.get(value) || value;
}

function removeTrailingParticle(value: string) {
  for (const suffix of particleSuffixes) {
    if (value.endsWith(suffix) && value.length > suffix.length + 1) return value.slice(0, -suffix.length);
  }
  return value;
}

function normalizeToken(value: string) {
  const cleaned = trimTermBoundary(value);
  if (!cleaned) return "";
  const eventNormalized = normalizeEventExpression(cleaned);
  return removeTrailingParticle(eventNormalized);
}

export function normalizeSearchTerm(term: string): string[] {
  return term.split(/\s+/).map(normalizeToken).filter(Boolean);
}

function normalizeKeywordTerms(values: string[] = []) {
  return [...new Set(values.flatMap((value) => normalizeSearchTerm(value)))];
}

export function normalizeSearchInput(input: SearchQueryInput): SearchQueryInput {
  return {
    all: normalizeKeywordTerms(input.all),
    any: normalizeKeywordTerms(input.any),
    exact: [...(input.exact || [])],
    exclude: normalizeKeywordTerms(input.exclude),
  };
}
