window.BIGKINDS_CHATBOT_CONFIG = {
  serviceName: "빅카인즈 챗봇",
  assistantName: "빅카인즈 이용안내",
  welcomeMessage:
    "안녕하세요. 빅카인즈 뉴스 검색·분석, Open API, 요금·정책 및 이용방법을 안내해 드립니다.",
  notice:
    "빅카인즈 공식 FAQ와 Q&A를 기준으로 안내합니다. 확인이 필요한 사항은 담당자 문의로 연결해 드립니다.",
  theme: {
    primary: "#008bd2",
    accent: "#f2c200"
  },
  suggestions: [
    "뉴스 검색·분석은 어떻게 이용하나요?",
    "Open API 서비스는 어떻게 신청하나요?",
    "API 이용요금과 정책이 궁금합니다.",
    "개인정보와 인증키를 입력해도 되나요?"
  ],
  search: {
    minConfidence: 0.2,
    escalationConfidence: 0.13,
    maxSources: 3
  },
  escalation: {
    enabled: true,
    label: "담당자 안내",
    message:
      "요금·계약·권한 등 정확한 확인이 필요한 사항은 담당자에게 문의해 주세요.",
    contactUrl: "https://www.newstore.or.kr/",
    contactLabel: "빅카인즈 안내",
    purchaseRequestUrl: "https://forms.gle/mb1d4jSFLhUnoSzv6",
    purchaseRequestLabel: "API 구매 요청",
    phone: "02-2001-7574",
    businessHours: "평일 09:00~18:00"
  },
  privacy: {
    warning:
      "개인정보, 비밀번호, 인증키 등 민감한 정보는 입력하지 마세요.",
    blockedPatterns: ["주민등록번호", "비밀번호", "api key", "apikey", "인증키"]
  },
  ai: {
    enabled: false,
    proxyEndpoint: "/api/chat",
    timeoutMs: 12000
  }
};

