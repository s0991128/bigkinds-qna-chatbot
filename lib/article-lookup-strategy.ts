import { buildSearchQuery, type SearchQueryInput } from "./search-query-builder";
import type { ArticleLookupCase } from "./article-lookup";

export type LookupStrategy = {
  id: string;
  title: string;
  description: string;
  searchInput: SearchQueryInput;
  query: string;
  dateFrom?: string;
  dateTo?: string;
  media?: string[];
  relatedSuggestions?: string[];
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function makeStrategy(id: string, title: string, description: string, searchInput: SearchQueryInput, articleCase: ArticleLookupCase, relatedSuggestions: string[] = []): LookupStrategy | null {
  const query = buildSearchQuery(searchInput);
  if (!query) return null;
  return { id, title, description, searchInput, query, dateFrom: articleCase.period.from || undefined, dateTo: articleCase.period.to || undefined, media: articleCase.media, relatedSuggestions };
}

function addMonths(dateText: string | null | undefined, offset: number, endOfMonth = false) {
  if (!dateText) return undefined;
  const [year, month] = dateText.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  const shiftedYear = shifted.getUTCFullYear();
  const shiftedMonth = shifted.getUTCMonth() + 1;
  const day = endOfMonth ? new Date(Date.UTC(shiftedYear, shiftedMonth, 0)).getUTCDate() : 1;
  return `${shiftedYear}-${String(shiftedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(dateText: string | null | undefined, offset: number) {
  if (!dateText) return undefined;
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function buildLookupStrategies(articleCase: ArticleLookupCase): LookupStrategy[] {
  const strategies: LookupStrategy[] = [];
  const personAndOrg = unique([...articleCase.persons.slice(0, 1), ...articleCase.organizations.slice(0, 1)]);
  const eventTerms = unique([...articleCase.awards, ...articleCase.events]);
  const orgAndEvent = unique([...articleCase.organizations.slice(0, 1), ...eventTerms.slice(0, 1)]);
  const personAndEvent = unique([...articleCase.persons.slice(0, 1), ...eventTerms.slice(0, 1)]);
  const keywordTerms = unique([...articleCase.keywords.slice(0, 2)]);

  const candidates = [
    makeStrategy("lookup-direct", "가장 직접적인 조건", "인물과 소속 단서를 함께 확인합니다.", { all: personAndOrg }, articleCase),
    makeStrategy("lookup-person-event", "인물과 사건", "인물 단서와 표창·수상 같은 사건 단서를 함께 확인합니다.", { all: personAndEvent }, articleCase, articleCase.awards.includes("표창") ? ["장관상"] : []),
    makeStrategy("lookup-org-event", "소속과 사건", "소속과 행사·포상 단서를 조합해 확인합니다.", { all: orgAndEvent }, articleCase, articleCase.awards.includes("표창") ? ["장관상"] : []),
    makeStrategy("lookup-keywords", "핵심 단서 중심", "확인된 핵심 단서만 사용해 범위를 넓혀 봅니다.", { all: keywordTerms }, articleCase),
  ].filter((strategy): strategy is LookupStrategy => Boolean(strategy));
  strategies.push(...candidates.slice(0, 4));

  if (articleCase.period.precision === "EXACT") {
    const base = strategies[0];
    if (base) strategies.push({ ...base, id: "lookup-expand-period", title: "기간 넓혀보기", description: "정확한 날짜 전후 7일로 기간을 넓혀 확인합니다.", dateFrom: addDays(articleCase.period.from, -7), dateTo: addDays(articleCase.period.to, 7) });
  } else if (articleCase.period.precision === "MONTH") {
    const base = strategies[0];
    if (base) strategies.push({ ...base, id: "lookup-expand-period", title: "기간 넓혀보기", description: "해당 월 전후 한 달로 기간을 넓혀 확인합니다.", dateFrom: addMonths(articleCase.period.from, -1), dateTo: addMonths(articleCase.period.to, 1, true) });
  }
  return strategies.slice(0, 5);
}
