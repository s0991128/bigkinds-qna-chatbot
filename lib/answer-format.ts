export const CHAT_HISTORY_KEY = "bigkinds-chat-history-v1";

export type ChatHistoryItem = {
  id: string;
  question: string;
  answer: string;
  category?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  createdAt: string;
};

/** 원본 Q&A의 ¶ 표기를 문단·줄바꿈으로 변환하고 과도한 공백을 정리합니다. */
export function formatAnswer(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u00b6\u00b6/g, "\n\n")
    .replace(/\u00b6/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
