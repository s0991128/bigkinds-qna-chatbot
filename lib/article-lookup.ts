export type ArticleLookupMaterialType = "ARTICLE" | "PAGE" | "BOX_LIST" | "AWARD_LIST" | "ADVERTISEMENT" | "UNKNOWN";
export type ArticleLookupStatus = "DRAFT" | "READY" | "SEARCHING" | "CANDIDATES_FOUND" | "NO_RESULT" | "NEEDS_REVIEW" | "CONFIRMED";
export type ArticleLookupResultStatus = "FOUND" | "NOT_FOUND" | "CANDIDATE";

export type ArticleLookupCase = {
  id: string;
  period: { from?: string | null; to?: string | null; originalText?: string | null; precision: "EXACT" | "MONTH" | "APPROXIMATE" | "UNKNOWN" };
  media: string[];
  persons: string[];
  organizations: string[];
  roles: string[];
  events: string[];
  awards: string[];
  keywords: string[];
  pageHints: string[];
  materialType: ArticleLookupMaterialType;
  status: ArticleLookupStatus;
  createdAt: string;
  updatedAt: string;
};

export type ArticleLookupContext = {
  currentCase: ArticleLookupCase | null;
  selectedStrategyId: string | null;
  lastResultStatus: ArticleLookupResultStatus | null;
};

export type ArticleLookupHistorySummary = Pick<ArticleLookupCase, "period" | "media" | "organizations" | "events" | "materialType" | "pageHints" | "status">;

