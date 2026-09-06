import { buildSearchQuery, describeSearchQuery, SearchQueryInput } from "./search-query-builder";

export type SearchExpressionIntent = {
  query: string;
  description: string;
  input: SearchQueryInput;
};

const requestPattern = /(검색식|검색어).*(만들|작성|생성|짜|구성)|(?:만들|작성|생성|짜|구성).*(검색식|검색어)/i;
const stopWords = new Set([
  "검색", "검색식", "검색어", "키워드", "단어", "조건", "기사", "뉴스", "만들", "만들어", "만들어줘", "작성", "작성해", "작성해줘",
  "생성", "생성해", "생성해줘", "구성", "구성해", "구성해줘", "짜", "짜줘", "포함", "포함한", "포함하는", "동시에", "함께",
  "알려", "알려줘", "해주세요", "해줘", "주세요", "원해", "싶어", "싶습니다", "을", "를", "이", "가", "은", "는", "및", "과", "와",
]);

function normalizeTerm(term: string) {
  return term.replace(/^[\s\(\[“”'\"]+|[\s\)\]“”'\"]+$/g, "").trim();
}

function extractQuotedTerms(question: string) {
  return [...question.matchAll(/["“]([^"”]+)["”]/g)].map((match) => normalizeTerm(match[1] || "")).filter(Boolean);
}

function extractCandidate(question: string) {
  const withoutQuotes = question.replace(/["“][^"”]+["”]/g, " ");
  const marker = withoutQuotes.match(/(.+?)(?:을|를)?\s*(?:포함한|포함하는|동시에|함께)\s*(?:검색식|검색어)/i);
  if (marker?.[1]) return marker[1];
  const beforeSearch = withoutQuotes.split(/(?:검색식|검색어)/i)[0];
  return beforeSearch.replace(/(?:만들|작성|생성|구성|짜).*$/i, "");
}

function extractTerms(candidate: string) {
  return candidate
    .split(/\s*(?:또는|or|중\s*하나|과|와|및|그리고|,|\/|\+)\s*/i)
    .flatMap((part) => part.split(/\s+/))
    .map(normalizeTerm)
    .filter((term) => term.length >= 2 && !stopWords.has(term.toLowerCase()))
    .filter((term, index, terms) => terms.indexOf(term) === index);
}

export function detectSearchExpressionIntent(question: string): SearchExpressionIntent | null {
  if (!requestPattern.test(question)) return null;
  const exact = extractQuotedTerms(question);
  const terms = extractTerms(extractCandidate(question));
  if (!terms.length && !exact.length) return null;

  const any = /(?:또는|or|중\s*하나)/i.test(question) ? terms : [];
  const all = any.length ? [] : terms;
  const input: SearchQueryInput = { any, all, exact };
  const query = buildSearchQuery(input);
  if (!query) return null;

  return { query, description: describeSearchQuery(input), input };
}

export function isDateQuestion(question: string) {
  return /(?:오늘|현재)\s*(?:은|이|의)?\s*(?:몇\s*월\s*며칠|몇\s*일|날짜|일자)|오늘\s*날짜/i.test(question);
}

export function isStoredArticleCountQuestion(question: string) {
  const hasCount = /몇\s*(?:건|개|개수)?|개수|건수|얼마/i.test(question);
  const hasContent = /기사|뉴스|문서|데이터|자료/i.test(question);
  const hasStorage = /저장|보유|수록|전체|총|가지고\s*있|몇\s*건의/i.test(question);
  return hasCount && hasContent && hasStorage;
}

export function isKnowledgeDocumentsQuestion(question: string) {
  return /검색\s*문서|저장된\s*문서|문서\s*유형|지식\s*문서/i.test(question)
    && /어떤|무엇|내용|종류|구성|있어|보여/i.test(question);
}

export function isUnderspecifiedQuestion(question: string) {
  const normalized = question.toLowerCase().replace(/[\s?!.,。？！]+/g, " ").trim();
  return /^(?:예시(?:를)?\s*(?:들어|보여)?줘|예를\s*들어줘|너한테는\s*어떤\s*질문을\s*해야\s*해|무슨\s*질문을\s*해야\s*해|무엇을\s*물어봐야\s*해|더\s*알려줘|자세히\s*설명해줘|도와줘)$/.test(normalized);
}

export function isLikelyGeneralKnowledgeQuestion(question: string) {
  const serviceTerms = /빅카인즈|검색|기사|뉴스|데이터|api|faq|qna|이용|저작권|다운로드|분석|회원|오류|문의|정책|요금|검색식|연산자|형태소|바이그램|언론사|본문|수집|시각화/i;
  const generalTerms = /대한민국|한국|대통령|총리|날씨|환율|주가|누구|무엇|몇\s*(?:명|개|년|월|일)|언제|어디|왜/i;
  return generalTerms.test(question) && !serviceTerms.test(question);
}

export function todayInKorea() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}
