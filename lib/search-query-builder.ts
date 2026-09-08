export type SearchQueryInput = {
  any?: string[];
  all?: string[];
  exact?: string[];
  exclude?: string[];
};

const invalidSearchTerms = new Set([
  "기사", "기사만", "뉴스", "뉴스만", "보도", "검색결과", "검색결", "결과", "어떤", "서로", "내용", "주제",
  "너무", "많이", "많아", "나오는데", "오는데", "어떻게", "줄여", "줄이고", "좁혀", "넓혀", "언급되는지",
]);
const searchCommandPattern = /(?:포함해(?:줘|주세요)?|넣어(?:줘|주세요)?|추가해(?:줘|주세요)?|빼줘|제외해(?:줘|주세요)?|없애줘|되는지|보고\s*싶|찾고\s*싶|싶어요|싶습니다|인가요|할까|나오는데|오는데)/i;

function cleanTerms(values: string[] = [], protectExact = false) {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => protectExact || (!invalidSearchTerms.has(value.toLowerCase()) && !searchCommandPattern.test(value)));
}

export function validateSearchInput(input: SearchQueryInput): SearchQueryInput {
  return {
    any: cleanTerms(input.any),
    all: cleanTerms(input.all),
    exact: cleanTerms(input.exact, true),
    exclude: cleanTerms(input.exclude),
  };
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
  const validated = validateSearchInput(input);
  const any = cleanTerms(validated.any).map((term) => term.includes(" ") ? exactTerm(term) : term);
  const all = cleanTerms(validated.all).map((term) => term.includes(" ") ? exactTerm(term) : term);
  const exact = cleanTerms(validated.exact, true).map(exactTerm).filter(Boolean);
  const exclude = cleanTerms(validated.exclude).map((term) => term.includes(" ") ? exactTerm(term) : term);
  const parts: string[] = [];
  if (any.length) parts.push(any.length > 1 ? `(${any.join(" OR ")})` : any[0]);
  parts.push(...all);
  parts.push(...exact);
  if (exclude.length) parts.push(`NOT ${exclude.length > 1 ? `(${exclude.join(" OR ")})` : exclude[0]}`);
  return parts.join(" AND ");
}

export function describeSearchQuery(input: SearchQueryInput) {
  const validated = validateSearchInput(input);
  const any = cleanTerms(validated.any);
  const all = cleanTerms(validated.all);
  const exact = cleanTerms(validated.exact, true);
  const exclude = cleanTerms(validated.exclude);
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
