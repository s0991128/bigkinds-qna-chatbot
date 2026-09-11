import type { AnswerViewModel } from "./answer-model";
import type { Capability } from "./capabilities";
import type { DiagnosticFlow } from "./diagnostic-flows";
import type { SearchDiagnosis } from "./search-diagnostics";
import type { AiSuggestedTerms } from "./ai/types";
import type { ArticleLookupContext, ArticleLookupHistorySummary } from "./article-lookup";
import type { LookupStrategy } from "./article-lookup-strategy";
import type { SupportCaseSummary } from "./support-case";

export const ACTIVE_CHAT_SESSION_KEY = "bigkinds-active-chat-session-v1";
export const CHAT_SESSIONS_KEY = "bigkinds-chat-sessions-v1";
export const ACTIVE_SESSION_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
export const CHAT_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type PersistedSearchInput = {
  all: string[];
  any: string[];
  exact: string[];
  exclude: string[];
};

export type PersistedMessageAction = {
  id: string;
  label: string;
  type: string;
  value?: string;
  url?: string;
};

export type PersistedChatMessage = {
  id: number | string;
  role: "assistant" | "user";
  text: string;
  matchedId?: string;
  relatedIds?: string[];
  isFallback?: boolean;
  question?: string;
  apiRedirect?: boolean;
  searchQuery?: { value: string; description: string };
  searchInput?: PersistedSearchInput;
  capabilityId?: string;
  capabilityIds?: string[];
  intent?: string;
  actions?: PersistedMessageAction[];
  answerModel?: AnswerViewModel;
  diagnostic?: DiagnosticFlow;
  searchDiagnosis?: SearchDiagnosis;
  manualReference?: { label: string; section: string };
  articleLookupSummary?: ArticleLookupHistorySummary;
  lookupResultStatus?: "FOUND" | "NOT_FOUND" | "CANDIDATE";
  replyDraft?: string;
  lookupStrategies?: LookupStrategy[];
  supportCaseSummary?: SupportCaseSummary;
  capabilities?: Capability[];
  suggestedTerms?: AiSuggestedTerms[];
  createdAt?: string;
};

export type ChatWorkingState = {
  lastIntent?: string | null;
  lastSearchInput?: PersistedSearchInput | null;
  lastGeneratedQuery?: string | null;
  lastCapabilityId?: string | null;
  activeMode?: string | null;
  lastSearchMode?: "NEW" | "UPDATE" | "DIAGNOSIS" | "NOT_SEARCH" | "CLARIFY" | null;
  searchRevision?: number;
  searchStartedAt?: string | null;
  searchContext?: {
    status?: "ACTIVE" | "PROPOSED" | "STALE";
    input: PersistedSearchInput | null;
    query?: string | null;
    generatedQuery?: string | null;
    source?: "NEW" | "DIAGNOSIS" | "UPDATE" | null;
    revision: number;
    updatedAt: string | null;
  };
  articleLookupContext?: ArticleLookupContext;
};

export type ChatSession = {
  id: string;
  startedAt: string;
  updatedAt: string;
  closedAt?: string;
  title: string;
  messages: PersistedChatMessage[];
  workingState: ChatWorkingState;
};

function storageOrDefault(storage: Storage | undefined, kind: "session" | "local") {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function makeSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function truncateSessionTitle(value: string, maxLength = 40) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
}

export function createChatSession(now = new Date().toISOString()): ChatSession {
  return {
    id: makeSessionId(),
    startedAt: now,
    updatedAt: now,
    title: "새 대화",
    messages: [],
    workingState: {
      lastIntent: null,
      lastSearchInput: null,
      lastGeneratedQuery: null,
      lastCapabilityId: null,
      activeMode: null,
      lastSearchMode: null,
      searchRevision: 0,
      searchStartedAt: null,
      searchContext: { status: "STALE", input: null, query: null, source: null, revision: 0, updatedAt: null },
      articleLookupContext: { currentCase: null, selectedStrategyId: null, lastResultStatus: null },
    },
  };
}

function isChatSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ChatSession>;
  return typeof record.id === "string"
    && typeof record.startedAt === "string"
    && typeof record.updatedAt === "string"
    && typeof record.title === "string"
    && Array.isArray(record.messages)
    && Boolean(record.workingState && typeof record.workingState === "object");
}

export function loadActiveChatSession(storage?: Storage): ChatSession | null {
  const target = storageOrDefault(storage, "session");
  if (!target) return null;
  try {
    const parsed = JSON.parse(target.getItem(ACTIVE_CHAT_SESSION_KEY) || "null");
    return isChatSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function koreaDay(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function shouldStartNewSession(session: ChatSession | null, now = new Date().toISOString()) {
  if (!session) return true;
  const updatedAt = Date.parse(session.updatedAt);
  if (!Number.isFinite(updatedAt) || Date.parse(now) - updatedAt > ACTIVE_SESSION_IDLE_TTL_MS) return true;
  return koreaDay(session.updatedAt) !== koreaDay(now);
}

export function saveActiveChatSession(session: ChatSession, storage?: Storage) {
  const target = storageOrDefault(storage, "session");
  if (!target) return;
  try {
    target.setItem(ACTIVE_CHAT_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
}

export function clearActiveChatSession(storage?: Storage) {
  const target = storageOrDefault(storage, "session");
  try { target?.removeItem(ACTIVE_CHAT_SESSION_KEY); } catch { /* ignore storage failures */ }
}

export function loadChatSessions(storage?: Storage): ChatSession[] {
  const target = storageOrDefault(storage, "local");
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(CHAT_SESSIONS_KEY) || "[]");
    const cutoff = Date.now() - CHAT_HISTORY_RETENTION_MS;
    const sessions = Array.isArray(parsed)
      ? parsed.filter(isChatSession).filter((session) => Date.parse(session.closedAt || session.updatedAt) >= cutoff)
      : [];
    target.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions));
    return sessions;
  } catch {
    return [];
  }
}

export function archiveChatSession(session: ChatSession, storage?: Storage): ChatSession[] {
  if (!session.messages.some((message) => message.role === "user")) return loadChatSessions(storage);
  const now = new Date().toISOString();
  const firstUserMessage = session.messages.find((message) => message.role === "user");
  const archivedMessages = session.messages.map((message) => message.articleLookupSummary
    ? { ...message, lookupStrategies: undefined }
    : message);
  const archived = {
    ...session,
    messages: archivedMessages,
    title: firstUserMessage ? truncateSessionTitle(firstUserMessage.text) : session.title,
    updatedAt: now,
    closedAt: now,
    workingState: {
      ...session.workingState,
      articleLookupContext: session.workingState.articleLookupContext
        ? { ...session.workingState.articleLookupContext, currentCase: null, selectedStrategyId: null }
        : undefined,
    },
  };
  const sessions = [archived, ...loadChatSessions(storage).filter((item) => item.id !== session.id)].slice(0, 100);
  const target = storageOrDefault(storage, "local");
  try { target?.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions)); } catch { /* ignore storage failures */ }
  return sessions;
}

export function clearChatSessions(storage?: Storage) {
  const target = storageOrDefault(storage, "local");
  try { target?.removeItem(CHAT_SESSIONS_KEY); } catch { /* ignore storage failures */ }
}

export type ChatSessionCsvRow = {
  sessionId: string;
  startedAt: string;
  closedAt: string;
  sequence: number;
  role: string;
  content: string;
  searchQuery: string;
  documentId: string;
};

export function flattenChatSessions(sessions: ChatSession[]): ChatSessionCsvRow[] {
  return sessions.flatMap((session) => session.messages.map((message, index) => ({
    sessionId: session.id,
    startedAt: session.startedAt,
    closedAt: session.closedAt || "",
    sequence: index + 1,
    role: message.role,
    content: message.text,
    searchQuery: message.searchQuery?.value || "",
    documentId: message.matchedId || "",
  })));
}
