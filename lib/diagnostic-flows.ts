import type { PageType } from "./page-context";
import { detectSupportIssues } from "./support-routing";
import type { SupportIssueKind } from "./support-case";

export type DiagnosticKind = SupportIssueKind | "API_ERROR";
export type DiagnosticOption = { label: string; question: string };
export type DiagnosticFlow = { kind: DiagnosticKind; title: string; options: DiagnosticOption[] };

export function detectDiagnosticKind(question: string, pageType: PageType): DiagnosticKind | null {
  const text = question.toLowerCase();
  if ((pageType === "OPEN_API" && /(안|오류|에러|문제|인증키)/.test(text)) || /api.*(안|오류|에러|문제)|인증키/.test(text)) return "API_ERROR";
  const supportIssue = detectSupportIssues(question)[0];
  if (supportIssue) return supportIssue;
  if (/검색결과|검색이 안|결과가 없|검색 안|검색이 되지|검색 버튼/.test(text) && (pageType === "NEWS_SEARCH" || /검색|결과/.test(text))) return "SEARCH_NO_RESULT";
  const downloadCue = /다운로드|내려받|엑셀|excel|csv|파일/.test(text);
  const downloadProblemCue = /안\s*(?:돼|되|보여|나와|열려|됨)|않|오류|에러|실패|문제|이상|막혀|작동|반응|못\s*(?:받|열)|열리지|깨져|끊겨|멈춰|0\s*건/.test(text);
  if (downloadCue && downloadProblemCue) return "DOWNLOAD_PROBLEM";
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
  if (kind === "SEARCH_FILTER_PROBLEM") return { kind, title: "검색 필터와 조건을 함께 확인해 볼게요.", options: [
    { label: "기간 조건 확인", question: "검색 기간 필터가 적용되지 않아요" },
    { label: "언론사 조건 확인", question: "언론사 필터가 이상해요" },
    { label: "검색조건 다시 보기", question: "검색조건을 어떻게 설정하나요?" },
  ] };
  if (kind === "AUDIO_PLAYBACK_PROBLEM") return { kind, title: "오디오 재생 문제를 확인해 볼게요.", options: [
    { label: "재생이 안 돼요", question: "오디오 재생이 안 돼요" },
    { label: "소리가 끊겨요", question: "오디오 소리가 끊겨요" },
  ] };
  if (kind === "MEMBERSHIP_EMAIL_PROBLEM") return { kind, title: "회원가입·이메일 문제를 확인해 볼게요.", options: [
    { label: "인증메일이 안 와요", question: "회원가입 인증메일이 오지 않아요" },
    { label: "이메일 변경", question: "회원 이메일을 변경하고 싶어요" },
  ] };
  if (kind === "ACCOUNT_PROBLEM") return { kind, title: "계정·로그인 문제를 확인해 볼게요.", options: [
    { label: "로그인이 안 돼요", question: "로그인이 되지 않아요" },
    { label: "비밀번호 문제", question: "비밀번호를 잊어버렸어요" },
  ] };
  if (kind === "RIGHTS_LICENSE") return { kind, title: "저작권·이용권 문의로 분류했어요.", options: [
    { label: "저작권 안내", question: "기사 저작권과 이용 기준을 알려줘" },
    { label: "원문 이용 문의", question: "기사 원문 이용권은 어떻게 확인하나요?" },
  ] };
  if (kind === "RIGHTS_RESEARCH") return { kind, title: "연구·학술 이용 문의로 분류했어요.", options: [
    { label: "연구 활용 기준", question: "연구 목적으로 빅카인즈 자료를 이용할 수 있나요?" },
    { label: "출처 표기", question: "논문에 빅카인즈 자료를 인용할 때 출처를 어떻게 표기하나요?" },
  ] };
  return { kind, title: "API 문제 유형을 선택해 주세요.", options: [
    { label: "신청 방법", question: "OPEN API 신청 방법" },
    { label: "인증키 문제", question: "API 인증키가 작동하지 않아요" },
    { label: "호출 오류", question: "API 호출 오류가 발생했어요" },
  ] };
}
