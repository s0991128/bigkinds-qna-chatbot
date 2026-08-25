window.BIGKINDS_CHATBOT_CONFIG = {
  serviceName: "빅카인즈 챗봇",
  assistantName: "빅카인즈 안내봇",
  welcomeMessage:
    "안녕하세요. 빅카인즈 이용방법, 검색, 뉴스데이터, Open API, 요금과 정책 관련 공식 안내를 도와드립니다.",
  notice:
    "답변은 공식 자료와 검증된 정책을 우선합니다. 근거가 부족하면 담당자 안내로 전환합니다.",
  theme: {
    primary: "#2457d6",
    accent: "#18a77b"
  },
  suggestions: [
    "빅카인즈 뉴스는 어떻게 검색하나요?",
    "Open API는 어떻게 신청하나요?",
    "API 요금은 얼마인가요?",
    "개인정보를 입력해도 되나요?"
  ],
  search: {
    minConfidence: 0.2,
    escalationConfidence: 0.13,
    maxSources: 3
  },
  escalation: {
    enabled: true,
    label: "담당자 이관",
    message:
      "요금, 계약, 권한, 정책 경계가 필요한 질문은 담당자 확인이 필요합니다.",
    contactUrl: "https://www.newstore.or.kr/",
    contactLabel: "빅카인즈 안내",
    purchaseRequestUrl: "https://forms.gle/mb1d4jSFLhUnoSzv6",
    purchaseRequestLabel: "API 구매 요청",
    phone: "02-2001-7793",
    businessHours: "평일 09:00~18:00"
  },
  privacy: {
    warning:
      "주민등록번호, 비밀번호, 인증키, 전화번호 등 민감한 정보는 입력하지 마세요.",
    blockedPatterns: ["주민등록번호", "비밀번호", "api key", "apikey", "인증키"]
  },
  ai: {
    enabled: false,
    proxyEndpoint: "/api/chat",
    timeoutMs: 12000
  }
};

