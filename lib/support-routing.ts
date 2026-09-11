import { SUPPORT_ISSUE_KINDS, SupportIssueKind } from "./support-case";

const problemCue = /안\s*(?:돼|되|나와|보여|열려|됨)|않|오류|에러|실패|문제|이상|막혀|작동|반응|못\s*(?:찾|받|로그인|재생)|0\s*건|없어|안\s*옴|안\s*와|끊겨|멈춰/i;
const rightsCue = /저작권|이용권|라이선스|라이센스|사용권|복제|배포|상업적\s*이용|원문\s*(?:을|이|은|의)?\s*(?:이용|제공|다운로드)|(?:AI|인공지능)\s*(?:학습|재이용|재사용|가공|배포)/i;
const researchCue = /연구\s*(?:목적|용|에\s*사용)|논문|학술|인용|출처\s*(?:표기|기재)|연구자|연구\s*자료/i;

const detectors: Array<[SupportIssueKind, RegExp, boolean]> = [
  ["SEARCH_NO_RESULT", /검색결과|검색\s*결과|검색어|뉴스\s*검색/i, true],
  ["SEARCH_FILTER_PROBLEM", /필터|검색\s*조건|기간\s*(?:설정|필터)|언론사\s*(?:선택|필터)|정렬|조건/i, true],
  ["DOWNLOAD_PROBLEM", /다운로드|내려받|엑셀|excel|csv|파일s*(?:받|저장|열)/i, true],
  ["AUDIO_PLAYBACK_PROBLEM", /오디오|음성|듣기|재생|소리|낭독/i, true],
  ["MEMBERSHIP_EMAIL_PROBLEM", /회원가입|가입\s*(?:메일|이메일)|인증\s*메일|인증메일|이메일\s*(?:변경|인증|수신)|메일\s*(?:안|못|오류|수신)|로그인\s*메일/i, true],
  ["ACCOUNT_PROBLEM", /로그인|계정|회원|비밀번호|탈퇴|인증|접속/i, true],
  ["RIGHTS_LICENSE", rightsCue, false],
  ["RIGHTS_RESEARCH", researchCue, false],
];

function isIssueMatch(question: string, kind: SupportIssueKind, pattern: RegExp, requiresProblemCue: boolean) {
  if (!pattern.test(question)) return false;
  if (!requiresProblemCue) return true;
  return problemCue.test(question);
}

export function detectSupportIssues(question: string): SupportIssueKind[] {
  const clean = question.trim();
  if (!clean) return [];
  return SUPPORT_ISSUE_KINDS.filter((kind) => {
    const detector = detectors.find(([candidate]) => candidate === kind);
    return detector ? isIssueMatch(clean, detector[0], detector[1], detector[2]) : false;
  });
}

export function isSupportTriageQuestion(question: string) {
  return detectSupportIssues(question).length > 0;
}

export function supportIssueLabel(kind: SupportIssueKind) {
  const labels: Record<SupportIssueKind, string> = {
    SEARCH_NO_RESULT: "검색결과 없음",
    SEARCH_FILTER_PROBLEM: "검색 필터·조건 문제",
    DOWNLOAD_PROBLEM: "다운로드 문제",
    AUDIO_PLAYBACK_PROBLEM: "오디오 재생 문제",
    MEMBERSHIP_EMAIL_PROBLEM: "회원가입·이메일 문제",
    ACCOUNT_PROBLEM: "계정·로그인 문제",
    RIGHTS_LICENSE: "저작권·이용권 문의",
    RIGHTS_RESEARCH: "연구·학술 이용 문의",
  };
  return labels[kind];
}
