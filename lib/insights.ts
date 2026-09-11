export const INSIGHTS_KEY = "bigkinds-anonymous-insights-v1";

export const INSIGHT_EVENT_TYPES = [
  "FAQ_ANSWERED", "SEARCH_COACH_USED", "SEARCH_DIAGNOSIS_USED", "FEATURE_RECOMMENDED", "TROUBLESHOOT_USED",
  "SERVICE_OVERVIEW_USED", "SERVICE_FACT_USED", "SERVICE_GUIDE_USED", "MANUAL_GUIDE_USED", "SUPPORT_TRIAGE_USED", "SUPPORT_CASE_STARTED", "MULTI_ISSUE_SUPPORT", "SEARCH_FILTER_PROBLEM", "MEMBERSHIP_EMAIL_PROBLEM", "AUDIO_PLAYBACK_PROBLEM", "RIGHTS_LICENSE_INQUIRY", "RIGHTS_RESEARCH_INQUIRY", "SUPPORT_ESCALATED", "OPEN_API_REDIRECT", "OUT_OF_SCOPE", "NO_CONFIDENT_MATCH", "GEMINI_UNAVAILABLE",
  "ARTICLE_LOOKUP_STARTED", "ARTICLE_LOOKUP_STRATEGY_USED", "ARTICLE_LOOKUP_FOUND", "ARTICLE_LOOKUP_NO_RESULT", "ARTICLE_LOOKUP_CANDIDATE", "ARTICLE_LOOKUP_REPLY_DRAFTED", "ARTICLE_LOOKUP_ESCALATED",
] as const;

export type InsightEventType = (typeof INSIGHT_EVENT_TYPES)[number];
export type InsightEvent = { eventType: InsightEventType; pageType: string; documentId?: string; capabilityId?: string; createdAt: string };

export function recordInsight(event: Omit<InsightEvent, "createdAt">) {
  if (typeof window === "undefined") return;
  try {
    const current = JSON.parse(window.localStorage.getItem(INSIGHTS_KEY) || "[]");
    const next = [...(Array.isArray(current) ? current : []), { ...event, createdAt: new Date().toISOString() }].slice(-500);
    window.localStorage.setItem(INSIGHTS_KEY, JSON.stringify(next));
  } catch { /* 익명 인사이트 저장이 차단되어도 챗봇은 계속 동작합니다. */ }
}

export function summarizeInsights(events: unknown[]) {
  const counts = Object.fromEntries(INSIGHT_EVENT_TYPES.map((type) => [type, 0])) as Record<InsightEventType, number>;
  events.forEach((event) => {
    if (!event || typeof event !== "object") return;
    const type = (event as { eventType?: unknown }).eventType;
    if (typeof type === "string" && type in counts) counts[type as InsightEventType] += 1;
  });
  return counts;
}
