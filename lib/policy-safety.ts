export type PolicyHandoffKind =
  | "COMMERCIAL_USE"
  | "NEWS_COPYRIGHT"
  | "API_CONTRACT_OR_FEES"
  | "AI_REUSE"
  | "RESEARCH_LICENSE";

export type PolicyHandoff = {
  kind: PolicyHandoffKind;
  label: string;
  guidance: string;
  url: string;
};

const OFFICIAL_QNA_URL = "https://www.bigkinds.or.kr/news/qnaList.do";

const policyRules: Array<{ kind: PolicyHandoffKind; label: string; pattern: RegExp; guidance: string }> = [
  {
    kind: "API_CONTRACT_OR_FEES",
    label: "API 계약·요금",
    pattern: /(?:open\s*api|openapi|\bapi\b).{0,32}(?:요금|가격|비용|과금|계약|구매|기간|유료)|(?:요금|가격|비용|과금|계약|구매|기간|유료).{0,32}(?:open\s*api|openapi|\bapi\b)/i,
    guidance: "최신 요금·계약·사용량 조건은 뉴스스토어의 공식 신청·안내 채널에서 확인해 주세요. 구매나 계약이 필요한 경우 담당자가 현재 조건을 안내합니다.",
  },
  {
    kind: "NEWS_COPYRIGHT",
    label: "뉴스 저작권·이용권",
    pattern: /뉴스\s*저작권|기사\s*저작권|저작권|이용권|라이선스|라이센스|원문\s*(?:이용|제공|다운로드)|기사\s*(?:원문|본문).{0,24}(?:이용|사용|다운로드|배포)|(?:복제|배포).{0,24}(?:기사|뉴스|원문)/i,
    guidance: "기사 원문·본문의 이용 범위와 제공 방식은 저작권자 및 공식 이용 조건 확인이 필요합니다. 사용 목적과 필요한 범위를 정리해 공식 Q&A 또는 담당자에게 문의해 주세요.",
  },
  {
    kind: "AI_REUSE",
    label: "AI 재이용",
    pattern: /(?:ai|인공지능|rag|검색증강|모델|학습).{0,28}(?:재이용|재사용|학습|저장|가공|배포|서비스화|상업)|(?:재이용|재사용|학습|저장|가공|배포|서비스화|상업).{0,28}(?:ai|인공지능|rag|검색증강|모델)|(?:ai|인공지능)\s*요약.{0,28}(?:제공|판매|배포|서비스화|회원)|(?:제공|판매|배포|서비스화|회원).{0,28}(?:ai|인공지능)\s*요약/i,
    guidance: "뉴스 데이터의 AI 학습·저장·가공·재배포·서비스화 가능 여부는 이용 목적과 범위에 따라 검토가 필요합니다. 허용 여부를 추정하지 말고 공식 담당자에게 사용 목적과 범위를 확인해 주세요.",
  },
  {
    kind: "RESEARCH_LICENSE",
    label: "연구 목적 라이선스",
    pattern: /(?:연구|학술|논문|대학|연구자).{0,32}(?:라이선스|이용권|사용|원문|반출|제공|이용|분석)|(?:라이선스|이용권).{0,32}(?:연구|학술|논문)/i,
    guidance: "연구 목적이라도 원문 제공 방식, 반출·보관 범위, 인용과 2차 활용 조건을 확인해야 합니다. 연구 목적과 필요한 자료 범위를 정리해 공식 담당자에게 문의해 주세요.",
  },
  {
    kind: "COMMERCIAL_USE",
    label: "상업적 이용",
    pattern: /상업적(?:으로)?\s*이용|영리\s*(?:이용|목적)|유료\s*(?:회원|서비스|제공)|판매(?:용|를)?|수익(?:화|을)|서비스화|사업(?:용|적)/i,
    guidance: "상업적 이용·서비스화 가능 여부는 계약과 권리 범위에 따라 달라질 수 있습니다. 허용 여부나 조건을 추정하지 말고 사용 목적과 공개 범위를 공식 담당자에게 확인해 주세요.",
  },
];

export function getPolicyHandoff(question: string): PolicyHandoff | null {
  const clean = question.trim();
  if (!clean) return null;
  const rule = policyRules.find(({ pattern }) => pattern.test(clean));
  return rule ? { ...rule, url: OFFICIAL_QNA_URL } : null;
}

export function isPolicyHandoffQuestion(question: string) {
  return getPolicyHandoff(question) !== null;
}

export function policyAnswerMode(question: string) {
  return isPolicyHandoffQuestion(question) ? "HANDOFF_ONLY" as const : "USER_FACING" as const;
}
