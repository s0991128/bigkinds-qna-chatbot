import type { PageType } from "./page-context";
import type { SearchableDocument } from "./search";
import { rankRecommendations } from "./recommendation-engine";

const compatibilityQuestions = [
  "인공지능과 반도체를 모두 포함한 검색식을 만들어줘",
  "OPEN API 문의는 뉴스토어에서 확인하고 싶어요",
];

/**
 * 기존 화면·fallback이 사용하는 문자열 API입니다.
 * 추천의 순서와 반복 억제는 recommendation-engine이 결정합니다.
 */
export function generateRecommendedQuestions(pageType: PageType, documents: SearchableDocument[], previous: string[] = []) {
  const ranked = rankRecommendations({
    pageType,
    loggedIn: null,
    activeMode: null,
    lastIntent: null,
    lastCapabilityId: null,
    searchContextStatus: "EMPTY",
    searchRevision: 0,
    recentRecommendationIds: [],
  }, documents);
  const questions = ranked
    .filter((item) => item.candidate.question && !previous.includes(item.candidate.question))
    .map((item) => item.candidate.question as string);
  return [...new Set([...questions, ...compatibilityQuestions])].slice(0, 3);
}
