export type FeedbackRecord = {
  id: string;
  documentId?: string;
  pageType?: string;
  rating: "up" | "down";
  reason?: string;
  createdAt: string;
};

export const FEEDBACK_STORAGE_KEY = "bigkinds-feedback-v1";

/** DB 연결 전에도 동작하는 개인정보 최소화 피드백 저장 추상화입니다. 질문 원문은 저장하지 않습니다. */
export function recordFeedback(record: Omit<FeedbackRecord, "id" | "createdAt">) {
  if (typeof window === "undefined") return;
  try {
    const current = JSON.parse(window.localStorage.getItem(FEEDBACK_STORAGE_KEY) || "[]") as FeedbackRecord[];
    const next: FeedbackRecord[] = [{ ...record, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString() }, ...current].slice(0, 200);
    window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(next));
  } catch { /* 저장이 차단된 환경에서도 답변은 계속 제공합니다. */ }
}
