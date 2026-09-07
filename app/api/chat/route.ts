import { isLikelyGeneralKnowledgeQuestion } from "../../../lib/question-intents";

const MAX_QUESTION_LENGTH = 500;
const MAX_SOURCES = 3;
const MAX_BODY_LENGTH = 20_000;
const sensitivePattern = /주민등록번호|비밀번호|인증키|api\s*key|apikey/i;

type HistoryTurn = { role?: unknown; text?: unknown };

/** P0 안전 모드: 서버 정본 저장소 연동 전에는 LLM 보완 호출을 차단합니다. */
export async function POST(request: Request) {
  let payload: { question?: unknown; sourceIds?: unknown; history?: unknown };
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_LENGTH) return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const question = String(payload.question || "").trim().slice(0, MAX_QUESTION_LENGTH);
  const sourceIds = Array.isArray(payload.sourceIds)
    ? payload.sourceIds.filter((id): id is string => typeof id === "string" && id.length <= 160).slice(0, MAX_SOURCES)
    : [];
  const history = Array.isArray(payload.history)
    ? payload.history
      .filter((turn): turn is HistoryTurn => Boolean(turn) && typeof turn === "object")
      .map((turn) => String(turn.text || "").replace(/\s+/g, " ").trim().slice(0, 600))
      .filter((text) => text && !sensitivePattern.test(text))
      .slice(-6)
    : [];
  void history;
  if (!question || !sourceIds.length) return Response.json({ error: "질문 또는 검색 근거가 없습니다." }, { status: 400 });
  if (sensitivePattern.test(question)) return Response.json({ error: "민감한 질문은 자동 문장 보완 대상에서 제외합니다." }, { status: 400 });
  if (isLikelyGeneralKnowledgeQuestion(question)) return Response.json({ error: "저장된 빅카인즈 문서 범위를 벗어난 질문입니다." }, { status: 422 });
  return Response.json({ error: "자동 문장 보완 기능은 공식 정본 저장소 연동 후 제공됩니다." }, { status: 503 });
}
