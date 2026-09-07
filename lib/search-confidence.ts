import { SearchResult } from "./search";

export type SearchConfidence = {
  accepted: boolean;
  kind: "NO_RESULT" | "DIRECT_MATCH" | "NORMAL";
  score: number;
  matchedTerms: string[];
  reason: string;
};

const genericStopwords = new Set([
  "전체", "내용", "질문", "관련", "방법", "알려", "알려줘", "어떻게", "무엇", "어떤", "있나요", "있어", "해주세요", "해줘", "할까", "가능", "되나요", "인가요", "궁금", "문의", "대해", "좀", "수", "있는", "하고", "싶어",
]);

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function meaningfulTerms(question: string) {
  return [...new Set(normalize(question).split(" ")
    .map((term) => term.replace(/[은는이가을를의에로으로]$/g, ""))
    .filter((term) => term.length >= 2 && !genericStopwords.has(term)))];
}

function searchableText(result: SearchResult) {
  return normalize([
    result.item.question,
    result.item.title,
    ...(result.item.questions ?? []),
    ...result.item.keywords,
  ].filter(Boolean).join(" "));
}

export function evaluateSearchConfidence(question: string, results: SearchResult[]): SearchConfidence {
  const best = results[0];
  if (!best) return { accepted: false, kind: "NO_RESULT", score: 0, matchedTerms: [], reason: "검색 결과가 없습니다." };
  const normalizedQuestion = normalize(question);
  const text = searchableText(best);
  if (normalizedQuestion.length >= 3 && text.includes(normalizedQuestion)) {
    return { accepted: true, kind: "DIRECT_MATCH", score: best.score, matchedTerms: meaningfulTerms(question), reason: "질문이 공식 문서의 질문 또는 제목과 직접 일치합니다." };
  }
  const terms = meaningfulTerms(question);
  const matchedTerms = terms.filter((term) => text.includes(term));
  const second = results[1];
  const separated = !second || best.score - second.score >= 6 || best.score >= 48;
  const accepted = best.score >= 24 && matchedTerms.length >= 2 && separated;
  return {
    accepted,
    kind: "NORMAL",
    score: best.score,
    matchedTerms,
    reason: accepted ? "공식 문서와 의미 있는 키워드가 충분히 일치합니다." : "검색 점수·키워드·결과 차이가 답변 기준에 미치지 못했습니다.",
  };
}
