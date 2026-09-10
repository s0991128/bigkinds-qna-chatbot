(function () {
  const kb = window.BIGKINDS_KNOWLEDGE_BASE = window.BIGKINDS_KNOWLEDGE_BASE || { documents: [] };
  const document = {
    id: "bigkinds-canonical-historical-page-lookup",
    title: "과거 기사·지면 자료 찾기 안내",
    question: "과거 신문의 특정 지면이나 명단 자료를 찾으려면 어떻게 하나요?",
    questions: ["옛날 신문 지면을 찾고 싶어요", "과거 신문의 명단 자료를 확인하고 싶어요"],
    category: "과거 기사·자료 찾기",
    keywords: ["과거 기사", "신문 지면", "명단", "박스", "원지면", "언론사 열람", "기사 찾기"],
    answer: "BIGKinds는 협약 언론사로부터 제공받은 기사 데이터를 기반으로 서비스합니다. 과거 신문의 모든 지면, 지면 내 별도 박스, 명단 등의 내용이 검색되지 않을 수 있습니다. 정확한 원지면 확인이 필요한 경우 해당 언론사에 해당 일자·지면의 열람 가능 여부를 문의할 수 있습니다.",
    facts: ["특정 검색조건에서 결과가 없더라도 자료의 존재 여부를 단정하지 않음", "정확한 원지면 확인은 해당 언론사 열람 가능 여부 문의를 권장할 수 있음"],
    source: { label: "빅카인즈 과거 기사·지면 자료 안내", url: "https://www.bigkinds.or.kr/v2/intro/index.do" },
    sourceType: "CURRENT_OFFICIAL_INTRO",
    authority: "CURRENT_CANONICAL",
    status: "CURRENT",
    effectiveDate: "2026-09-09"
  };
  if (!kb.documents.some((item) => item.id === document.id)) kb.documents.push(document);
})();
