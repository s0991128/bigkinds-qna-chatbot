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
    sourceIds: ["manual-search-basic", "bigkinds-intro-overview", "official-faq-25", "official-faq-27"],
    nextAction: "SEARCH_COACH",
  },
  {
    id: "SEARCH_EXPRESSION",
    label: "검색식 만들기",
    userGoals: ["검색식을 만들고 싶어", "AND OR NOT을 쓰고 싶어", "정확한 문구를 찾고 싶어"],
    description: "AND, OR, NOT과 정확 문구 조건을 검색식으로 구조화합니다.",
    sourceIds: ["manual-search-operators", "manual-quotation-search", "official-faq-17", "official-faq-13", "official-faq-12"],
    nextAction: "SEARCH_COACH",
  },
  {
    id: "SEARCH_REFINEMENT",
    label: "검색 결과 좁히기",
    userGoals: ["검색 결과가 너무 많아", "원하는 기사만 보고 싶어", "검색 결과를 더 정확하게 하고 싶어"],
    description: "기간, 언론사, 주제어와 제외 키워드를 조정해 결과를 좁힙니다.",
    sourceIds: ["manual-search-basic", "official-faq-22", "official-faq-25", "official-faq-27"],
    nextAction: "SEARCH_DIAGNOSIS",
  },
  {
    id: "DOWNLOAD",
    label: "분석 데이터 다운로드",
    userGoals: ["검색 결과를 내려받고 싶어", "엑셀로 저장하고 싶어", "다운로드하고 싶어"],
    description: "검색·분석 결과의 다운로드 가능 범위와 이용 방법을 공식 문서 기준으로 확인합니다.",
    sourceIds: ["manual-download", "bigkinds-canonical-download", "official-faq-18", "bigkinds-intro-overview"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "MORPHEME_ANALYSIS",
    label: "형태소·개체명 분석",
    userGoals: ["형태소 분석을 하고 싶어", "개체명을 보고 싶어", "단어 분석을 하고 싶어"],
    description: "뉴스 분석 과정에 포함된 형태소·개체명 분석의 공식 안내를 확인합니다.",
    sourceIds: ["manual-morpheme-ner", "bigkinds-intro-pipeline", "official-faq-11"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "VISUALIZATION",
    label: "뉴스 분석·시각화",
    userGoals: ["뉴스를 분석하고 싶어", "분석 결과를 보고 싶어", "시각화하고 싶어"],
    description: "빅카인즈의 뉴스 분석과 결과 시각화 기능에 대한 공식 안내를 확인합니다.",
    sourceIds: ["manual-data-visualization", "bigkinds-intro-overview", "bigkinds-intro-pipeline"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "NETWORK_ANALYSIS",
    label: "관계도 분석",
    userGoals: ["기업들이 같이 언급되는 관계를 보고 싶어", "인물·기관 관계를 보고 싶어", "네트워크 분석을 하고 싶어"],
    description: "기사에 함께 등장하는 인물·기관·기업의 연결 관계를 확인하려는 목적에 적합합니다.",
    sourceIds: ["manual-network-analysis", "bigkinds-intro-pipeline"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "RELATED_WORDS",
    label: "연관어 분석",
    userGoals: ["관련 키워드를 보고 싶어", "연관어를 찾고 싶어", "함께 나오는 단어를 보고 싶어"],
    description: "검색 주제와 함께 나타나는 주요 키워드와 연관어를 확인합니다.",
    sourceIds: ["manual-related-words", "bigkinds-intro-pipeline", "bigkinds-intro-structured-data"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "OLD_NEWSPAPER",
    label: "고신문 아카이브",
    userGoals: ["옛날 신문을 보고 싶어", "고신문을 찾고 싶어", "과거 신문을 검색하고 싶어"],
    description: "고신문·과거 신문 자료를 확인하려는 목적에 적합합니다.",
    sourceIds: ["manual-old-newspaper", "bigkinds-canonical-coverage", "bigkinds-intro-overview"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "KEYWORD_TREND",
    label: "키워드 트렌드",
    userGoals: ["기사량 추이를 보고 싶어", "보도량 추이를 보고 싶어", "월별 기사량을 보고 싶어", "시간에 따른 뉴스 변화를 보고 싶어"],
    description: "시간에 따른 기사량과 검색어 흐름을 확인합니다.",
    sourceIds: ["manual-keyword-trend"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "INFORMATION_EXTRACTION",
    label: "정보추출",
    userGoals: ["기사에서 특정 정보만 뽑고 싶어", "회사명과 매출액을 추출하고 싶어"],
    description: "기사 문장에서 필요한 정보와 값을 추출합니다.",
    sourceIds: ["manual-information-extraction"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "MORPHEME_NER",
    label: "형태소·개체명 분석",
    userGoals: ["사람 이름과 기관명을 뽑고 싶어", "개체명을 분석하고 싶어"],
    description: "텍스트의 형태소와 사람·기관·장소 개체명을 분석합니다.",
    sourceIds: ["manual-morpheme-ner"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "DATA_VISUALIZATION",
    label: "데이터 시각화",
    userGoals: ["내 엑셀 데이터를 그래프로 만들고 싶어", "단어 빈도를 그래프로 보고 싶어"],
    description: "직접 가진 데이터나 분석 결과를 그래프로 표현합니다.",
    sourceIds: ["manual-data-visualization"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "VISUALIZATION_REPORT",
    label: "시각화보고서",
    userGoals: ["분석 결과를 보고서로 저장하고 싶어", "PDF 보고서를 만들고 싶어"],
    description: "분석 결과를 시각화보고서로 구성하고 저장합니다.",
    sourceIds: ["manual-report-create", "manual-report-list"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "QUOTATION_SEARCH",
    label: "인용문 검색",
    userGoals: ["정확한 문장을 찾고 싶어", "따옴표로 문구를 검색하고 싶어"],
    description: "정확히 일치하는 인용문과 문구를 검색합니다.",
    sourceIds: ["manual-quotation-search"],
    nextAction: "SEARCH_COACH",
  },
  {
    id: "SAVED_SEARCH",
    label: "검색식 저장",
    userGoals: ["검색식을 저장하고 싶어", "검색 조건을 다음에도 쓰고 싶어"],
    description: "작성한 검색 조건을 저장하고 다시 사용하는 방법을 안내합니다.",
    sourceIds: ["manual-search-operators", "manual-my-news"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "LATEST_NEWS",
    label: "최신뉴스",
    userGoals: ["최신뉴스를 보고 싶어", "새로 들어온 뉴스를 보고 싶어"],
    description: "최신뉴스와 언론사별 뉴스 보기 경로를 안내합니다.",
    sourceIds: ["manual-latest-news"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "WEEKLY_ISSUE",
    label: "주간이슈",
    userGoals: ["주간이슈를 보고 싶어", "오늘의 이슈를 모아 보고 싶어"],
    description: "날짜별 이슈와 주간이슈를 확인하는 경로를 안내합니다.",
    sourceIds: ["manual-weekly-issue"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "REGIONAL_ISSUE",
    label: "지역이슈분석",
    userGoals: ["지역별 현안을 보고 싶어", "지역 뉴스와 지자체 자료를 같이 분석하고 싶어"],
    description: "지역 관련 뉴스와 공공 자료를 바탕으로 지역 이슈를 확인합니다.",
    sourceIds: ["manual-regional-issue"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "ISSUE_REPORT",
    label: "이슈 리포트",
    userGoals: ["이슈 리포트를 보고 싶어", "뉴스 이슈 보고서를 찾고 싶어"],
    description: "빅카인즈 활용 메뉴의 이슈 리포트 경로를 안내합니다.",
    sourceIds: ["manual-issue-report"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "LEGISLATOR_NEWS",
    label: "국회의원 뉴스 분석",
    userGoals: ["국회의원 뉴스를 분석하고 싶어", "의원 관련 보도를 보고 싶어"],
    description: "국회의원 관련 뉴스 분석 기능의 이용 경로를 안내합니다.",
    sourceIds: ["manual-legislator-news"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "MY_NEWS",
    label: "나의 뉴스",
    userGoals: ["저장한 뉴스를 보고 싶어", "스크랩한 뉴스는 어디 있어?"],
    description: "저장·스크랩한 뉴스를 내 정보에서 관리합니다.",
    sourceIds: ["manual-my-news"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "SCRAP",
    label: "뉴스 스크랩",
    userGoals: ["뉴스를 스크랩하고 싶어", "기사를 저장하고 싶어"],
    description: "관심 뉴스를 저장하고 다시 확인하는 경로를 안내합니다.",
    sourceIds: ["manual-my-news"],
    nextAction: "FAQ_SEARCH",
  },
  {
    id: "MY_ANALYSIS",
    label: "나의 분석 자료",
    userGoals: ["저장한 분석을 보고 싶어", "내 분석 자료는 어디 있어?"],
    description: "저장한 분석 결과를 내 정보에서 관리합니다.",
    sourceIds: ["manual-my-analysis"],
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
const capabilitySignals: Array<[string, RegExp]> = [
  ["KEYWORD_TREND", /키워드\s*트렌드|기사량|보도량|(?:기사|보도)\s*량.{0,8}(?:추이|변화)|(?:추이|변화).{0,8}(?:기사|보도)\s*량|(?:시간별|기간별|월별)\s*(?:기사|보도)\s*량|기간별\s*(?:변화|추이)|시간에\s*따른\s*(?:기사|뉴스)/i],
  ["INFORMATION_EXTRACTION", /정보\s*추출|회사명.{0,12}(?:매출|추출)|매출액.{0,12}(?:뽑|추출)|특정\s*(?:정보|값).{0,10}(?:뽑|추출)/i],
  ["MORPHEME_NER", /형태소|개체명|사람\s*이름.{0,12}(?:기관|추출|뽑)|기관명.{0,12}(?:추출|뽑)/i],
  ["DATA_VISUALIZATION", /내\s*(?:엑셀|데이터).{0,16}(?:그래프|차트|시각화)|단어\s*빈도.{0,12}(?:그래프|차트)/i],
  ["VISUALIZATION_REPORT", /(?:분석|시각화).{0,12}(?:보고서|pdf)|보고서.{0,12}(?:만들|저장|생성)/i],
  ["QUOTATION_SEARCH", /인용문|정확(?:히|한)\s*(?:문장|문구)|따옴표\s*(?:검색|사용)/i],
  ["SAVED_SEARCH", /검색식.{0,12}(?:저장|다시\s*사용)|검색\s*조건.{0,12}(?:저장|보관)/i],
  ["LATEST_NEWS", /최신뉴스|최신\s*뉴스|새로\s*(?:들어온|수집된)\s*뉴스/i],
  ["WEEKLY_ISSUE", /주간이슈|주간\s*이슈|오늘의\s*이슈/i],
  ["OLD_NEWSPAPER", /고신문|옛날\s*신문|과거\s*신문|\d{4}년대\s*신문/i],
  ["REGIONAL_ISSUE", /지역이슈|지역\s*현안|지역별.{0,20}(?:뉴스|지자체).{0,20}(?:분석|보고)|지자체\s*자료.{0,12}(?:분석|같이)/i],
  ["ISSUE_REPORT", /이슈\s*리포트|뉴스\s*이슈\s*보고서/i],
  ["LEGISLATOR_NEWS", /국회의원|의원.{0,12}(?:뉴스|보도).{0,12}(?:분석|보고)/i],
  ["MY_NEWS", /나의\s*뉴스|저장한\s*뉴스/i],
  ["SCRAP", /스크랩|관심\s*뉴스/i],
  ["MY_ANALYSIS", /나의\s*분석|저장한\s*분석|내\s*분석\s*자료/i],
];

export function recommendCapabilities(question: string): Capability[] {
  const ids: string[] = [];
  if (networkSignals.test(question)) ids.push("NETWORK_ANALYSIS");
  if (relatedWordsSignals.test(question)) ids.push("RELATED_WORDS");
  capabilitySignals.forEach(([id, signal]) => {
    if (signal.test(question)) ids.push(id);
  });
  return getCapabilitiesById(ids);
}

export function capabilitySourcesExist(capability: Capability, documents: SearchableDocument[]) {
  const available = new Set(documents.map((document) => document.id));
  return capability.sourceIds.some((sourceId) => available.has(sourceId));
}
