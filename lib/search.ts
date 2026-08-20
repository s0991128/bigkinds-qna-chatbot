import { FaqItem, faqItems } from "./faq";

export type SearchResult = { item: FaqItem; score: number };

const synonymGroups = [
  ["다운", "다운로드", "내려받기", "받기", "엑셀"],
  ["전문", "전체본문", "기사본문", "본문전체"],
  ["로그인", "회원", "가입", "인증"],
  ["오류", "에러", "안돼", "안됨", "작동안함", "문제"],
  ["검색법", "검색식", "검색방법", "연산자"],
  ["옛날", "과거", "이전", "오래된", "고신문"],
  ["휴대폰", "스마트폰", "모바일"],
  ["인용", "논문", "출판", "저작권", "출처"],
];

function normalize(value: string) {
  return value
    .toLowerCase()
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

export function searchFaq(query: string, limit = 3): SearchResult[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const terms = expandedTerms(query);

  return faqItems
    .map((item) => {
      const question = normalize(item.question);
      const keywords = normalize(item.keywords.join(" "));
      const answer = normalize(item.answer);
      let score = 0;

      if (question.includes(normalizedQuery)) score += 30;
      if (normalizedQuery.length >= 3 && normalizedQuery.includes(question)) score += 16;

      terms.forEach((term) => {
        if (term.length < 2) return;
        if (question.includes(term)) score += term.length >= 4 ? 5 : 2;
        if (keywords.includes(term)) score += term.length >= 4 ? 7 : 3;
        if (answer.includes(term)) score += 1;
      });

      return { item, score };
    })
    .filter((result) => result.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
