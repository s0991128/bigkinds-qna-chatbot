export type PrivacyAssessment = {
  hasTopic: boolean;
  hasSensitiveValue: boolean;
  shouldSave: boolean;
  shouldSendToLlm: boolean;
};

const topicPattern = /개인정보|개인 정보|비밀번호|패스워드|인증키|api\s*key|apikey|토큰|주민등록번호|전화번호|이메일|로그인 정보/i;
const valuePatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /(?<!\d)(?:(?:01[016789]|02|0[3-6][1-5])[- .]?\d{3,4}[- .]?\d{4})(?!\d)/,
  /(?<!\d)\d{6}[- .]?[1-4]\d{6}(?!\d)/,
  /((?:api[_ -]?key|access[_ -]?key|인증키|비밀번호|패스워드|token|토큰)\s*[:=])\s*[^\s,;]+/i,
  /\bBearer\s+[A-Za-z0-9._-]{12,}\b/i,
  /\b(?:sk|AIza)[-_][A-Za-z0-9_-]{12,}\b/i,
];

export function assessPrivacy(value: string): PrivacyAssessment {
  const text = String(value || "").trim();
  const hasSensitiveValue = valuePatterns.some((pattern) => pattern.test(text));
  return {
    hasTopic: topicPattern.test(text),
    hasSensitiveValue,
    shouldSave: !hasSensitiveValue,
    shouldSendToLlm: !hasSensitiveValue,
  };
}

export function containsSensitiveValue(value: string) {
  return assessPrivacy(value).hasSensitiveValue;
}

export function redactSensitive(value: string) {
  return String(value || "")
    .replace(valuePatterns[0], "[이메일 마스킹]")
    .replace(valuePatterns[1], "[전화번호 마스킹]")
    .replace(valuePatterns[2], "[주민등록번호 마스킹]")
    .replace(valuePatterns[3], "$1: [민감정보 마스킹]")
    .replace(valuePatterns[4], "Bearer [토큰 마스킹]")
    .replace(valuePatterns[5], "[토큰 마스킹]");
}
