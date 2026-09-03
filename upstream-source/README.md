# 빅카인즈 Q&A 챗봇

빅카인즈 이용방법, 검색, 뉴스데이터, Open API와 API 유료화 문의에 공식 자료 기반으로 답변하는 웹 챗봇입니다. 근거·기준일을 함께 표시하고 계약·저작권·AI 활용처럼 담당자 확인이 필요한 질문은 뉴스저작권팀으로 연결합니다.

## 현재 반영된 공식 자료

- 관리자 공식 FAQ 23건
- 한국언론진흥재단 OpenAPI 사용자지침서 V1.7(2026-07-28)
- 빅카인즈 분석 API 유료화 계획(2026-01)
- 개정안 뉴스저작물 사용료징수규정
- 관리자 Q&A의 API 신청·요금·학술연구·호출제한 관련 공식답변 표본

관리자 Q&A 전체 엑셀은 전달받는 즉시 scripts/import-qna.mjs로 일괄 반영할 수 있습니다.

## 주요 기능

- 별도 AI API 없이 작동하는 공식자료 검색형 답변
- API 유료화 시점, 가격표, 50% 학술할인, VAT 기준 안내
- 뉴스토어와 API 구매 요청서 연결
- 답변별 근거·기준일·운영 검수 필요 여부 표시
- 불확실·계약·저작권·AI 관련 질문 자동 담당자 연결
- 개인정보·인증정보 입력 경고
- Q&A 엑셀의 개인정보 마스킹·미답변 제외·중복 제거
- 피드백과 답변 이벤트를 기존 분석 시스템에 연결 가능
- 모바일·키보드·스크린리더 대응

## 실행

Node.js 20 이상:

    node server/server.mjs

브라우저에서 http://localhost:4173 을 엽니다.

Docker:

    docker build -t bigkinds-qna .
    docker run --rm -p 4173:4173 bigkinds-qna

## Q&A 엑셀 반영

    node scripts/import-qna.mjs --input "QNA.xlsx"
    node scripts/validate-data.mjs

기본적으로 제목과 공식답변만 사용합니다. 질문 본문까지 사용하려면 검수 후 --include-question-body 옵션을 추가합니다.

지원 열 이름은 제목, 문의내용/질문, 답변내용/답변, 구분, 답변일, 상태, 번호입니다. 실제 열 이름이 조금 달라도 자동으로 인식합니다.

## 유지보수팀이 주로 수정할 파일

| 목적 | 파일 |
|---|---|
| 문구·색상·담당자 연락처 | public/data/config.js |
| 공식 FAQ | public/data/official-faq.js |
| API·정책 답변 | public/data/verified-policy.js |
| Q&A 엑셀 변환 결과 | public/data/qna-import.js |
| 기본 지식·요금표 | public/data/knowledge-base.js |
| 챗봇 UI | public/assets/chatbot.css |

## 기존 빅카인즈 페이지에 삽입

배포 주소가 https://help.bigkinds.or.kr/chatbot 이라면 body 닫기 태그 바로 앞에 추가합니다.

    <script src="https://help.bigkinds.or.kr/chatbot/embed.js"
            data-version="20260821-official3"
            defer></script>

같은 도메인 하위 경로로 배포하면 CSP 설정이 가장 단순합니다. 별도 도메인이라면 script-src, style-src, connect-src에 챗봇 도메인을 허용해야 합니다.

## 운영 원칙

1. 근거가 없으면 확정 답변을 생성하지 않습니다.
2. 가격·계약·저작권·AI 이용 범위는 담당자 확인 경로를 제공합니다.
3. Q&A 원문의 등록자·관리자 ID·이메일·전화번호는 지식베이스에 저장하지 않습니다.
4. 정책 파일 변경 후 데이터 검증과 핵심 질문 회귀 테스트를 실행합니다.
5. 배포 시 data-version 값을 변경해 브라우저 캐시를 갱신합니다.

필요 데이터는 DATA_REQUEST.md, 배포 절차는 DEPLOYMENT.md를 참고하세요.

