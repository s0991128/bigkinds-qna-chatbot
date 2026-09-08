import type { PageType } from "./page-context";

export type DiagnosticKind = "SEARCH_NO_RESULT" | "DOWNLOAD_PROBLEM" | "API_ERROR";
export type DiagnosticOption = { label: string; question: string };
export type DiagnosticFlow = { kind: DiagnosticKind; title: string; options: DiagnosticOption[] };

export function detectDiagnosticKind(question: string, pageType: PageType): DiagnosticKind | null {
  const text = question.toLowerCase();
  if (/검색결과|검색이 안|결과가 없|검색 안|검색이 되지|검색 버튼/.test(text) && (pageType === "NEWS_SEARCH" || /검색|결과/.test(text))) return "SEARCH_NO_RESULT";
  if (/다운로드|내려받|엑셀|파일.*안/.test(text)) return "DOWNLOAD_PROBLEM";
  if ((pageType === "OPEN_API" && /(안|오류|에러|문제|인증키)/.test(text)) || /api.*(안|오류|에러|문제)|인증키/.test(text)) return "API_ERROR";
  return null;
}

export function getDiagnosticFlow(kind: DiagnosticKind): DiagnosticFlow {
  if (kind === "SEARCH_NO_RESULT") return { kind, title: "어떤 문제가 발생했나요?", options: [
    { label: "검색결과가 0건이에요", question: "검색결과가 0건일 때 어떻게 해결하나요?" },
    { label: "결과가 너무 많아요", question: "검색결과가 너무 많을 때 어떻게 줄이나요?" },
    { label: "원하는 기사만 나오지 않아요", question: "원하는 기사만 검색되지 않아요" },
    { label: "검색식을 모르겠어요", question: "검색식과 연산자는 어떻게 쓰나요?" },
    { label: "검색 버튼이 작동하지 않아요", question: "검색 버튼이 작동하지 않아요" },
  ] };
  if (kind === "DOWNLOAD_PROBLEM") return { kind, title: "다운로드 문제를 조금 더 확인해 볼게요.", options: [
    { label: "다운로드 버튼이 안 보여요", question: "다운로드 버튼이 보이지 않아요" },
    { label: "눌러도 반응이 없어요", question: "다운로드 버튼을 눌러도 반응이 없어요" },
    { label: "파일이 열리지 않아요", question: "다운로드한 파일이 열리지 않아요" },
    { label: "다운로드 범위가 궁금해요", question: "다운로드할 때 기사 본문 전체를 받을 수 있나요?" },
  ] };
  return { kind, title: "API 문제 유형을 선택해 주세요.", options: [
    { label: "신청 방법", question: "OPEN API 신청 방법" },
    { label: "인증키 문제", question: "API 인증키가 작동하지 않아요" },
    { label: "호출 오류", question: "API 호출 오류가 발생했어요" },
  ] };
}
