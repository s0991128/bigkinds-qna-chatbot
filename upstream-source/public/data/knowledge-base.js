window.BIGKINDS_KNOWLEDGE_BASE = {
  schemaVersion: "2.0",
  updatedAt: "2026-09-06",
  disclaimer:
    "빅카인즈 공식 FAQ·Q&A·소개 자료를 바탕으로 만든 지식베이스입니다. 정책·요금·계약·권한은 공식 원문과 담당자 확인이 필요합니다.",
  synonyms: {
    openapi: ["open api", "api", "오픈api"],
    api: ["open api", "openapi", "인터페이스"],
    검색: ["찾기", "조회", "찾아보기"],
    데이터: ["기사", "뉴스", "원문", "문서"],
    오류: ["에러", "문제", "실패", "장애"],
    호출: ["요청", "request", "call"]
  },
  // Documents are appended from the canonical source files below.
  documents: []
};

(function mergeOfficialSources() {
  const kb = window.BIGKINDS_KNOWLEDGE_BASE;
  const officialFaq = Array.isArray(window.BIGKINDS_OFFICIAL_FAQ)
    ? window.BIGKINDS_OFFICIAL_FAQ
    : [];
  const importedQna = Array.isArray(window.BIGKINDS_IMPORTED_QNA)
    ? window.BIGKINDS_IMPORTED_QNA
    : [];

  const makeKeywords = (text) =>
    Array.from(
      new Set((String(text).match(/[A-Za-z0-9가-힣]+/g) || []).map((word) => word.toLowerCase()))
    ).slice(0, 12);

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
      url: "https://www.bigkinds.or.kr/news/faqList.do",
      pages: `FAQ ${item.id}`
    },
    authority: "OFFICIAL_FAQ",
    status: item.requiresReview ? "REVIEW_REQUIRED" : "CURRENT",
    reviewClass: item.requiresReview ? "STATIC_ONLY" : "HUMAN_REVIEWED",
    requiresReview: Boolean(item.requiresReview)
  }));

  const qnaDocuments = importedQna.map((item) => ({
    ...item,
    authority: "HISTORICAL_QNA",
    status: "REVIEW_REQUIRED",
    reviewClass: "STATIC_ONLY",
    requiresReview: true
  }));

  const existingIds = new Set();
  for (const document of [...faqDocuments, ...qnaDocuments]) {
    if (!document.id || existingIds.has(document.id)) continue;
    kb.documents.push(document);
    existingIds.add(document.id);
  }
  kb.disclaimer =
    "빅카인즈 공식 FAQ·Q&A·소개 자료를 바탕으로 만든 지식베이스입니다. 검토되지 않은 Q&A와 정책 요약은 참고 후보로만 사용하며, 중요한 판단은 공식 원문을 확인해 주세요.";
})();
