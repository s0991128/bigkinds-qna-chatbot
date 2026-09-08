import { capabilities } from "../capabilities";
import { normalizeSearchInput } from "../search-term-normalizer";
import { buildAiPrompt } from "./prompts";
import { AI_INTENTS, AiInterpretation, AiRouterRequest, AiRouterResponse, SearchTurnPatch } from "./types";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const TIMEOUT_MS = 8_000;
const sensitivePattern = /(?:주민\s*등록\s*번호|\b\d{6}[-\s]\d{7}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:01[016789]|02|0[3-6][1-5])[-\s]?\d{3,4}[-\s]?\d{4}|비밀번호|password|인증키|api\s*key|apikey|bearer\s+[A-Za-z0-9._-]+)/i;

function stringArray(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, limit);
}

function suggestedTerms(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.baseTerm !== "string") return [];
    return [{ baseTerm: record.baseTerm.trim().slice(0, 80), alternatives: stringArray(record.alternatives, 4) }];
  }).filter((item) => item.baseTerm && item.alternatives.length).slice(0, 4);
}

function searchPatch(value: unknown): SearchTurnPatch | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const part = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return undefined;
    const input = candidate as Record<string, unknown>;
    const normalized = normalizeSearchInput({
      all: stringArray(input.all),
      any: stringArray(input.any),
      exact: stringArray(input.exact),
      exclude: stringArray(input.exclude),
    });
    return { all: normalized.all || [], any: normalized.any || [], exact: normalized.exact || [], exclude: normalized.exclude || [] };
  };
  return { add: part(record.add), remove: part(record.remove) };
}

export function validateInterpretation(value: unknown): AiInterpretation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const intent = typeof record.intent === "string" && AI_INTENTS.includes(record.intent as AiInterpretation["intent"])
    ? record.intent as AiInterpretation["intent"]
    : null;
  if (!intent) return null;
  const searchMode = ["NEW", "UPDATE", "DIAGNOSIS", "NOT_SEARCH", "CLARIFY"].includes(String(record.searchMode))
    ? String(record.searchMode) as AiInterpretation["searchMode"]
    : undefined;
  const rawInput = record.searchInput && typeof record.searchInput === "object" ? record.searchInput as Record<string, unknown> : {};
  const capabilityIds = stringArray(record.capabilityIds, 4).filter((id) => capabilities.some((capability) => capability.id === id));
  const diagnosticKind = typeof record.diagnosticKind === "string" ? record.diagnosticKind.slice(0, 60) : null;
  const clarifyingQuestion = typeof record.clarifyingQuestion === "string" ? record.clarifyingQuestion.slice(0, 240) : null;
  const searchInput = normalizeSearchInput({
    all: stringArray(rawInput.all),
    any: stringArray(rawInput.any),
    exact: stringArray(rawInput.exact),
    exclude: stringArray(rawInput.exclude),
  });
  return {
    intent,
    searchMode,
    searchInput: {
      all: searchInput.all || [],
      any: searchInput.any || [],
      exact: searchInput.exact || [],
      exclude: searchInput.exclude || [],
    },
    patch: searchPatch(record.patch),
    suggestedTerms: suggestedTerms(record.suggestedTerms),
    capabilityIds,
    diagnosticKind,
    needsClarification: record.needsClarification === true,
    clarifyingQuestion,
  };
}

async function readGeminiJson(response: Response) {
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) return null;
  try {
    return JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/i, ""));
  } catch {
    return null;
  }
}

export async function interpretWithGemini(input: AiRouterRequest, fetcher: typeof fetch = fetch): Promise<AiRouterResponse> {
  const question = input.question.trim().slice(0, 500);
  if (!question) return { available: false, reason: "INVALID_REQUEST" };
  if (/open\s*api|openapi|\bapi\b|api\s*key|apikey|인증키|호출\s*오류/i.test(question)) return { available: false, reason: "OPEN_API" };
  if (sensitivePattern.test(question)) return { available: false, reason: "SENSITIVE" };
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { available: false, reason: "NO_KEY" };
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildAiPrompt(question, input.pageType || "UNKNOWN", input.state, capabilities, input.task || "ROUTE") }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { available: false, reason: response.status === 429 || response.status >= 500 ? "UPSTREAM" : "MALFORMED" };
    const interpretation = validateInterpretation(await readGeminiJson(response));
    return interpretation ? { available: true, interpretation } : { available: false, reason: "MALFORMED" };
  } catch (error) {
    return { available: false, reason: error instanceof DOMException && error.name === "AbortError" ? "TIMEOUT" : "UPSTREAM" };
  } finally {
    clearTimeout(timer);
  }
}
