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

function joinTerms(values: string[], conjunction: string) {
  if (values.length <= 1) return values[0] || "";
  return `${values.slice(0, -1).join(", ")}${conjunction}${values.at(-1)}`;
}

function objectParticle(value: string) {
  const last = value.trim().at(-1) || "";
  const code = last.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0 ? "을" : "를";
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
  if (all.length) {
    const listed = joinTerms(all, "과 ");
    sentences.push(`${listed}${objectParticle(listed)} 모두 포함하고`);
  }
  if (exact.length) sentences.push(`${exact.map((term) => `“${term}”`).join(", ")} 문구를 그대로 포함하고`);
  if (exclude.length) sentences.push(`${exclude.join(", ")}이(가) 포함된 기사는 제외합니다.`);
  if (sentences.length && !sentences.at(-1)?.endsWith(".")) sentences[sentences.length - 1] += ".";
  return sentences.join(" ") || "조건을 입력하면 BIGKinds 검색식을 만들어 드립니다.";
}
