export type SearchQueryInput = {
  any?: string[];
  all?: string[];
  exact?: string[];
  exclude?: string[];
};

function cleanTerms(values: string[] = []) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function exactTerm(value: string) {
  const cleaned = value.replace(/^\s*["“]|["”]\s*$/g, "").trim();
  return cleaned ? `"${cleaned}"` : "";
}

export function buildSearchQuery(input: SearchQueryInput) {
  const any = cleanTerms(input.any).map((term) => term.includes(" ") ? exactTerm(term) : term);
  const all = cleanTerms(input.all).map((term) => term.includes(" ") ? exactTerm(term) : term);
  const exact = cleanTerms(input.exact).map(exactTerm).filter(Boolean);
  const exclude = cleanTerms(input.exclude).map((term) => term.includes(" ") ? exactTerm(term) : term);
  const parts: string[] = [];
  if (any.length) parts.push(any.length > 1 ? `(${any.join(" OR ")})` : any[0]);
  parts.push(...all);
  parts.push(...exact);
  if (exclude.length) parts.push(`NOT ${exclude.length > 1 ? `(${exclude.join(" OR ")})` : exclude[0]}`);
  return parts.join(" AND ");
}

export function describeSearchQuery(input: SearchQueryInput) {
  const any = cleanTerms(input.any);
  const all = cleanTerms(input.all);
  const exact = cleanTerms(input.exact);
  const exclude = cleanTerms(input.exclude);
  const sentences: string[] = [];
  if (any.length) sentences.push(`${any.join(" 또는 ")} 중 하나 이상을 포함하고`);
  if (all.length) sentences.push(`${all.join(", ")}을(를) 함께 포함하고`);
  if (exact.length) sentences.push(`${exact.map((term) => `“${term}”`).join(", ")} 문구를 그대로 포함하고`);
  if (exclude.length) sentences.push(`${exclude.join(", ")}이(가) 포함된 기사는 제외합니다.`);
  if (sentences.length && !sentences.at(-1)?.endsWith(".")) sentences[sentences.length - 1] += ".";
  return sentences.join(" ") || "조건을 입력하면 BIGKinds 검색식을 만들어 드립니다.";
}
