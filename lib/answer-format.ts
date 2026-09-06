import { isKnowledgeDocumentsQuestion, isLikelyGeneralKnowledgeQuestion, isStoredArticleCountQuestion, isUnderspecifiedQuestion } from "./question-intents";

export const CHAT_HISTORY_KEY = "bigkinds-chat-history-v1";
export const OPEN_API_PURCHASE_URL = "https://www.newstore.or.kr/store/prodct/newsdata/list.do";

export type ChatHistoryItem = {
  id: string;
  question: string;
  answer: string;
  category?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  createdAt: string;
};

const GENERAL_SCOPE_ANSWER = "질문의 의도는 일반 상식·시사 정보 확인으로 보이지만, 저장된 빅카인즈 공식 문서에는 해당 내용이 없습니다. 이 챗봇은 빅카인즈 이용 방법과 공식 Q&A 범위에서만 안내할 수 있어요.";
const API_REDIRECT_ANSWER = `OPEN API 관련 문의와 구매 신청은 뉴스토어에서 확인해 주세요. 최신 계약·요금 조건은 공식 신청 페이지에서 확인해야 하며, 구매 요청은 ${OPEN_API_PURCHASE_URL}에서 진행할 수 있습니다.`;
const DOCUMENTS_ANSWER = "검색 문서는 빅카인즈 공식 Q&A, 공식 FAQ, 빅카인즈 소개, 정책·사용법 자료로 구성됩니다. 뉴스 기사 원문 전체를 저장한 데이터베이스가 아니며, 문서에 근거가 없으면 임의로 답변하지 않습니다.";
const ARTICLE_COUNT_ANSWER = "이 챗봇에 저장된 데이터는 뉴스 기사 원문 전체가 아니라 빅카인즈 공식 Q&A·FAQ·소개·정책 문서입니다. 빅카인즈 전체 기사 보유 건수는 이 챗봇 데이터만으로 확인할 수 없습니다.";
const UNDERSPECIFIED_ANSWER = "어떤 주제의 예시가 필요한지 조금 더 알려주세요. 예를 들어 ‘검색식을 만드는 예시를 보여줘’처럼 질문해 주시면 저장된 공식 문서를 기준으로 안내하겠습니다.";

function isOpenApiQuestion(question: string) {
  return /open\s*api|openapi|\bapi\b|인증키|호출\s*오류/i.test(question);
}

/** 이전 버전에서 저장된 오답을 현재 결정형 답변으로 교정합니다. */
export function normalizeChatHistory(items: unknown): ChatHistoryItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is ChatHistoryItem => Boolean(item) && typeof item === "object" && typeof (item as ChatHistoryItem).question === "string" && typeof (item as ChatHistoryItem).answer === "string")
    .map((item) => {
      const question = item.question.trim();
      let answer = formatAnswer(item.answer);
      let category = item.category;
      let sourceUrl = item.sourceUrl;
      if (isLikelyGeneralKnowledgeQuestion(question)) {
        answer = GENERAL_SCOPE_ANSWER;
        category = "범위 안내";
        sourceUrl = "";
      } else if (isStoredArticleCountQuestion(question)) {
        answer = ARTICLE_COUNT_ANSWER;
        category = "데이터 범위";
        sourceUrl = "";
      } else if (isKnowledgeDocumentsQuestion(question)) {
        answer = DOCUMENTS_ANSWER;
        category = "검색 문서";
        sourceUrl = "";
      } else if (isUnderspecifiedQuestion(question)) {
        answer = UNDERSPECIFIED_ANSWER;
        category = "이용 안내";
        sourceUrl = "";
      } else if (isOpenApiQuestion(question)) {
        answer = API_REDIRECT_ANSWER;
        category = "Open API";
        sourceUrl = OPEN_API_PURCHASE_URL;
      }
      return { ...item, question, answer, category, sourceUrl };
    });
}

/** 원본 Q&A의 ¶ 표기를 문단·줄바꿈으로 변환하고 과도한 공백을 정리합니다. */
export function formatAnswer(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u00b6\u00b6/g, "\n\n")
    .replace(/\u00b6/g, "\n")
    .replace(/https?:\/\/forms\.gle\/[^\s)]+/gi, OPEN_API_PURCHASE_URL)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
