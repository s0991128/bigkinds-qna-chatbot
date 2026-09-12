/* eslint-disable no-useless-escape */
import { buildSearchQuery, describeSearchQuery, SearchQueryInput } from "./search-query-builder";
import type { SearchTurnResult } from "./search-context";
import { normalizeSearchInput, normalizeSearchTerm } from "./search-term-normalizer";

export type SearchExpressionIntent = {
  query: string;
  description: string;
  input: SearchQueryInput;
};

const requestPattern = /(검색식|검색어).*(만들|작성|생성|짜|구성)|(?:만들|작성|생성|짜|구성).*(검색식|검색어)/i;
const stopWords = new Set([
  "검색", "검색식", "검색어", "키워드", "단어", "조건", "기사", "뉴스", "모두", "만들", "만들어", "만들어줘", "작성", "작성해", "작성해줘",
  "생성", "생성해", "생성해줘", "구성", "구성해", "구성해줘", "짜", "짜줘", "포함", "포함한", "포함하는", "동시에", "함께",
  "알려", "알려줘", "해주세요", "해줘", "주세요", "원해", "싶어", "싶습니다", "을", "를", "이", "가", "은", "는", "및", "과", "와",
  "제외", "빼고", "말고", "제외한", "제외하는", "not",
]);

function normalizeTerm(term: string) {
  return term.replace(/^[\s\(\[“”'\"]+|[\s\)\]“”'\"]+$/g, "").trim();
}

/** 검색 플랫폼을 뜻하는 문맥만 제거하고, 검색 주제로 쓰인 BIGKinds는 보존합니다. */
export function stripSearchPlatformContext(value: string) {
  return value
    .replace(/(?:빅\s*카인즈|big\s*kinds)\s*(?:사이트\s*)?(?:에서|내에서)/gi, " ")
    .replace(/(?:빅\s*카인즈|big\s*kinds)\s*(?:을|를)?\s*통해(?:서)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuotedTerms(question: string) {
  return [...question.matchAll(/[\"“]([^\"”]+)[\"”]/g)].map((match) => normalizeTerm(match[1] || "")).filter(Boolean);
}

function extractCandidate(question: string) {
  const withoutQuotes = question.replace(/[\"“][^\"”]+[\"”]/g, " ");
  const marker = withoutQuotes.match(/(.+?)(?:을|를)?\s*(?:포함한|포함하는|포함하고|동시에|함께)\s*(?:검색식|검색어)/i);
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
  const searchQuestion = stripSearchPlatformContext(question);
  const exact = extractQuotedTerms(searchQuestion);
  const excludeMatch = searchQuestion.match(/([가-힣A-Za-z0-9]+(?:\s*(?:과|와|및|또는)\s*[가-힣A-Za-z0-9]+)?)\s*(?:은|는|을|를)?\s*(?:제외|빼고|말고|not)(?:하는|한)?/i);
  const excludeClause = excludeMatch?.[1]?.trim() || "";
  const includeClause = excludeMatch ? searchQuestion.replace(excludeMatch[0], " ") : searchQuestion;
  const terms = extractTerms(extractCandidate(includeClause));
  const exclude = extractTerms(excludeClause.replace(/^(?:을|를)?\s*/i, ""));
  if (!terms.length && !exact.length) return null;
  const any = /(?:또는|or|중\s*하나)/i.test(searchQuestion) ? terms : [];
  const all = any.length ? [] : terms;
  const input = normalizeSearchInput({ any, all, exact, exclude });
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

export function isQnaRankingQuestion(question: string) {
  return /(?:q\s*&?\s*a|qna|질문답변|공식\s*q\s*&?\s*a)/i.test(question)
    && /top\s*\d+|상위\s*\d+|가장\s*많이|인기|많은\s*(?:질문|qna)/i.test(question);
}

export function isSearchUsageQuestion(question: string) {
  const hasSearchTopic = /뉴스\s*(?:검색|검색·분석)|검색·분석|뉴스검색/i.test(question);
  const asksHow = /이용|방법|시작|어떻게|알려|순서|사용/i.test(question);
  return hasSearchTopic && asksHow;
}

const simpleSearchStopWords = new Set([
  "기사", "기사만", "뉴스", "뉴스만", "보도", "관련", "관련된", "어떤", "서로", "내용", "주제", "주제의",
  "찾고", "찾아", "찾아줘", "찾고싶어", "찾고싶어요", "싶어요", "싶어", "싶습니다", "보고", "보고싶어",
  "검색", "검색하고", "검색해", "검색해줘", "검색해주세요", "검색해요", "해주세요", "해줘", "좀", "원해", "원해요", "들어가고", "들어가는",
  "들어간", "포함", "포함한", "포함하는", "포함된", "포함하고", "있는", "있고", "들어", "을", "를", "이", "가", "은", "는", "과", "와", "및", "이나", "나",
  "중", "하나", "하나가", "하나만", "둘", "하나면", "들어가면", "관련해", "넣어", "넣어줘", "넣어주세요", "추가", "추가해", "추가해줘", "추가해주세요", "꼭", "들어가야", "해", "돼", "되", "정확히",
  "포함해", "포함해줘", "포함해주세요", "같이", "함께", "빼줘", "제외해줘", "제외해", "없애줘", "언급되는지", "보고싶어",
  "검색결과", "검색결", "결과", "너무", "많이", "많아", "나오는데", "오는데", "어떻게", "줄여", "줄이고", "좁혀", "넓혀",
  "표현", "표현이", "이라는", "이라", "그거", "그것", "저거", "빼고", "말고", "찾아보고",
  "관한", "관하여", "관련한", "관련하여", "대한", "대해", "대하여", "대해서", "살펴보고", "살펴보고싶어", "살펴보고싶어요",
  "이번에는", "이번엔", "이번", "새로", "아니", "그럼", "그러면", "그런데", "그리고", "여기에", "여기서", "아까", "방금", "대신",
]);

const discourseMarkerPattern = /^(?:이번에는|이번엔|이번|새로|아니|그럼|그러면|그런데|그리고|여기에|여기서|그거|아까|방금|대신)\s*/i;

function simpleSearchTerms(value: string) {
  return value
    .split(/\s*(?:또는|or|이나|나|과|와|및|그리고|,|\/|\+)\s*/i)
    .flatMap((part) => part.split(/\s+/))
    .map((term) => term.replace(/^[\"“'([\s?!？！]+|[\"”'、,.)\]?!？！]+$/g, ""))
    .flatMap((term) => normalizeSearchTerm(term))
    .filter((term) => term.length >= 2 && !simpleSearchStopWords.has(term.toLowerCase()))
    .filter((term, index, terms) => terms.indexOf(term) === index)
    .slice(0, 4);
}

export function isSearchGoalQuestion(question: string): boolean {
  if (isOpenApiQuestion(question) || isArticleContentQuestion(question)) return false;
  if (/뉴스가\s*(?:뭐야|무엇|뭔가)|기사가\s*(?:뭐야|무엇|뭔가)/i.test(question)) return false;
  if (isServiceOverviewQuestion(question) || isServiceFactQuestion(question) || isServiceGuideQuestion(question)) return false;
  const hasNewsObject = /(?:기사|뉴스|보도)\b/i.test(question);
  const hasExplicitSearchGoal = /(?:기사|뉴스|보도).{0,28}(?:찾|검색|보고\s*싶)|(?:찾|검색|보고\s*싶).{0,28}(?:기사|뉴스|보도)/i.test(question);
  const hasNewMarker = /(?:이번에는|이번엔|이번|새로|다른\s*주제|이번\s*검색|새\s*검색)/i.test(question);
  const hasConditionGoal = /(?:둘\s*중\s*하나|하나만\s*(?:들어가|포함)|중\s*하나)/i.test(question);
  return (hasExplicitSearchGoal || (hasNewMarker && hasNewsObject) || hasConditionGoal) && simpleSearchTerms(question).length > 0;
}

export function extractSimpleSearchGoal(question: string): SearchQueryInput | null {
  if (!isSearchGoalQuestion(question)) return null;
  const searchQuestion = stripSearchPlatformContext(question);
  const exact = extractQuotedTerms(searchQuestion);
  const withoutExact = searchQuestion.replace(/["“][^"”]+["”]/g, " ").replace(discourseMarkerPattern, "");
  const excludeMatch = withoutExact.match(/([가-힣A-Za-z0-9]+(?:\s*(?:과|와|및|또는)\s*[가-힣A-Za-z0-9]+)?)\s*(?:은|는|을|를)?\s*(?:제외|제외해|제외해주세요|빼고|빼줘|빼주세요|말고)/i);
  const exclude = excludeMatch ? simpleSearchTerms(excludeMatch[1] || "") : [];
  const includeClause = excludeMatch ? withoutExact.replace(excludeMatch[0], " ") : withoutExact;
  const terms = simpleSearchTerms(includeClause);
  if ((!terms.length && !exact.length) || terms.length > 6) return null;
  const any = /(?:또는|or|이나|나)/i.test(includeClause) ? terms : [];
  const all = any.length ? [] : terms;
  return normalizeSearchInput({ all, any, exact, exclude });
}

export function isSearchInputUpdateQuestion(question: string): boolean {
  const referenceCue = /여기에|여기서|이거|이\s*검색식|그거|아까|방금|(?:도|더)\s*(?:추가|넣|포함)|빼줘|빼고|바꿔줘|대신|^\s*아니/i;
  const updateCommand = /(?:\b(?:도|더)\b\s*)?(?:꼭\s*)?(?:포함해(?:줘|주세요)?|넣어(?:줘|주세요)?|추가해(?:줘|주세요)?|빼줘|빼고|빼|제외해(?:줘|주세요)?|제외|없애줘|말고)|정확히\s*["“']|["“'][^"”']+["”']\s*(?:도|더)?\s*(?:넣|추가|포함)|둘\s*중\s*하나|하나면|꼭\s*(?:들어|넣|포함)|같이\s*(?:넣|포함)|조건.*(?:빼|없애)/i;
  return referenceCue.test(question) || updateCommand.test(question);
}

export function isServiceOverviewQuestion(question: string) {
  return /빅카인즈.{0,18}(?:소개|뭐야|무엇|어떤\s*서비스|뭘?\s*할\s*수\s*있|무슨\s*기능|기능이\s*있)|(?:빅카인즈|서비스).{0,18}(?:알려줘|소개해)/i.test(question);
}

export function isFullTextDownloadQuestion(question: string) {
  const hasFullTextCue = /(?:기사|뉴스).{0,16}(?:전체|전문|본문)|(?:전체|전문|본문).{0,16}(?:기사|뉴스)|(?:원문|본문)\s*(?:전체|전문)/i.test(question);
  const hasDownloadCue = /다운로드|내려받|엑셀|excel|csv|파일|받(?:을|고|아|을\s*수)|저장/i.test(question);
  return hasFullTextCue && hasDownloadCue;
}

export function isServiceGuideQuestion(question: string) {
  if (/(?:관계도.*연관어|연관어.*관계도|관계도.*차이|연관어.*차이)/i.test(question)) return false;
  if (/(?:내\s*)?엑셀\s*데이터.{0,16}(?:그래프|차트|시각화)|(?:그래프|차트|시각화).{0,16}(?:내\s*)?엑셀\s*데이터/i.test(question)) return false;
  if (isFullTextDownloadQuestion(question)) return false;
  const download = /다운로드|내려받|엑셀|excel|csv|파일|저장|받을\s*수/i.test(question);
  const usage = /검색\s*기간|언론사.{0,8}(?:선택|고르)|형태소\s*분석|개체명\s*분석|관계도\s*분석|연관어\s*분석|어떻게\s*(?:써|사용|이용|해)/i.test(question);
  const audioUsage = /(?:뉴스\s*듣기|오디오|음성|낭독).{0,16}(?:어디|이용|사용|방법)|(?:어디|이용|사용|방법).{0,16}(?:뉴스\s*듣기|오디오|음성|낭독)/i.test(question);
  const searchOperatorUsage = /(?:검색식|검색\s*문법|검색\s*연산자|검색어\s*조합|\bAND\b|\bOR\b|\bNOT\b)/i.test(question)
    && /사용법|문법|연산자|조합\s*방법|어떻게\s*(?:써|사용|조합)|알려/i.test(question)
    && !requestPattern.test(question);
  const manualFeature = /키워드\s*트렌드|정보\s*추출|시각화|보고서|지역이슈|최신뉴스|주간\s*이슈|고신문|인용문|검색식.{0,12}저장|스크랩|나의\s*(?:뉴스|분석)/i.test(question);
  const asksForLocationOrSteps = /(?:어디서|어디에|어디|방법|순서|사용|이용|눌러|할\s*수)/i.test(question);
  return download || usage || audioUsage || searchOperatorUsage || (manualFeature && asksForLocationOrSteps);
}

export function isServiceFactQuestion(question: string) {
  const scopeOrCount = /몇\s*년도부터|언제부터|몇\s*건|수록|보유|범위|언론사|1990년대|이전\s*뉴스|고신문|지원하나요|가능한가요|할\s*수\s*있나요|되나요/i;
  return /빅카인즈|뉴스|기사|검색|언론사|신문|고신문/.test(question) && scopeOrCount.test(question);
}

export function isFeatureRecommendationQuestion(question: string): boolean {
const relationshipSignal = /(?:같이|함께|서로|공동).{0,16}(?:언급|등장|나오|연결)|(?:언급|등장|나오).{0,16}(?:같이|함께|서로)|(?:인물|기업|기관).{0,8}(?:관계|관계도|연결)|관계가\s*(?:궁금|알고)|누구와\s*(?:같이|함께)\s*(?:등장|나오)/i;
const relatedWordsSignal = /(?:연관어|연관\s*(?:된\s*)?키워드|관련\s*키워드|함께\s*나오는\s*단어|(?:많이|자주)\s*(?:나온|언급된)\s*단어)/i;
  const manualCapabilitySignal = /키워드\s*트렌드|기사량|보도량|(?:기사|보도)\s*량.{0,8}(?:추이|변화)|(?:추이|변화).{0,8}(?:기사|보도)\s*량|(?:시간별|기간별|월별)\s*(?:기사|보도)\s*량|월별.{0,12}(?:변화|추이)|정보\s*추출|회사명.{0,12}(?:매출|추출|뽑)|매출액.{0,12}(?:추출|뽑)|사람\s*이름.{0,12}(?:기관|추출|뽑)|기관명.{0,12}(?:추출|뽑)|형태소|개체명|내\s*(?:엑셀|데이터).{0,16}(?:그래프|차트|시각화)|보고서.{0,12}(?:만들|저장|생성)|지역이슈|지역별.{0,20}(?:뉴스|지자체).{0,20}(?:분석|보고)|지자체\s*자료.{0,12}(?:분석|같이)|최신뉴스|주간\s*이슈|고신문|\d{4}년대\s*신문|인용문|검색식.{0,12}저장|스크랩|나의\s*(?:뉴스|분석)/i;
  const analysisSignal = /(?:분석|시각화|많이\s*(?:나오|언급)|자주\s*(?:나오|언급)|보고\s*싶)/i;
  return (relationshipSignal.test(question) || relatedWordsSignal.test(question) || manualCapabilitySignal.test(question))
    && (analysisSignal.test(question) || manualCapabilitySignal.test(question));
}

export function isSearchExpressionDiagnosisQuestion(question: string): boolean {
  const hasOperator = /\b(?:AND|OR|NOT)\b/i.test(question);
  const hasGroupingOrPhrase = /[()"“”']/.test(question);
  const hasCompositeExpression = /\S+\s+(?:AND|OR|NOT)\s+\S+/i.test(question);
  const hasSyntaxSignal = hasOperator || hasGroupingOrPhrase || hasCompositeExpression;
  const asksAboutTheExpression = /맞아|맞나요|맞을까|이렇게\s*(?:검색|쓰|하면)|의도(?:대로|에)|원하는\s*대로|괜찮|문제\s*(?:있|없)|고쳐줘|수정해줘|검색\s*잘\s*돼|어떻게\s*해석|되는지/i.test(question);
  return hasSyntaxSignal && asksAboutTheExpression && !isSearchExpressionBuildQuestion(question);
}

export function isSearchExpressionBuildQuestion(question: string): boolean {
  return requestPattern.test(question) && !/맞아|맞나요|이렇게\s*(?:검색|쓰|하면)|의도대로|원하는\s*대로|문제\s*있|고쳐|수정해/i.test(question);
}

export function isSearchDiagnosisQuestion(question: string): boolean {
  if (isOpenApiQuestion(question) || /다운로드|내려받|파일|엑셀/i.test(question)) return false;
  const hasResultContext = /검색\s*결과|검색결과|결과가|결과를|검색\s*범위/i.test(question);
  const hasTooManySignal = /너무\s*많|많이\s*나오|많아서|많은데|너무\s*적|0\s*건|안\s*나와|없어|이상해|원하는\s*(?:기사|결과).{0,8}안\s*나|줄여|줄이고|좁히|좁혀|넓히|넓혀/i.test(question);
  return (hasResultContext && hasTooManySignal) || /너무\s*많이\s*나오|결과를\s*(?:줄|좁|넓)/i.test(question);
}

function hasSelfContainedSearchGoal(question: string) {
  const hasNewsObject = /기사|뉴스|보도/i.test(question);
  const hasSearchVerb = /찾|검색|보고\s*싶|찾고\s*싶|찾아|검색하고|검색해/i.test(question);
  const hasNewMarker = /이번(?:에는|엔)?|새로|다른\s*주제|이번\s*검색|새\s*검색/i.test(question);
  const hasConditionGoal = /(?:둘\s*중\s*하나|하나만\s*(?:들어가|포함)|중\s*하나)/i.test(question);
  return simpleSearchTerms(question).length > 0 && ((hasNewsObject && hasSearchVerb) || hasNewMarker || hasConditionGoal);
}

function isAmbiguousSearchFollowup(question: string) {
  return question.trim().length <= 30
    && /(?:도|은|는)\s*(?:보고|넣고|포함하고)|보고\s*싶은데|어떤\s*기업/i.test(question)
    && !isSearchInputUpdateQuestion(question);
}

export function extractSearchPatch(question: string): SearchTurnResult["patch"] | null {
  const exactMatch = question.match(/(?:정확히|정확한)\s*["“']([^"”']+)["”']/i);
  if (exactMatch?.[1]) return { add: { exact: [exactMatch[1]] } };

  const removalOnly = /(?:조건|검색어|검색식).*(?:그냥\s*)?(?:빼|없애|삭제)/i.test(question);
  const excludeMatch = question.match(/(.+?)(?:은|는|을|를|도)?\s*(?:빼줘|빼고|빼|제외해|제외|말고)/i);
  if (excludeMatch?.[1]) {
    const terms = simpleSearchTerms(excludeMatch[1]);
    if (!terms.length) return null;
    if (removalOnly) return { remove: { all: terms, any: terms, exact: terms, exclude: terms } };
    const remainder = question.slice((excludeMatch.index || 0) + excludeMatch[0].length)
      .replace(/^\s*(?:그리고|대신|,)?\s*/i, "");
    const addTerms = simpleSearchTerms(remainder);
    return {
      remove: { all: terms, any: terms, exact: terms },
      add: { ...(addTerms.length ? { all: addTerms } : {}), exclude: terms },
    };
  }

  const withoutExact = question.replace(/["“][^"”]+["”]/g, " ").replace(discourseMarkerPattern, "");
  const terms = simpleSearchTerms(withoutExact);
  if (!terms.length) return null;
  const exact = extractQuotedTerms(question);
  const any = /(?:또는|or|이나|나|둘\s*중\s*하나|하나면\s*돼)/i.test(withoutExact) ? terms : [];
  return exact.length
    ? { add: { exact } }
    : any.length ? { add: { any } } : { add: { all: terms } };
}

export function classifySearchTurn(question: string, hasPreviousSearch: boolean): SearchTurnResult {
  const clean = question.trim();
  if (isSearchDiagnosisQuestion(clean) || isSearchExpressionDiagnosisQuestion(clean)) return { mode: "DIAGNOSIS" };
  if (isFeatureRecommendationQuestion(clean)) return { mode: "NOT_SEARCH" };
  const searchInput = hasSelfContainedSearchGoal(clean) ? extractSimpleSearchGoal(clean) : null;
  if (searchInput) return { mode: "NEW", searchInput };
  if (hasPreviousSearch && isSearchInputUpdateQuestion(clean)) {
    const patch = extractSearchPatch(clean);
    return patch ? { mode: "UPDATE", patch } : { mode: "CLARIFY", needsClarification: true, clarifyingQuestion: "기존 검색식에 조건을 추가할까요, 아니면 새 검색을 시작할까요?" };
  }

  if (isAmbiguousSearchFollowup(clean)) {
    return { mode: "CLARIFY", needsClarification: true, clarifyingQuestion: "기존 검색식에 조건을 추가할까요, 아니면 관련된 새 검색을 시작할까요?" };
  }

  if (/(?:\bOR\b.*\bAND\b|\bAND\b.*\bOR\b)/i.test(clean)) return { mode: "DIAGNOSIS" };
  return { mode: "NOT_SEARCH" };
}

export function isSearchTooManyQuestion(question: string): boolean {
  return isSearchDiagnosisQuestion(question);
}

export function isClearlyOutOfScopeQuestion(question: string) {
  const hasBigKindsContext = /빅카인즈|검색|기사|뉴스|데이터|api|faq|qna|이용|저작권|다운로드|분석|회원|오류|문의|정책|요금|검색식|연산자|언론사|본문|수집|시각화|고신문|아카이브|스크랩|관계도|관계망|연관어|수록/i.test(question);
  return !hasBigKindsContext && !isSearchGoalQuestion(question);
}

export function isUnderspecifiedQuestion(question: string) {
  const normalized = question.toLowerCase().replace(/[\s?!.,。？！]+/g, " ").trim();
  return /^(?:예시(?:를)?\s*(?:들어|보여)?줘|예를\s*들어줘|너한테는\s*어떤\s*질문을\s*해야\s*해|무슨\s*질문을\s*해야\s*해|무엇을\s*물어봐야\s*해|더\s*알려줘|자세히\s*설명해줘|도와줘)$/.test(normalized);
}

export function isLikelyGeneralKnowledgeQuestion(question: string) {
  const serviceTerms = /빅카인즈|검색|기사|뉴스|데이터|api|faq|qna|이용|저작권|다운로드|분석|회원|오류|문의|정책|요금|검색식|연산자|형태소|바이그램|언론사|본문|수집|시각화|고신문|아카이브|옛신문|과거신문|스크랩|관계도|관계망|연관어|수록|수록기사|검색결과|개체명|분석결과/i;
  const generalTerms = /대한민국|한국|대통령|총리|날씨|환율|주가|누구|무엇|몇\s*(?:명|개|년|월|일)|언제|어디|왜/i;
  const searchGoal = /검색식|검색어|포함|제외|빼고|관련\s*(?:뉴스|기사)|뉴스.*(?:찾|보고|검색)|기사.*(?:찾|보고|검색)|찾고\s*싶|보고\s*싶/i;
  return generalTerms.test(question) && !serviceTerms.test(question) && !searchGoal.test(question);
}

export function isChatbotMetaQuestion(question: string) {
  return /너\s*(?:누구|뭐)|무슨\s*챗봇|어떤\s*질문을?\s*(?:할|물어)|누가\s*만들|무엇을\s*물어볼|무슨\s*도움/i.test(question);
}

export function isOpenApiQuestion(question: string) {
  return /open\s*api|openapi|\bapi\b|api\s*key|apikey|인증키|api\s*(?:호출|문의)|호출\s*오류/i.test(question);
}

export function isArticleContentQuestion(question: string) {
  const hasArticle = /기사|뉴스|원문|본문/i.test(question);
  const asksForContent = /요약|정리|전문을?|본문을?\s*(?:보여|읽|가져|전달)|내용을?\s*(?:알려|보여|정리)|분석해|핵심만/i.test(question);
  return hasArticle && asksForContent;
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