const mediaNames = ["매일경제", "한국경제", "경제신문", "조선일보", "중앙일보", "동아일보", "경향신문", "한겨레"];
const rolePattern = /(?:과장|팀장|부장|대표|교수|사장|회장|이사|장관|직원)/g;
const eventNames = ["노동부장관 표창", "정부포상", "산업안전", "안전관리", "표창", "수상", "포상", "사고", "취임", "수상자 명단"];
const contactPattern = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:01[016789]|02|0[3-6][1-5])[-\s]?\d{3,4}[-\s]?\d{4}|\b\d{6}[-\s]?\d{7}\b|(?:api\s*key|apikey|password|비밀번호|bearer)\s*[:=]?\s*\S+/gi;
const mailHeaderPattern = /^(?:from|to|cc|bcc|subject|보낸사람|받는사람|참조|제목)\s*:\s*.*$/gim;

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function dateText(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDay(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthRange(year: number, month: number) {
  return { from: dateText(year, month, 1), to: dateText(year, month, lastDay(year, month)) };
}

function shiftMonth(year: number, month: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function extractPeriod(value: string): ArticleLookupCase["period"] {
  const exact = value.match(/(19\d{2}|20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일(?:자)?/);
  if (exact) {
    const year = Number(exact[1]);
    const month = Number(exact[2]);
    const day = Number(exact[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= lastDay(year, month)) {
      const date = dateText(year, month, day);
      return { from: date, to: date, originalText: exact[0], precision: "EXACT" };
    }
  }

  const month = value.match(/(19\d{2}|20\d{2})년\s*(\d{1,2})월\s*(전후|경|무렵)?/);
  if (month) {
    const year = Number(month[1]);
    const monthNumber = Number(month[2]);
    if (monthNumber >= 1 && monthNumber <= 12) {
      if (month[3] === "전후") {
        const previous = shiftMonth(year, monthNumber, -1);
        const next = shiftMonth(year, monthNumber, 1);
        return { from: monthRange(previous.year, previous.month).from, to: monthRange(next.year, next.month).to, originalText: month[0], precision: "APPROXIMATE" };
      }
      return { ...monthRange(year, monthNumber), originalText: month[0], precision: month[3] ? "APPROXIMATE" : "MONTH" };
    }
  }

  const summer = value.match(/(19\d{2}|20\d{2})년\s*여름/);
  if (summer) {
    const year = Number(summer[1]);
    return { from: dateText(year, 6, 1), to: dateText(year, 8, 31), originalText: summer[0], precision: "APPROXIMATE" };
  }

  const year = value.match(/(19\d{2}|20\d{2})년/);
  if (year) return { from: `${year[1]}-01-01`, to: `${year[1]}-12-31`, originalText: year[0], precision: "APPROXIMATE" };
  return { from: null, to: null, originalText: null, precision: "UNKNOWN" };
}

export function sanitizeLookupRequest(value: string) {
  return value.replace(mailHeaderPattern, "").replace(contactPattern, "[개인정보 제거]").replace(/\n{3,}/g, "\n\n").trim();
}

export function sanitizeLookupRequestForHistory(value: string) {
  const sanitized = sanitizeLookupRequest(value);
  const persons = extractPersons(sanitized);
  return persons.reduce((result, person) => result.split(person).join("[인물명 비공개]"), sanitized);
}

function extractLabeledValues(value: string, label: string) {
  return [...value.matchAll(new RegExp(`(?:${label})\\s*[:：]\\s*([가-힣A-Za-z0-9·()]{2,30})`, "g"))].map((match) => match[1]);
}

function extractPersons(value: string) {
  const labelled = extractLabeledValues(value, "성명|이름|인물");
  const titled = [...value.matchAll(/(?:^|[^가-힣])([가-힣]{2,4})\s*(?:교수|씨)(?:님)?(?:의|이|가|은|는|을|를|도)?(?![가-힣])/g)].map((match) => match[1]);
  return unique([...labelled, ...titled]);
}

function extractOrganizations(value: string) {
  const labelled = extractLabeledValues(value, "소속|당시\\s*소속|회사|기관");
  const known = [...value.matchAll(/아시아나(?:항공)?|[가-힣A-Za-z0-9]+(?:항공|신문|대학교|연구원|공사|협회|재단|회사)/g)].map((match) => match[0]);
  return unique([...labelled, ...known]);
}

function extractEvents(value: string) {
  return eventNames.filter((event) => value.includes(event));
}

function deriveMaterialType(value: string, awards: string[], pageHints: string[]): ArticleLookupMaterialType {
  if (/광고/.test(value)) return "ADVERTISEMENT";
  if (awards.length && /명단|수상자|목록|표창/.test(value)) return "AWARD_LIST";
  if (/명단|박스|사각형|인사명단/.test(value)) return "BOX_LIST";
  if (pageHints.length || /지면|신문\s*면/.test(value)) return "PAGE";
  return "ARTICLE";
}

function makeId(now: string) {
  return `lookup-${Date.parse(now) || Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function extractArticleLookupCase(question: string, now = new Date().toISOString()): ArticleLookupCase {
  const sanitized = sanitizeLookupRequest(question);
  const period = extractPeriod(sanitized);
  const media = mediaNames.filter((name) => sanitized.includes(name));
  const persons = extractPersons(sanitized);
  const organizations = extractOrganizations(sanitized);
  const roles = unique(sanitized.match(rolePattern) || []);
  const events = extractEvents(sanitized);
  const awards = events.filter((event) => /표창|수상|포상/.test(event));
  const pageHints = unique([...sanitized.matchAll(/(?:\d{1,3}\s*면|[가-힣]+면)/g)].map((match) => match[0].replace(/\s+/g, "")));
  const materialType = deriveMaterialType(sanitized, awards, pageHints);
  const keywords = unique([...persons, ...organizations, ...roles, ...events]);
  return {
    id: makeId(now), period, media, persons, organizations, roles, events, awards, keywords, pageHints,
    materialType, status: period.precision === "UNKNOWN" && !media.length && !keywords.length ? "DRAFT" : "READY",
    createdAt: now, updatedAt: now,
  };
}

export function isHistoricalArticleLookupQuestion(question: string) {
  const cleaned = sanitizeLookupRequest(question);
  const asksAvailability = /검색되나요|가능한가요|할\s*수\s*있나요|지원하나요/.test(cleaned);
  const historicalSignal = /(?:19\d{2}|20\d{2})년|예전에|옛날|과거|그때|지면|몇\s*면|명단|수상자|박스|사각형|신문\s*자료/.test(cleaned);
  const lookupGoal = /찾(?:아|고|고\s*싶|아주세요)|확인|실렸|게재|나온|신문\s*자료.*문의/.test(cleaned);
  return historicalSignal && lookupGoal && !asksAvailability;
}

export function isArticleLookupUpdateQuestion(question: string) {
  return /(?:기간|언론사|신문사|소속|검색어|조건).{0,20}(?:바꿔|넓혀|좁혀|추가|넣어|수정)|(?:추가|넣어|바꿔|넓혀|좁혀).{0,20}(?:기간|언론사|소속|검색어|조건)|아시아나항공도/i.test(question);
}

export function emptyArticleLookupContext(): ArticleLookupContext {
  return { currentCase: null, selectedStrategyId: null, lastResultStatus: null };
}

export function updateArticleLookupCase(current: ArticleLookupCase, request: string, now = new Date().toISOString()): ArticleLookupCase {
  const year = current.period.from?.slice(0, 4);
  const parsed = extractArticleLookupCase(year && !/(?:19\d{2}|20\d{2})년/.test(request) ? `${year}년 ${request}` : request, now);
  const replaceMedia = /(?:만|으로만|만\s*찾)/.test(request);
  const period = parsed.period.precision === "UNKNOWN" ? current.period : parsed.period;
  const media = parsed.media.length ? (replaceMedia ? parsed.media : unique([...current.media, ...parsed.media])) : current.media;
  const persons = unique([...current.persons, ...parsed.persons]);
  const organizations = unique([...current.organizations, ...parsed.organizations]);
  const roles = unique([...current.roles, ...parsed.roles]);
  const events = unique([...current.events, ...parsed.events]);
  const awards = unique([...current.awards, ...parsed.awards]);
  const pageHints = unique([...current.pageHints, ...parsed.pageHints]);
  const materialType = parsed.materialType === "ARTICLE" && current.materialType !== "ARTICLE" ? current.materialType : parsed.materialType;
  return {
    ...current,
    period, media, persons, organizations, roles, events, awards, pageHints, materialType,
    keywords: unique([...persons, ...organizations, ...roles, ...events]),
    status: "READY",
    updatedAt: now,
  };
}

export function createArticleLookupHistorySummary(value: ArticleLookupCase | null): ArticleLookupHistorySummary | null {
  if (!value) return null;
  return {
    period: value.period,
    media: value.media,
    organizations: value.organizations,
    events: value.events,
    materialType: value.materialType,
    pageHints: value.pageHints,
    status: value.status,
  };
}

export function createLookupReplyDraft(currentCase: ArticleLookupCase, result: ArticleLookupResultStatus | null) {
  if (!result) return null;
  if (result === "FOUND") {
    return "관련 자료를 확인하셨습니다. 확인한 기사 제목·날짜·URL을 입력해 주시면 이를 반영한 회신 초안을 만들 수 있습니다.";
  }
  if (result === "CANDIDATE") {
    return "안녕하세요.\n한국언론진흥재단 뉴스빅데이터팀입니다.\n\n문의주신 자료와 비슷한 결과는 확인되었으나, 정확히 동일한 자료인지 추가 확인이 필요합니다. 기사 제목·날짜·지면 정보가 확인되면 해당 단서를 기준으로 다시 검토해 주세요.\n\n감사합니다.\n한국언론진흥재단 뉴스빅데이터팀 드림";
  }
  const pageNotice = ["PAGE", "BOX_LIST", "AWARD_LIST"].includes(currentCase.materialType)
    ? "요청 자료가 별도의 지면 명단·박스 형태로 게재된 경우 정확한 확인을 위해 해당 언론사에 해당 일자·지면의 열람 가능 여부를 문의해 보시기를 권해드립니다."
    : "정확한 원문 또는 지면 확인이 필요한 경우 해당 언론사에 열람 가능 여부를 문의해 보시기를 권해드립니다.";
  return "안녕하세요.\n한국언론진흥재단 뉴스빅데이터팀입니다.\n\n문의주신 기간·언론사·검색어를 기준으로 BIGKinds에서 관련 자료를 확인하는 방법을 검토하였으나, 현재 확인한 검색조건에서는 요청하신 자료를 확인하지 못했습니다.\n\nBIGKinds는 협약 언론사로부터 제공받은 기사 데이터를 기반으로 서비스하고 있어, 과거 신문의 모든 지면이나 지면 내 별도 박스·명단 등의 내용이 검색되지 않을 수 있습니다.\n\n" + pageNotice + "\n\n감사합니다.\n한국언론진흥재단 뉴스빅데이터팀 드림";
}
