const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}|(?:02|0[3-6][1-5])[-\s]?\d{3,4}[-\s]?\d{4}/g;
const RESIDENT_PATTERN = /\b\d{6}[-\s]?\d{7}\b/g;
const BEARER_PATTERN = /\bbearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SECRET_ASSIGNMENT_PATTERN = /\b(?:api[_ -]?key|apikey|access[_ -]?token|secret|password|passwd|token)\s*[:=]\s*[^\s,;]+/gi;
const KOREAN_SECRET_PATTERN = /(?:인증키|비밀번호|패스워드|접근\s*토큰)\s*(?:는|:|=)?\s*[^\s,;]+/gi;
const MAIL_HEADER_PATTERN = /(?:^|\n)\s*(?:from|to|cc|bcc|subject|보낸\s*사람|받는\s*사람|참조|제목)\s*:\s*[^\n]*/gim;

export type PrivacyRedactionKind = "EMAIL" | "PHONE" | "RESIDENT_NUMBER" | "CREDENTIAL" | "MAIL_HEADER";

export type PrivacySanitizationResult = {
  value: string;
  redactions: PrivacyRedactionKind[];
};

function replaceAndRecord(value: string, pattern: RegExp, replacement: string, kind: PrivacyRedactionKind, redactions: PrivacyRedactionKind[]) {
  if (!pattern.test(value)) return value;
  pattern.lastIndex = 0;
  if (!redactions.includes(kind)) redactions.push(kind);
  return value.replace(pattern, replacement);
}

export function sanitizeText(value: string): PrivacySanitizationResult {
  const redactions: PrivacyRedactionKind[] = [];
  let sanitized = String(value || "");
  sanitized = replaceAndRecord(sanitized, MAIL_HEADER_PATTERN, "[개인정보 제거]", "MAIL_HEADER", redactions);
  sanitized = replaceAndRecord(sanitized, RESIDENT_PATTERN, "[주민번호 제거]", "RESIDENT_NUMBER", redactions);
  sanitized = replaceAndRecord(sanitized, EMAIL_PATTERN, "[이메일 제거]", "EMAIL", redactions);
  sanitized = replaceAndRecord(sanitized, PHONE_PATTERN, "[전화번호 제거]", "PHONE", redactions);
  sanitized = replaceAndRecord(sanitized, BEARER_PATTERN, "[인증정보 제거]", "CREDENTIAL", redactions);
  sanitized = replaceAndRecord(sanitized, SECRET_ASSIGNMENT_PATTERN, "[인증정보 제거]", "CREDENTIAL", redactions);
  sanitized = replaceAndRecord(sanitized, KOREAN_SECRET_PATTERN, "[인증정보 제거]", "CREDENTIAL", redactions);
  return { value: sanitized.replace(/[ \t]{2,}/g, " ").trim(), redactions };
}

export function sanitizeForStorage(value: string) {
  return sanitizeText(value).value;
}

export const sanitizeSupportText = sanitizeForStorage;
export const redactPersonalInformation = sanitizeForStorage;

export function containsSensitiveData(value: string) {
  return sanitizeText(value).redactions.length > 0;
}
