import { FaqItem, faqItems } from "./faq";

export type SearchableDocument = FaqItem & {
  title?: string;
  questions?: string[];
  escalationTags?: string[];
  alwaysEscalate?: boolean;
  requiresReview?: boolean;
  effectiveDate?: string;
  source?: { label?: string; url?: string; pages?: string };
  facts?: string[];
  steps?: string[];
  authority?: "CURRENT_CANONICAL" | "CURRENT_OFFICIAL_INTRO" | "CURRENT_OFFICIAL_GUIDE" | "CURRENT_POLICY" | "OFFICIAL_FAQ" | "VERIFIED_QNA" | "HISTORICAL_QNA";
  status?: "CURRENT" | "REVIEW_REQUIRED" | "SUPERSEDED";
  reviewedAt?: string;
  supersededBy?: string;
};

export type SearchResult = { item: SearchableDocument; score: number };

export type SearchOptions = {
  answerableOnly?: boolean;
};

/** 최종 답변에 사용할 수 있는 현행 공식 문서인지 판정합니다. */
export function isAnswerableDocument(document: SearchableDocument) {
  return document.status === "CURRENT"
    && document.requiresReview !== true
    && document.alwaysEscalate !== true
    && ["CURRENT_CANONICAL", "CURRENT_OFFICIAL_INTRO", "CURRENT_OFFICIAL_GUIDE", "CURRENT_POLICY", "OFFICIAL_FAQ", "VERIFIED_QNA"].includes(document.authority ?? "");
}

export const authorityPrecedence: Record<NonNullable<SearchableDocument["authority"]>, number> = {
  HISTORICAL_QNA: 0,
  VERIFIED_QNA: 10,
  OFFICIAL_FAQ: 20,
  CURRENT_POLICY: 30,
  CURRENT_OFFICIAL_GUIDE: 40,
  CURRENT_OFFICIAL_INTRO: 40,
  CURRENT_CANONICAL: 50,
};

const synonymGroups = [
  ["다운", "다운로드", "내려받기", "받기", "엑셀"],
  ["전문", "전체본문", "기사본문", "본문전체"],
  ["로그인", "회원", "가입", "인증"],
  ["오류", "에러", "안돼", "안됨", "작동안함", "문제"],
  ["검색법", "검색식", "검색방법", "연산자"],
  ["옛날", "과거", "이전", "오래된", "고신문"],
  ["휴대폰", "스마트폰", "모바일"],
  ["인용", "논문", "출판", "저작권", "출처"],
  ["비용", "요금", "가격", "과금", "유료", "결제"],
  ["호출", "요청", "request", "call", "조회"],
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[“”‘’'"`~!@#$%^&*()_+=[\]{}|\\;:,.<>/?·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandedTerms(query: string) {
  const normalized = normalize(query);
  const terms = new Set(normalized.split(" ").filter(Boolean));

  synonymGroups.forEach((group) => {
    if (group.some((term) => normalized.includes(term))) {
      group.forEach((term) => terms.add(term));
    }
  });

  for (let index = 0; index < normalized.length - 1; index += 1) {
    const pair = normalized.slice(index, index + 2);
    if (!pair.includes(" ")) terms.add(pair);
  }

  return [...terms];
}

export function searchFaq(query: string, limit = 3, documents: SearchableDocument[] = faqItems, options: SearchOptions = {}) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const answerableOnly = options.answerableOnly ?? true;

  const lexicalTerms = normalizedQuery
    .split(" ")
    .flatMap((term) => [term, term.replace(/[은는이가을를의에로으로]$/g, "")])
    .filter((term, index, terms) => term.length >= 2 && terms.indexOf(term) === index);
  const genericTerms = new Set(["전체", "내용", "질문", "예시", "예시를", "어떤", "무엇", "방법", "알려", "알려줘", "해주세요", "해줘", "들어", "들어줘", "해야", "너한테는", "뭐", "좀"]);
  const meaningfulTerms = lexicalTerms.filter((term) => !genericTerms.has(term));
  const terms = [...new Set([...expandedTerms(query), ...lexicalTerms])];

  return documents
    .filter((item) => !answerableOnly || isAnswerableDocument(item))
    .map((item) => {
      const questionText = [item.question, item.title, ...(item.questions ?? [])].filter(Boolean).join(" ");
      const question = normalize(questionText);
      const keywords = normalize(item.keywords.join(" "));
      const answer = normalize(item.answer);
      let score = 0;
      let directMatch = question.includes(normalizedQuery);

      if (question.includes(normalizedQuery)) score += 30;
      if (normalizedQuery.length >= 3 && normalizedQuery.includes(question)) score += 16;

      terms.forEach((term) => {
        if (term.length < 2) return;
        if (question.includes(term)) {
          score += term.length >= 4 ? 5 : 2;
          if (meaningfulTerms.includes(term)) directMatch = true;
        }
        if (keywords.includes(term)) {
          score += term.length >= 4 ? 7 : 3;
          if (meaningfulTerms.includes(term)) directMatch = true;
        }
        if (answer.includes(term)) score += 1;
      });

      if (score > 0) score += authorityPrecedence[item.authority ?? "HISTORICAL_QNA"] / 10;
      if (item.status === "SUPERSEDED") score -= 100;

      return { item, score, directMatch };
    })
    .filter((result) => result.score >= 4 && result.directMatch && result.item.status !== "SUPERSEDED")
    .sort((a, b) => b.score - a.score || authorityPrecedence[b.item.authority ?? "HISTORICAL_QNA"] - authorityPrecedence[a.item.authority ?? "HISTORICAL_QNA"])
    .slice(0, limit);
}
