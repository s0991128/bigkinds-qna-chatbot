import type { PageType } from "./page-context";
import type { SearchableDocument } from "./search";

const contextualPools: Partial<Record<PageType, string[]>> = {
  HOME: [
    "빅카인즈에는 어떤 뉴스가 수록되어 있나요?",
    "뉴스 검색은 어떤 순서로 시작하나요?",
    "검색식을 만들어 주세요",
    "검색결과를 엑셀로 내려받을 수 있나요?",
    "빅카인즈 분석결과를 연구에 활용해도 되나요?",
    "OPEN API 이용 문의는 어디로 하나요?",
  ],
  NEWS_SEARCH: [
    "검색결과가 안 나와요",
    "윤석열과 대통령을 포함한 검색식을 만들어줘",
    "형태소와 바이그램은 뭐가 다른가요?",
    "정확한 문구를 검색하려면 어떻게 하나요?",
    "검색결과를 다운로드하고 싶어요",
    "검색 기간과 언론사 조건은 어떻게 설정하나요?",
  ],
  OPEN_API: [
    "OPEN API 이용 신청은 어디에서 하나요?",
    "OPEN API로 제공되는 데이터 범위가 궁금해요",
    "API 호출 오류가 발생했어요",
    "API 본문 제공 범위가 어떻게 되나요?",
    "뉴스토어와 OPEN API의 차이는 무엇인가요?",
  ],
  FAQ: [
    "검색어는 어떤 방식으로 조합하나요?",
    "기사 본문 전체를 받을 수 있나요?",
    "저작권과 출처 표기 기준이 궁금해요",
    "자주 묻는 회원가입 문제를 알려줘",
  ],
  QNA: [
    "최근 검색 관련 공식 답변을 찾아줘",
    "서비스 오류 문의 전에 확인할 내용이 있나요?",
    "저작권 관련 공식 답변을 찾아줘",
    "다운로드 오류는 어떻게 해결하나요?",
  ],
  MORPHEME_ANALYSIS: [
    "형태소와 바이그램 차이가 궁금해요",
    "개체명 분석은 어떻게 하나요?",
    "분석 결과의 키워드는 어떻게 추출되나요?",
  ],
  VISUALIZATION: [
    "분석결과 시각화 방법이 궁금해요",
    "관계도 분석은 몇 건의 기사를 사용하나요?",
    "연관어 분석 결과를 다운로드할 수 있나요?",
  ],
};

const fallbackPool = [
  "검색식과 연산자는 어떻게 쓰나요?",
  "형태소와 바이그램은 뭐가 다른가요?",
  "기사 본문 전체를 받을 수 있나요?",
  "저작권과 출처 표기 기준이 궁금해요",
  "검색결과가 안 나올 때는 어떻게 하나요?",
];

function documentQuestion(document: SearchableDocument) {
  const value = (document.question || document.title || document.questions?.[0] || "").split(/\r?\n/)[0].trim();
  return value.length >= 8 && value.length <= 80 ? value : "";
}

function shuffle<T>(values: T[]) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function generateRecommendedQuestions(pageType: PageType, documents: SearchableDocument[], previous: string[] = []) {
  const pageCandidates = contextualPools[pageType] ?? fallbackPool;
  const documentCandidates = documents
    .filter((document) => document.authority === "OFFICIAL_FAQ" || document.authority === "CURRENT_POLICY")
    .map(documentQuestion)
    .filter(Boolean);
  const pool = [...new Set([...pageCandidates, ...documentCandidates, ...fallbackPool])];
  let next = shuffle(pool).slice(0, 3);
  if (previous.length === 3 && next.join("|") === previous.join("|") && pool.length > 3) {
    next = [pool.find((item) => !previous.includes(item)) || next[0], ...next.slice(1)];
  }
  return next;
}
