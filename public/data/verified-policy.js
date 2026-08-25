window.BIGKINDS_VERIFIED_POLICY = [
  {
    id: "api-purchase-official",
    category: "Open API 신청",
    title: "빅카인즈 API 구매·신청 방법",
    questions: [
      "Open API는 어떻게 신청하나요?",
      "API는 어디서 구매하나요?",
      "API 신청 방법을 알려주세요."
    ],
    keywords: [
      "api",
      "openapi",
      "open api",
      "신청",
      "구매",
      "문의",
      "계약",
      "newstore",
      "forms",
      "요금"
    ],
    answer:
      "빅카인즈 API는 공식 안내 채널에서 신청합니다. 요금과 계약 조건을 먼저 확인한 뒤, 구매 요청 폼을 제출하면 담당자가 안내합니다. 기준일은 2026-01-01이며, 별도 안내가 없으면 2026-12-31까지는 기존 요금이 유지되는 것으로 설명할 수 있습니다. 200만 건 초과 사용이나 상세한 계약 조건은 담당자 확인이 필요합니다. 문의는 newstore.or.kr, 구매 요청은 forms.gle/mb1d4jSFLhUnoSzv6, 전화는 02-2001-7793, 평일 09:00~18:00입니다.",
    facts: [
      "구매 요청 폼: https://forms.gle/mb1d4jSFLhUnoSzv6",
      "문의처: https://www.newstore.or.kr/",
      "전화: 02-2001-7793"
    ],
    steps: [
      "사용 목적과 범위를 정리합니다.",
      "공식 신청 채널로 문의합니다.",
      "안내에 따라 계약과 사용 범위를 확인합니다."
    ],
    effectiveDate: "2026-01-01",
    source: {
      label: "빅카인즈 API 요금 계획",
      pages: "1-2"
    },
    requiresReview: false,
    alwaysEscalate: true,
    escalationTags: ["계약", "요금", "구매", "사용량"]
  },
  {
    id: "api-operational-limits",
    category: "Open API 운영",
    title: "API 조회·호출 제한",
    questions: [
      "API를 Python으로 자동 조회해도 되나요?",
      "API 일일 호출 제한이 있나요?",
      "몇 건까지 조회할 수 있나요?"
    ],
    keywords: [
      "api",
      "python",
      "자동",
      "호출",
      "제한",
      "10000",
      "20000",
      "검색",
      "연산"
    ],
    answer:
      "API 호출에는 운영 제한이 있을 수 있습니다. 안내 예시로 1일 조회 건수는 10,000건, 페이지당 반환 수는 20,000건이며, 실제 한도는 운영 정책 기준일과 이용 조건에 따라 확인해야 합니다. 대량 호출이나 반복 호출은 제한될 수 있으므로 검색 조건을 좁혀 요청하고, 과도한 트래픽이 필요한 경우에는 담당자와 먼저 협의해 주세요.",
    facts: [
      "1일 조회 건수 예시: 10,000",
      "페이지당 반환 수 예시: 20,000",
      "반복 호출이나 대량 호출은 제한될 수 있음"
    ],
    steps: [
      "요청 범위를 먼저 좁힙니다.",
      "조건을 조정해 반환량을 줄입니다.",
      "대량 호출이 필요하면 담당자와 협의합니다."
    ],
    effectiveDate: "2026-07-06",
    source: {
      label: "빅카인즈 OpenAPI 이용자 가이드",
      pages: "6-12"
    },
    requiresReview: false,
    escalationTags: ["대량", "자동", "반복", "호출"]
  },
  {
    id: "api-data-use-boundaries",
    category: "데이터 이용",
    title: "API 데이터의 AI·재배포 이용 경계",
    questions: [
      "API 데이터를 AI 학습에 써도 되나요?",
      "검색 결과를 DB에 저장해도 되나요?",
      "RAG에 활용해도 되나요?"
    ],
    keywords: [
      "api",
      "ai",
      "rag",
      "db",
      "저장",
      "학습",
      "재배포",
      "가공",
      "재이용"
    ],
    answer:
      "API 데이터의 AI 학습, 대량 저장, 재배포, 영리 목적의 2차 가공은 별도 정책 검토가 필요합니다. 단순 내부 검증과 외부 서비스 제공은 다르게 다뤄질 수 있으므로, 사용 목적과 범위를 먼저 확인해 주세요. 대외 공개나 서비스화가 포함되면 담당자 확인이 기본입니다.",
    effectiveDate: "2026-07-06",
    source: {
      label: "빅카인즈 분설 API 이용 제한 요약",
      pages: "1-2"
    },
    requiresReview: false,
    alwaysEscalate: true
  },
  {
    id: "academic-research-data",
    category: "학술·연구",
    title: "학술 연구용 기사 데이터 이용",
    questions: [
      "논문 연구용으로 기사 데이터를 받을 수 있나요?",
      "대학원 연구에 활용 가능한가요?",
      "학술 목적 사용 범위가 궁금합니다."
    ],
    keywords: [
      "학술",
      "연구",
      "논문",
      "대학원",
      "기사",
      "데이터",
      "목적",
      "범위"
    ],
    answer:
      "학술·연구 목적은 일반 상업 이용과 다르게 검토될 수 있습니다. 기사 원문 제공 방식, 기간 조건, 반출 방식, 2차 활용 범위가 달라질 수 있으므로 연구 목적을 먼저 설명해 주세요. 필요하면 담당자가 적합한 이용 방식을 안내합니다.",
    facts: [
      "연구 목적은 사전 확인이 필요할 수 있음",
      "대량 반출은 별도 조건이 있을 수 있음"
    ],
    effectiveDate: "2026-06-30",
    source: {
      label: "빅카인즈 연구용 활용 기준",
      pages: "1-2"
    },
    requiresReview: false,
    escalationTags: ["연구", "논문", "대학원"]
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
];

