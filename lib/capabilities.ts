import type { SearchableDocument } from "./search";

export type Capability = {
  id: string;
  label: string;
  userGoals: string[];
  description: string;
  sourceIds: string[];
  nextAction: "SEARCH_COACH" | "SEARCH_DIAGNOSIS" | "FAQ_SEARCH" | "TROUBLESHOOT";
  actions?: Array<{ type: "SHOW_GUIDE" | "OPEN_FAQ"; label: string; value?: string }>;
};

export const capabilities: Capability[] = [
  {
    id: "NEWS_SEARCH",
    label: "뉴스 검색",
    userGoals: ["뉴스를 찾고 싶어", "관련 기사를 검색하고 싶어", "뉴스 검색을 시작하고 싶어"],
    description: "주제어, 기간, 언론사 조건을 조합해 빅카인즈 뉴스를 검색합니다.",
    sourceIds: ["bigkinds-intro-overview", "official-faq-25", "official-faq-27"],
    nextAction: "SEARCH_COACH",
  },
  {
    id: "SEARCH_EXPRESSION",
    label: "검색식 만들기",
    userGoals: ["검색식을 만들고 싶어", "AND OR NOT을 쓰고 싶어", "정확한 문구를 찾고 싶어"],
    description: "AND, OR, NOT과 정확 문구 조건을 검색식으로 구조화합니다.",
    sourceIds: ["official-faq-17", "official-faq-13", "official-faq-12"],
    nextAction: "SEARCH_COACH",
  },
  {
    id: "SEARCH_REFINEMENT",
    label: "검색 결과 좁히기",
    userGoals: ["검색 결과가 너무 많아", "원하는 기사만 보고 싶어", "검색 결과를 더 정확하게 하고 싶어"],
    description: "기간, 언론사, 주제어와 제외 키워드를 조정해 결과를 좁힙니다.",
    sourceIds: ["official-faq-22", "official-faq-25", "official-faq-27"],
    nextAction: "SEARCH_DIAGNOSIS",
  },
  {
    id: "DOWNLOAD",
    label: "분석 데이터 다운로드",
    userGoals: ["검색 결과를 내려받고 싶어", "엑셀로 저장하고 싶어", "다운로드하고 싶어"],
    description: "검색·분석 결과의 다운로드 가능 범위와 이용 방법을 공식 문서 기준으로 확인합니다.",
    sourceIds: ["official-faq-18", "bigkinds-intro-overview"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "MORPHEME_ANALYSIS",
    label: "형태소·개체명 분석",
    userGoals: ["형태소 분석을 하고 싶어", "개체명을 보고 싶어", "단어 분석을 하고 싶어"],
    description: "뉴스 분석 과정에 포함된 형태소·개체명 분석의 공식 안내를 확인합니다.",
    sourceIds: ["bigkinds-intro-pipeline", "official-faq-11"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "VISUALIZATION",
    label: "뉴스 분석·시각화",
    userGoals: ["뉴스를 분석하고 싶어", "분석 결과를 보고 싶어", "시각화하고 싶어"],
    description: "빅카인즈의 뉴스 분석과 결과 시각화 기능에 대한 공식 안내를 확인합니다.",
    sourceIds: ["bigkinds-intro-overview", "bigkinds-intro-pipeline"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "NETWORK_ANALYSIS",
    label: "관계도 분석",
    userGoals: ["기업들이 같이 언급되는 관계를 보고 싶어", "인물·기관 관계를 보고 싶어", "네트워크 분석을 하고 싶어"],
    description: "기사에 함께 등장하는 인물·기관·기업의 연결 관계를 확인하려는 목적에 적합합니다.",
    sourceIds: ["bigkinds-intro-pipeline"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "RELATED_WORDS",
    label: "연관어 분석",
    userGoals: ["관련 키워드를 보고 싶어", "연관어를 찾고 싶어", "함께 나오는 단어를 보고 싶어"],
    description: "검색 주제와 함께 나타나는 주요 키워드와 연관어를 확인합니다.",
    sourceIds: ["bigkinds-intro-pipeline", "bigkinds-intro-structured-data"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "OLD_NEWSPAPER",
    label: "고신문 아카이브",
    userGoals: ["옛날 신문을 보고 싶어", "고신문을 찾고 싶어", "과거 신문을 검색하고 싶어"],
    description: "고신문·과거 신문 자료를 확인하려는 목적에 적합합니다.",
    sourceIds: ["bigkinds-intro-overview"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "MEDIA_COVERAGE",
    label: "언론사별 비교",
    userGoals: ["언론사별 보도를 비교하고 싶어", "매체별 검색 결과를 비교하고 싶어"],
    description: "언론사 조건을 나누어 뉴스 보도와 검색 결과를 비교합니다.",
    sourceIds: ["bigkinds-intro-overview"],
    nextAction: "SEARCH_COACH",
  },
  {
    id: "FAQ_QNA",
    label: "공식 FAQ·Q&A",
    userGoals: ["공식 답변을 찾고 싶어", "Q&A를 찾아줘", "FAQ를 보고 싶어"],
    description: "저장된 공식 FAQ·Q&A에서 질문과 가까운 답변을 찾습니다.",
    sourceIds: ["official-faq-17"],
    nextAction: "FAQ_SEARCH",
  },
];

export function getCapabilitiesById(ids: string[] = []) {
  const allowed = new Set(ids);
  return capabilities.filter((capability) => allowed.has(capability.id));
}

const networkSignals = /관계도|네트워크|(?:같이|함께|서로|공동).{0,16}(?:언급|등장|나오|연결)|(?:언급|등장|나오).{0,16}(?:같이|함께|서로)|(?:인물|기업|기관).{0,8}(?:관계|관계도|연결)|관계가\s*(?:궁금|알고)|누구와\s*(?:같이|함께)\s*(?:등장|나오)/i;
const relatedWordsSignals = /(?:연관어|연관\s*(?:된\s*)?키워드|관련\s*키워드|(?:많이|자주)\s*(?:나온|언급된)\s*단어|함께\s*나오는\s*단어)/i;

export function recommendCapabilities(question: string): Capability[] {
  const ids: string[] = [];
  if (networkSignals.test(question)) ids.push("NETWORK_ANALYSIS");
  if (relatedWordsSignals.test(question)) ids.push("RELATED_WORDS");
  return getCapabilitiesById(ids);
}

export function capabilitySourcesExist(capability: Capability, documents: SearchableDocument[]) {
  const available = new Set(documents.map((document) => document.id));
  return capability.sourceIds.some((sourceId) => available.has(sourceId));
}
