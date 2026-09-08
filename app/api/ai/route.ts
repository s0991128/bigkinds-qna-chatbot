import { isLikelyGeneralKnowledgeQuestion, isOpenApiQuestion } from "../../../lib/question-intents";
import { interpretWithGemini } from "../../../lib/ai/gemini";
import type { AiRouterRequest } from "../../../lib/ai/types";

const MAX_BODY_LENGTH = 20_000;
const MAX_QUESTION_LENGTH = 500;
const allowedTasks = new Set(["ROUTE", "INTERPRET_SEARCH_GOAL", "UPDATE_SEARCH", "CLASSIFY_SEARCH_TURN"]);
const allowedPageTypes = new Set([
  "HOME", "NEWS_SEARCH", "MORPHEME_ANALYSIS", "VISUALIZATION", "REGIONAL_ISSUE", "LATEST_NEWS",
  "WEEKLY_ISSUE", "OLD_NEWSPAPER", "FAQ", "QNA", "MEMBERSHIP", "MYPAGE", "UNKNOWN",
]);
const sensitivePattern = /(?:주민\s*등록\s*번호|\b\d{6}[-\s]\d{7}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:01[016789]|02|0[3-6][1-5])[-\s]?\d{3,4}[-\s]?\d{4}|비밀번호|password|인증키|api\s*key|apikey|bearer\s+[A-Za-z0-9._-]+)/i;

function safeState(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const lastSearchInput = record.lastSearchInput && typeof record.lastSearchInput === "object"
    ? record.lastSearchInput as Record<string, unknown>
    : null;
  const array = (candidate: unknown) => Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 80)).slice(0, 12)
    : [];
  return {
    lastIntent: typeof record.lastIntent === "string" ? record.lastIntent.slice(0, 40) : null,
    lastSearchInput: lastSearchInput ? {
      all: array(lastSearchInput.all), any: array(lastSearchInput.any), exact: array(lastSearchInput.exact), exclude: array(lastSearchInput.exclude),
    } : null,
    lastGeneratedQuery: typeof record.lastGeneratedQuery === "string" ? record.lastGeneratedQuery.slice(0, 240) : null,
    activeMode: typeof record.activeMode === "string" ? record.activeMode.slice(0, 40) : null,
    lastSearchMode: typeof record.lastSearchMode === "string" ? record.lastSearchMode.slice(0, 20) : null,
    searchRevision: typeof record.searchRevision === "number" ? Math.max(0, Math.min(999, Math.floor(record.searchRevision))) : 0,
    searchStartedAt: typeof record.searchStartedAt === "string" ? record.searchStartedAt.slice(0, 40) : null,
    pageType: typeof record.pageType === "string" ? record.pageType.slice(0, 40) : null,
  };
}

export async function POST(request: Request) {
  let payload: { question?: unknown; pageType?: unknown; state?: unknown; task?: unknown };
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_LENGTH) return Response.json({ available: false, reason: "INVALID_REQUEST" }, { status: 413 });
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return Response.json({ available: false, reason: "INVALID_REQUEST" }, { status: 400 });
  }

  const question = typeof payload.question === "string" ? payload.question.trim().slice(0, MAX_QUESTION_LENGTH) : "";
  const pageType = typeof payload.pageType === "string" && allowedPageTypes.has(payload.pageType) ? payload.pageType : "UNKNOWN";
  const task = typeof payload.task === "string" && allowedTasks.has(payload.task) ? payload.task : "ROUTE";
  if (!question) return Response.json({ available: false, reason: "INVALID_REQUEST" }, { status: 400 });
  if (typeof payload.task === "string" && !allowedTasks.has(payload.task)) return Response.json({ available: false, reason: "INVALID_REQUEST" }, { status: 400 });
  if (isOpenApiQuestion(question)) return Response.json({ available: false, reason: "OPEN_API" }, { status: 200 });
  if (sensitivePattern.test(question)) return Response.json({ available: false, reason: "SENSITIVE" }, { status: 200 });
  if (isLikelyGeneralKnowledgeQuestion(question)) return Response.json({
    available: true,
    interpretation: { intent: "OUT_OF_SCOPE", searchInput: { all: [], any: [], exact: [], exclude: [] }, capabilityIds: [], diagnosticKind: null, needsClarification: false, clarifyingQuestion: null },
  }, { status: 200 });

  const result = await interpretWithGemini({ question, task: task as "ROUTE" | "INTERPRET_SEARCH_GOAL" | "UPDATE_SEARCH" | "CLASSIFY_SEARCH_TURN", pageType, state: safeState(payload.state) } satisfies AiRouterRequest);
  return Response.json(result, { status: 200 });
}
