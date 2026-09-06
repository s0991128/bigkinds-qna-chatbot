window.BIGKINDS_CHATBOT_CONFIG = {
  serviceName: "빅카인즈 Q&A",
  assistantName: "빅카인즈 공식 Q&A",
  welcomeMessage:
    "안녕하세요. 빅카인즈 공식 문서를 바탕으로 뉴스 검색·분석 이용 방법을 안내해 드립니다. 기사 원문 검색·요약은 지원하지 않습니다.",
  notice:
    "빅카인즈 공식 FAQ와 Q&A를 기준으로 안내합니다. 확인이 필요한 사항은 담당자 문의로 연결해 드립니다.",
  theme: {
    primary: "#008bd2",
    accent: "#f2c200"
  },
  suggestions: [
    "뉴스 검색·분석 이용 방법이 궁금합니다.",
    "검색식을 어떻게 만들 수 있나요?",
    "OPEN API 문의는 어디로 하나요?"
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
    contactUrl: "https://www.bigkinds.or.kr/news/qnaList.do",
    contactLabel: "공식 Q&A 문의",
    purchaseRequestUrl: "https://www.newstore.or.kr/store/prodct/newsdata/list.do",
    purchaseRequestLabel: "뉴스토어에서 OPEN API 문의"
  },
  privacy: {
    warning:
      "개인정보, 비밀번호, 인증키 등 민감한 정보는 입력하지 마세요.",
    blockedPatterns: ["주민등록번호", "비밀번호", "api key", "apikey", "인증키"]
  },
};

