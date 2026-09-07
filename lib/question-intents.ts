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
  return term.replace(/^[\s([“”'"]+|[\s)\]“”'"]+$/g, "").trim();
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
  const candidate = extractCandidate(question);
  const anyText = question.match(/(.+?)(?:이|가|을|를)?\s*포함(?:되고|된|하는|한)/i)?.[1] || candidate;
  const exclusionText = question.match(/포함(?:되고|된|하는|한).+?(?:그리고|,)?\s*([^.!?]+?)\s*(?:은|는|을|를)?\s*제외/i)?.[1]
    || question.match(/(?:제외|빼고|제외하고)\s*([^.!?]+)/i)?.[1]
    || "";
  const terms = extractTerms(anyText);
  const exclude = extractTerms(exclusionText);
  if (!terms.length && !exact.length) return null;

  const any = /(?:또는|or|중\s*하나)/i.test(question) ? terms : [];
  const all = any.length ? [] : terms;
  const input: SearchQueryInput = { any, all, exact, exclude };
  const query = buildSearchQuery(input);
  if (!query) return null;

  return { query, description: describeSearchQuery(input), input };
}

export function isDateQuestion(question: string) {
  if (/(검색|뉴스|기사|기간|조회)/i.test(question)) return false;
  return /(?:오늘|현재)\s*(?:은|이|의)?\s*(?:몇\s*월\s*며칠|몇\s*일|날짜|일자)|오늘\s*(?:며칠|몇\s*일)/i.test(question);
}

export function isChatbotMetaQuestion(question: string) {
  return /(?:너|당신|챗봇|도우미|ai|gpt)\s*(?:는|가|이)?\s*(?:뭐|무엇|야)|누가\s*(?:만들|개발)|어떤\s*(?:서비스|프로그램|봇)/i.test(question);
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
  const hasSearchTopic = /뉴스\s*(?:검색|검색·분석)|검색·분석|뉴스검색|검색어|검색식|오늘|날짜|기간/i.test(question);
  const asksHow = /이용|방법|시작|어떻게|알려|순서|사용/i.test(question);
  return hasSearchTopic && asksHow;
}

export function getDirectFaqId(question: string) {
  if (/회원가입/.test(question) && /메일|이메일/.test(question) && /안|못|받지|오지|누락/.test(question)) return "official-faq-33";
  if (/(?:90년대|1990년대|고신문|아카이브)/.test(question) && /어디까지|언제부터|검색|있어|가능/.test(question)) return "official-faq-19";
  if (/(?:과거|최신).*(?:기사|뉴스)|기사.*(?:과거|최신)/.test(question) && /검색|나눠|구분|분리/.test(question)) return "official-faq-29";
  if (/검색어/.test(question) && /괄호/.test(question)) return "official-faq-17";
  if (/문장/.test(question) && /검색/.test(question) && /그대로|포함|정확/.test(question)) return "official-faq-13";
  return null;
}

export function isDownloadProblemQuestion(question: string) {
  return /(?:다운로드|내려받|엑셀|파일).*(?:안|실패|오류|문제|열리|못)/i.test(question)
    || /(?:안|못).*(?:다운로드|내려받|엑셀|파일)/i.test(question);
}

export function isUnderspecifiedQuestion(question: string) {
  const normalized = question.toLowerCase().replace(/[\s?!.,。？！]+/g, " ").trim();
  return /^(?:예시(?:를)?\s*(?:들어|보여)?줘|예를\s*들어줘|너한테는\s*어떤\s*질문을\s*해야\s*해|무슨\s*질문을\s*해야\s*해|무엇을\s*물어봐야\s*해|무엇을\s*설정해야\s*하나요|관련\s*내용을\s*찾아줘|문서를\s*보여줘|더\s*알려줘|자세히\s*설명해줘|도와줘|회원\s*문제를?\s*도와줘|파일이?\s*문제(?:예요|에요)?|사용법을?\s*설명해줘|검색\s*결과가?\s*이상해)$/.test(normalized);
}

export function isLikelyGeneralKnowledgeQuestion(question: string) {
  const serviceTerms = /빅카인즈|검색|기사|뉴스|데이터|api|faq|qna|이용|저작권|다운로드|분석|회원|오류|문의|정책|요금|검색식|연산자|형태소|바이그램|언론사|본문|수집|시각화|브라우저|메뉴얼|매뉴얼|수록|스크랩|가입|로그인|조건|관계도|연관어|실시간|최신뉴스/i;
  const generalTerms = /대한민국|한국|대통령|총리|날씨|환율|주가|주식|투자|축구|스포츠|야구|골\s*(?:넣|기록)|손흥민|연예|레시피|김치찌개|맛집|여행|영화|로또|번역|다이어트|건강|게임|인구|선거|이번\s*주|고양이|수명/i;
  if (/최신\s*(?:연예|스포츠|야구)|연예\s*뉴스|스포츠\s*뉴스/i.test(question)) return true;
  return generalTerms.test(question) && !serviceTerms.test(question);
}

export function isEscalationQuestion(question: string) {
  return /계약|확정|상업적|재배포|대량\s*(?:저장|이용|호출)|(?:원문|검색\s*결과).*db.*저장|ai\s*(?:학습|서비스)|권한을?\s*(?:변경|늘)|(?:api\s*)?(?:호출\s*)?한도.*늘|늘.*(?:api\s*)?(?:호출\s*)?한도|담당자에게|정책\s*(?:변경|적용)|이용\s*범위.*(?:계약|상업)/i.test(question);
}

export function isBroadServiceQuestion(question: string) {
  const text = question.trim();
  if (!/(검색|뉴스|분석|다운로드|api|회원|파일|첨부|업로드|저작권|데이터|이용|문서|기능|q\s*&?\s*a|qna|질문답변)/i.test(text)) return false;
  if (/(요금|가격|비용|구매|계약|신청|인증키|오류|에러|403|401|본문|전문|검색식|연산자|인증메일|캐시|브라우저)/i.test(text)) return false;
  const terms = text.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((term) => term.length >= 2 && !/방법|어떻게|알려|궁금|해주세요|해줘|도와줘|문제|대해|관련|어떤|무엇|좀|정보|내용|알고|싶어/.test(term));
  return terms.length <= 2;
}

export function isApiCommercialQuestion(question: string) {
  return /open\s*api|openapi|\bapi\b/i.test(question) && /요금|가격|비용|구매|계약|신청|유료|결제|돈\s*(?:내|내야)/i.test(question);
}

export function isApiContactQuestion(question: string) {
  const hasApi = /open\s*api|openapi|\bapi\b/i.test(question);
  const asksContact = /문의|어디로/i.test(question);
  const asksForHandoff = /신청|연락|담당|연락처|신청서/i.test(question);
  const needsEscalation = /요금|가격|비용|구매|계약|유료|결제|돈\s*(?:내|내야)|오류|에러|실패|인증키|파라미터|호출/i.test(question);
  return hasApi && asksContact && !asksForHandoff && !needsEscalation;
}

export function isApiTechnicalQuestion(question: string) {
  return /open\s*api|openapi|\bapi\b/i.test(question) && /호출|파라미터|응답|제공|개발|python|연동|인증키/i.test(question);
}

export function isApiErrorQuestion(question: string) {
  return /open\s*api|openapi|\bapi\b/i.test(question) && /오류|에러|실패|403|401|작동|안\s*돼|안됨/i.test(question);
}

export function isArticleContentQuestion(question: string) {
  const hasArticle = /기사|뉴스|원문|본문/i.test(question);
  const asksForContent = /요약|정리|전문을?|본문\s*(?:전체|전문)?\s*(?:보여|읽|가져|전달)|내용을?\s*(?:알려|보여|정리)|분석해|핵심만/i.test(question);
  return hasArticle && asksForContent;
}

export function isArticleDownloadMethodQuestion(question: string) {
  const hasArticle = /기사|뉴스|본문/i.test(question);
  const hasDownload = /다운로드|내려받|엑셀|파일/i.test(question);
  const asksMethod = /방법|어떻게|받을|받는|내려받/i.test(question);
  return hasArticle && hasDownload && asksMethod && !/본문\s*(?:전체|전문)?\s*(?:보여|읽|가져|전달)/i.test(question);
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
