import type { SearchQueryInput } from "./search-query-builder";
import { normalizeSearchInput } from "./search-term-normalizer";

export type SearchDiagnosis = {
  input: string;
  message: string;
  suggestion: string;
};

function extractExpression(value: string) {
  const compact = value.trim().replace(/[?？!！]+$/, "");
  const match = compact.match(/^(.*?)(?=\s+(?:이렇게\s*(?:검색|쓰|하면)|이\s*검색식|검색하면|맞아|맞나요|맞을까|원하는\s*대로|의도(?:대로|에)|괜찮|문제\s*(?:있|없)|고쳐|수정|검색\s*잘\s*돼|어떻게\s*해석|되는지))/i);
  return (match?.[1] || compact)
    .replace(/^\s*(?:검색식|검색어)\s*[:：]?\s*/i, "")
    .trim();
}

export function diagnoseSearchExpression(value: string): SearchDiagnosis | null {
  const input = extractExpression(value);
  if (!input || !/\b(?:AND|OR|NOT)\b/i.test(input) && !/[()"“”']/.test(input)) return null;
  const match = input.match(/^(.+?)\s+OR\s+(.+?)\s+AND\s+(.+)$/i);
  return {
    input,
    message: match
      ? "OR와 AND를 함께 사용할 때는 의도를 명확히 하기 위해 괄호로 묶는 것을 권장합니다."
      : "입력한 검색식의 연산자와 괄호를 확인해 주세요.",
    suggestion: match
      ? `(${match[1].trim()} OR ${match[2].trim()}) AND ${match[3].trim()}`
      : input,
  };
}

export function parseSearchExpression(value: string): SearchQueryInput {
  const compact = value.trim();
  const grouped = compact.match(/^\((.+?)\s+OR\s+(.+?)\)\s+AND\s+(.+)$/i);
  const any = grouped ? [grouped[1], grouped[2]] : [];
  const rest = grouped ? grouped[3] : compact;
  const excludeMatch = rest.match(/^(.*?)\s+AND\s+NOT\s+(.+)$/i);
  const include = excludeMatch?.[1] || rest;
  const exclude = excludeMatch ? [excludeMatch[2]] : [];
  const all = any.length ? include.split(/\s+AND\s+/i) : include.split(/\s+AND\s+/i);
  return normalizeSearchInput({
    any: any.flatMap((term) => term.split(/\s+OR\s+/i)),
    all: all.filter((term) => term.trim() && !/^\(?\s*$/i.test(term)),
    exact: [],
    exclude,
  });
}
