window.BIGKINDS_KNOWLEDGE_BASE = {
  schemaVersion: "1.0",
  updatedAt: "2026-08-25",
  disclaimer:
    "이 데이터셋은 공식 FAQ, 검증 정책, 내부 검색용 기초 문서를 합쳐 만든 챗봇 지식베이스입니다.",
  synonyms: {
    openapi: ["open api", "api", "오픈api"],
    api: ["open api", "openapi", "인터페이스"],
    요금: ["가격", "비용", "유료", "과금", "결제"],
    신청: ["구매", "등록", "계약", "문의"],
    검색: ["찾기", "조회", "찾아보기"],
    데이터: ["기사", "뉴스", "원문", "문서"],
    오류: ["에러", "문제", "실패", "장애"],
    호출: ["요청", "request", "call"]
  },
  documents: [
    {
      id: "api-pricing",
      category: "API 요금·정책",
      title: "Open API 요금과 기본 안내",
      questions: [
        "API 요금이 어떻게 되나요?",
        "API 가격이 궁금합니다.",
        "Open API 요금 정책을 알려주세요."
      ],
      keywords: ["api", "open api", "openapi", "요금", "가격", "비용", "무료", "유료"],
      answer:
        "빅카인즈 API 요금은 기준일과 사용량, 계약 조건에 따라 달라질 수 있습니다. 공개된 기준이 있으면 그 범위 안에서 안내하고, 세부 금액이나 계약 조건이 필요한 경우 담당자 확인이 필요합니다. 2026-01-01 기준으로 안내된 범위가 있고, 2026-12-31까지는 기존 조건이 유지될 수 있다는 식으로 설명할 수 있습니다. 예시 안내에서는 50% 할인 여부와 200만 건 초과 이용 같은 조건도 함께 확인합니다.",
      facts: [
        "기준일 예시: 2026-01-01",
        "유지 가능 기간 예시: 2026-12-31",
        "예시 요금표: 11,270원",
        "예시 할인율: 50%",
        "200만 건 초과 사용은 별도 협의 필요",
        "사용량과 계약 조건에 따라 달라질 수 있음"
      ],
      steps: [
        "이용 목적을 정리합니다.",
        "공식 정책 범위를 확인합니다.",
        "금액이나 계약이 필요하면 담당자에게 이관합니다."
      ],
      effectiveDate: "2026-01-01",
      source: {
        label: "빅카인즈 API 요금 계획",
        pages: "1-2"
      },
      requiresReview: false,
      escalationTags: ["계약", "요금", "비용", "결제"]
    },
    {
      id: "api-application",
      category: "Open API",
      title: "Open API 신청 절차",
      questions: [
        "Open API는 어떻게 신청하나요?",
        "API 사용을 시작하려면 무엇이 필요한가요?"
      ],
      keywords: ["api", "open api", "신청", "사용", "계약", "문의", "등록"],
      answer:
        "Open API는 공식 안내 채널에서 신청합니다. 사용 목적, 예상 사용량, 계약 필요 여부를 정리한 뒤 신청하면 담당자가 안내합니다. 인증키와 접근 권한은 신청 후 제공될 수 있으므로, 공개 채널에 입력하지 마세요.",
      steps: [
        "사용 목적과 범위를 정리합니다.",
        "공식 신청 채널로 문의합니다.",
        "안내에 따라 계약과 인증 절차를 진행합니다."
      ],
      effectiveDate: "2026-08-12",
      source: {
        label: "빅카인즈 공식 FAQ 및 신청 안내",
        pages: "FAQ 2026-08-12"
      },
      requiresReview: false,
      alwaysEscalate: true
    },
    {
      id: "api-errors",
      category: "Open API",
      title: "Open API 오류 확인",
      questions: [
        "API 호출 오류가 납니다.",
        "응답 코드가 실패로 나와요.",
        "JSON 형식이 맞는지 확인하고 싶어요."
      ],
      keywords: ["api", "오류", "에러", "호출", "응답", "json", "https", "utf-8"],
      answer:
        "API 요청은 HTTPS POST와 UTF-8 JSON 구조를 기준으로 합니다. 오류가 나면 요청 URL, 인증키, 파라미터 이름, 인코딩, 응답 코드를 순서대로 확인해 주세요. 서버 장애나 제한 초과가 의심되면 담당자 확인이 필요합니다.",
      steps: [
        "요청 URL과 메서드를 확인합니다.",
        "Content-Type과 JSON 형식을 확인합니다.",
        "인증키와 파라미터 이름을 점검합니다.",
        "지속되면 오류 메시지와 함께 문의합니다."
      ],
      effectiveDate: "2026-07-28",
      source: {
        label: "빅카인즈 OpenAPI 이용자 가이드",
        pages: "5"
      },
      requiresReview: false,
      escalationTags: ["500", "장애", "반복", "응답 실패"]
    },
    {
      id: "data-coverage",
      category: "데이터 범위",
      title: "데이터 제공 범위",
      questions: [
        "어떤 뉴스가 제공되나요?",
        "기사 원문을 모두 받을 수 있나요?"
      ],
      keywords: ["데이터", "범위", "기사", "원문", "제공", "기간", "수집"],
      answer:
        "데이터 제공 범위는 기사 원문, 메타데이터, 수집 시점, 제공 정책에 따라 달라집니다. 원문 전체가 아닌 일부 필드만 제공될 수 있으며, 특정 언론사나 기간은 별도 조건이 있을 수 있습니다.",
      facts: [
        "제공 범위는 문서 유형에 따라 다를 수 있음",
        "원문 전체 제공이 아닐 수 있음",
        "기간 조건은 검색 화면에서 확인"
      ],
      steps: [
        "필요한 데이터 종류를 정합니다.",
        "원문, 메타데이터, 기간을 구분합니다.",
        "특정 언론사나 기간은 담당자에게 확인합니다."
      ],
      effectiveDate: "2026-07-28",
      source: {
        label: "OpenAPI 이용자 가이드 및 데이터 제공 기준",
        pages: "6-12"
      },
      requiresReview: false,
      escalationTags: ["언론사", "기간", "원문", "제공 범위"]
    },
    {
      id: "news-search",
      category: "이용방법",
      title: "뉴스 검색 기본 방법",
      questions: [
        "빅카인즈에서 뉴스를 어떻게 검색하나요?",
        "검색어를 어떻게 넣어야 하나요?"
      ],
      keywords: ["뉴스", "검색", "키워드", "기간", "조건", "결과"],
      answer:
        "검색어를 먼저 넣고, 기간과 언론사 조건을 좁혀 가면서 결과를 확인하면 됩니다. 결과가 너무 많으면 제외 키워드를 추가하고, 너무 적으면 조건을 풀어 보세요.",
      steps: [
        "핵심 키워드를 입력합니다.",
        "기간 조건을 설정합니다.",
        "결과를 보고 조건을 보정합니다."
      ],
      effectiveDate: "2026-08-21",
      source: {
        label: "빅카인즈 공식 FAQ",
        pages: "FAQ 17, 25"
      },
      requiresReview: false
    },
    {
      id: "api-search-parameters",
      category: "Open API",
      title: "뉴스 검색 API 주요 파라미터",
      questions: [
        "검색 API는 어떻게 쓰나요?",
        "return_size 최대값이 궁금합니다."
      ],
      keywords: [
        "api",
        "검색",
        "파라미터",
        "return_from",
        "return_size",
        "fields",
        "published_at",
        "query"
      ],
      answer:
        "뉴스 검색 API는 검색어와 기간 조건을 함께 사용합니다. 요청 파라미터는 공식 가이드의 형식을 따르며, 반환 크기와 필드 선택은 제한이 있을 수 있습니다. 정확한 제한은 최신 문서를 확인해 주세요.",
      facts: [
        "검색 기간은 from과 until로 설정합니다.",
        "반환 크기에는 제한이 있을 수 있습니다.",
        "필드 선택은 필요한 항목만 지정하는 것이 좋습니다."
      ],
      effectiveDate: "2026-07-28",
      source: {
        label: "빅카인즈 OpenAPI 이용자 가이드",
        pages: "6-12"
      },
      requiresReview: false
    },
    {
      id: "api-services",
      category: "Open API",
      title: "제공되는 OpenAPI 종류",
      questions: [
        "어떤 API가 있나요?",
        "사용 가능한 OpenAPI 목록이 궁금합니다."
      ],
      keywords: ["api", "종류", "목록", "검색", "변경", "추가", "제공"],
      answer:
        "빅카인즈는 검색, 변경 이력, 분야별 조회 등 여러 OpenAPI를 제공합니다. 제공 목록은 버전에 따라 변동될 수 있으므로 최신 가이드를 확인해 주세요.",
      facts: [
        "OpenAPI 목록은 버전별로 다를 수 있음",
        "변경 이력 조회 API가 포함될 수 있음"
      ],
      effectiveDate: "2026-07-28",
      source: {
        label: "빅카인즈 OpenAPI 이용자 가이드",
        pages: "3-4, 37-38"
      },
      requiresReview: false
    },
    {
      id: "api-ai-use-restriction",
      category: "정책",
      title: "API 데이터의 AI 활용 제한",
      questions: [
        "API 데이터를 AI에 써도 되나요?",
        "RAG에 활용할 수 있나요?"
      ],
      keywords: ["api", "ai", "rag", "학습", "활용", "제한", "정책"],
      answer:
        "API 데이터는 AI 학습, 모델 구축, 대량 재가공 등으로 사용할 때 정책 검토가 필요합니다. 단순 내부 검증과 외부 서비스 제공은 다르게 다뤄질 수 있으니, 목적을 먼저 확인해 주세요.",
      effectiveDate: "2026-01-01",
      source: {
        label: "빅카인즈 분설 API 요금·정책 요약",
        pages: "1-2"
      },
      requiresReview: false,
      alwaysEscalate: true
    },
    {
      id: "privacy-security",
      category: "개인정보·보안",
      title: "민감 정보 입력 주의",
      questions: [
        "비밀번호를 입력해도 되나요?",
        "인증키를 붙여 넣어도 되나요?"
      ],
      keywords: ["개인정보", "보안", "비밀번호", "인증키", "민감", "주의"],
      answer:
        "채팅에는 비밀번호, 인증키, 주민등록번호, 전화번호 같은 민감한 정보를 입력하지 마세요. 인증이 필요한 질문은 공식 담당자와 직접 확인해야 합니다.",
      steps: [
        "민감 정보는 즉시 삭제합니다.",
        "인증 관련 질문은 공식 채널로 이관합니다.",
        "개인정보 입력이 필요한 작업은 진행하지 않습니다."
      ],
      effectiveDate: "2026-08-21",
      source: {
        label: "개인정보 처리 및 보안 안내",
        url: "https://www.bigkinds.or.kr/"
      },
      requiresReview: true,
      alwaysEscalate: true
    },
    {
      id: "service-terms",
      category: "정책",
      title: "서비스 이용 약관과 변경 공지",
      questions: [
        "이용 약관은 어디서 보나요?",
        "정책 변경은 어떻게 확인하나요?"
      ],
      keywords: ["약관", "정책", "변경", "공지", "이용"],
      answer:
        "서비스 약관과 정책은 공식 공지에서 확인합니다. 중요한 변경은 사전 안내가 원칙이며, 최신 버전을 기준으로 판단해야 합니다.",
      effectiveDate: "2026-08-21",
      source: {
        label: "빅카인즈 운영 정책",
        pages: "공식 공지"
      },
      requiresReview: false
    }
  ]
};

