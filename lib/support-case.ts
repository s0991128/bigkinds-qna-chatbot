import { sanitizeText } from "./privacy-sanitizer";

export const SUPPORT_ISSUE_KINDS = [
  "SEARCH_NO_RESULT",
  "SEARCH_FILTER_PROBLEM",
  "DOWNLOAD_PROBLEM",
  "AUDIO_PLAYBACK_PROBLEM",
  "MEMBERSHIP_EMAIL_PROBLEM",
  "ACCOUNT_PROBLEM",
  "RIGHTS_LICENSE",
  "RIGHTS_RESEARCH",
] as const;

export type SupportIssueKind = (typeof SUPPORT_ISSUE_KINDS)[number];
export type SupportCaseStatus = "OPEN" | "NEEDS_DETAILS" | "RESOLVED" | "ESCALATED";

export type SupportCase = {
  caseId: string;
  sanitizedQuestion: string;
  issues: SupportIssueKind[];
  primaryIssue: SupportIssueKind | null;
  status: SupportCaseStatus;
  createdAt: string;
  updatedAt: string;
};

export type SupportCaseSummary = {
  issues: SupportIssueKind[];
  primaryIssue: SupportIssueKind | null;
  status: SupportCaseStatus;
};

function makeCaseId(now: string) {
  return `support-${now.replace(/[^0-9]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSupportCase(question: string, issues: SupportIssueKind[], now = new Date().toISOString()): SupportCase {
  const sanitizedQuestion = sanitizeText(question).value;
  const uniqueIssues = SUPPORT_ISSUE_KINDS.filter((kind) => issues.includes(kind));
  return {
    caseId: makeCaseId(now),
    sanitizedQuestion,
    issues: uniqueIssues,
    primaryIssue: uniqueIssues[0] || null,
    status: uniqueIssues.length ? "OPEN" : "NEEDS_DETAILS",
    createdAt: now,
    updatedAt: now,
  };
}

export function summarizeSupportCase(supportCase: SupportCase | null): SupportCaseSummary | null {
  if (!supportCase) return null;
  return {
    issues: [...supportCase.issues],
    primaryIssue: supportCase.primaryIssue,
    status: supportCase.status,
  };
}

export function updateSupportCaseStatus(supportCase: SupportCase, status: SupportCaseStatus, now = new Date().toISOString()): SupportCase {
  return { ...supportCase, status, updatedAt: now };
}
