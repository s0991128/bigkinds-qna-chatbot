export type PageType =
  | "HOME"
  | "NEWS_SEARCH"
  | "MORPHEME_ANALYSIS"
  | "VISUALIZATION"
  | "REGIONAL_ISSUE"
  | "LATEST_NEWS"
  | "WEEKLY_ISSUE"
  | "OLD_NEWSPAPER"
  | "OPEN_API"
  | "FAQ"
  | "QNA"
  | "MEMBERSHIP"
  | "MYPAGE"
  | "UNKNOWN";

export type PageContext = {
  pageType: PageType;
  pathname: string;
  loggedIn: boolean | null;
};

const pageRules: Array<[PageType, RegExp]> = [
  ["NEWS_SEARCH", /(news|search).*(search|result)|search\.do/i],
  ["MORPHEME_ANALYSIS", /(morpheme|featureExtraction|개체명|형태소)/i],
  ["VISUALIZATION", /(visual|network|wordcloud|analysisResult)/i],
  ["REGIONAL_ISSUE", /(regional|region|localIssue)/i],
  ["LATEST_NEWS", /(latest|recent|todayNews)/i],
  ["WEEKLY_ISSUE", /(weekly|weekIssue)/i],
  ["OLD_NEWSPAPER", /(old|archive|goshinmun|newspaper)/i],
  ["OPEN_API", /(openApi|open-api|apiWrite|openapi)/i],
  ["FAQ", /(faq|faqList)/i],
  ["QNA", /(qna|qnaList)/i],
  ["MEMBERSHIP", /(join|signup|member|login)/i],
  ["MYPAGE", /(mypage|myPage)/i],
];

export function classifyPagePath(pathname: string): PageType {
  const path = pathname || "/";
  if (path === "/" || /\/intro\/(index|main)\.do$/i.test(path)) return "HOME";
  return pageRules.find(([, pattern]) => pattern.test(path))?.[0] ?? "UNKNOWN";
}

export function createPageContext(pathname: string, loggedIn: boolean | null = null): PageContext {
  return { pageType: classifyPagePath(pathname), pathname: pathname || "/", loggedIn };
}

export const pageTypeLabels: Partial<Record<PageType, string>> = {
  HOME: "BIGKinds 이용을 도와드릴게요.",
  NEWS_SEARCH: "뉴스 검색 화면을 보고 계시네요.",
  MORPHEME_ANALYSIS: "형태소·개체명 분석 화면을 보고 계시네요.",
  VISUALIZATION: "분석결과 화면을 보고 계시네요.",
  REGIONAL_ISSUE: "지역이슈분석 화면을 보고 계시네요.",
  LATEST_NEWS: "최신뉴스 화면을 보고 계시네요.",
  WEEKLY_ISSUE: "주간이슈 화면을 보고 계시네요.",
  OLD_NEWSPAPER: "고신문 아카이브 화면을 보고 계시네요.",
  OPEN_API: "OPEN API 이용을 도와드릴게요.",
  FAQ: "FAQ 내용을 함께 찾아볼게요.",
  QNA: "공식 Q&A를 찾아 해결 방법을 안내할게요.",
  MEMBERSHIP: "회원가입·로그인 이용을 도와드릴게요.",
  MYPAGE: "마이페이지 이용을 도와드릴게요.",
};

export const starterQuestionsByPage: Record<PageType, string[]> = {
  HOME: ["뉴스 검색·분석은 어떻게 시작하나요?", "Open API는 어떻게 이용하나요?", "어떤 뉴스가 수록되어 있나요?", "분석결과는 어떻게 활용하나요?"],
  NEWS_SEARCH: ["검색결과가 안 나와요", "검색식을 만들어 주세요", "형태소와 바이그램 차이가 궁금해요", "검색결과를 다운로드하고 싶어요"],
  OPEN_API: ["OPEN API 문의·구매 안내"],
  FAQ: ["FAQ에서 원하는 내용을 찾고 싶어요", "담당자에게 문의하고 싶어요"],
  QNA: ["문의 전 관련 답변 찾아보기", "서비스 오류 문의 방법", "저작권 관련 문의"],
  MORPHEME_ANALYSIS: ["형태소와 바이그램 차이가 궁금해요", "개체명 분석은 어떻게 하나요?"],
  VISUALIZATION: ["분석결과 시각화 방법", "관계도 분석은 몇 건을 사용하나요?"],
  REGIONAL_ISSUE: ["지역이슈분석은 어떻게 이용하나요?"],
  LATEST_NEWS: ["최신뉴스 수록 기준이 궁금해요"],
  WEEKLY_ISSUE: ["주간이슈는 어떻게 선정되나요?"],
  OLD_NEWSPAPER: ["고신문 원문을 보려면 어떻게 하나요?"],
  MEMBERSHIP: ["회원가입 인증메일이 오지 않아요"],
  MYPAGE: ["스크랩한 뉴스를 확인하고 싶어요"],
  UNKNOWN: ["검색식과 연산자는 어떻게 쓰나요?", "기사 본문 전체를 받을 수 있나요?", "형태소와 바이그램은 뭐가 다른가요?"],
};