(function mergeOfficialSources() {
  const kb = window.BIGKINDS_KNOWLEDGE_BASE;
  const officialFaq = Array.isArray(window.BIGKINDS_OFFICIAL_FAQ)
    ? window.BIGKINDS_OFFICIAL_FAQ
    : [];
  const verifiedPolicy = Array.isArray(window.BIGKINDS_VERIFIED_POLICY)
    ? window.BIGKINDS_VERIFIED_POLICY
    : [];
  const importedQna = Array.isArray(window.BIGKINDS_IMPORTED_QNA)
    ? window.BIGKINDS_IMPORTED_QNA
    : [];

  const makeKeywords = (text) =>
    Array.from(
      new Set((String(text).match(/[A-Za-z0-9가-힣]+/g) || []).map((word) => word.toLowerCase()))
    ).slice(0, 8);

  const faqDocuments = officialFaq.map((item) => ({
    id: `official-faq-${item.id}`,
    category: "공식 FAQ",
    title: item.title,
    questions: [item.title],
    keywords: makeKeywords(item.title),
    answer: item.answer,
    effectiveDate: item.date,
    source: {
      label: "빅카인즈 공식 FAQ",
      pages: `FAQ ${item.id}`
    },
    requiresReview: Boolean(item.requiresReview)
  }));

  const existingIds = new Set(kb.documents.map((document) => document.id));
  for (const document of [...verifiedPolicy, ...faqDocuments, ...importedQna]) {
    if (!existingIds.has(document.id)) {
      kb.documents.push(document);
      existingIds.add(document.id);
    }
  }

  kb.updatedAt = "2026-08-25";
  kb.disclaimer =
    "공식 FAQ, OpenAPI 이용 가이드, 검증된 정책을 바탕으로 만든 지식베이스입니다. 계약, 요금, 권한, 보안 경계가 필요한 질문은 담당자 확인이 필요합니다.";
})();

