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
  summary: string;
  issues: SupportIssueKind[];
  primaryIssue: SupportIssueKind | null;
  status: SupportCaseStatus;
  createdAt: string;
  updatedAt: string;
};

export type SupportCaseSummary = {
  summary: string;
  issues: SupportIssueKind[];
  primaryIssue: SupportIssueKind | null;
  status: SupportCaseStatus;
};

function makeCaseId(now: string) {
  return `support-${now.replace(/[^0-9]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
}

const supportLabels: Record<SupportIssueKind, string> = {
  SEARCH_NO_RESULT: "검색결과 없음",
  SEARCH_FILTER_PROBLEM: "검색 필터·조건 문제",
  DOWNLOAD_PROBLEM: "다운로드 문제",
  AUDIO_PLAYBACK_PROBLEM: "오디오 재생 문제",
  MEMBERSHIP_EMAIL_PROBLEM: "회원가입·이메일 문제",
  ACCOUNT_PROBLEM: "계정·로그인 문제",
  RIGHTS_LICENSE: "저작권·이용권 문의",
  RIGHTS_RESEARCH: "연구·학술 이용 문의",
};

export function summarizeSupportRequest(_question: string, issues: SupportIssueKind[]) {
  const labels = SUPPORT_ISSUE_KINDS
    .filter((kind) => issues.includes(kind))
    .map((kind) => supportLabels[kind]);
  return labels.length ? `${labels.join(", ")} 문의` : "빅카인즈 이용 문의";
}

export function createSupportCase(question: string, issues: SupportIssueKind[], now = new Date().toISOString()): SupportCase {
  const sanitizedQuestion = sanitizeText(question).value;
  const uniqueIssues = SUPPORT_ISSUE_KINDS.filter((kind) => issues.includes(kind));
  return {
    caseId: makeCaseId(now),
    sanitizedQuestion,
    summary: summarizeSupportRequest(question, uniqueIssues),
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
    summary: supportCase.summary,
    issues: [...supportCase.issues],
    primaryIssue: supportCase.primaryIssue,
    status: supportCase.status,
  };
}

export function updateSupportCaseStatus(supportCase: SupportCase, status: SupportCaseStatus, now = new Date().toISOString()): SupportCase {
  return { ...supportCase, status, updatedAt: now };
}
