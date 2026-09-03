# 빅카인즈 이용 도우미

빅카인즈 공식 FAQ와 Open API 정책·Q&A를 검색해 자연어로 안내하고, 공식 원문 링크를 제공하는 웹사이트 부착형 챗봇입니다.

## 반영한 GitHub 원본

사용자가 지정한 [s0991128/bigkinds-qna-chatbot](https://github.com/s0991128/bigkinds-qna-chatbot) 저장소의 소스와 데이터 파일을 `upstream-source/`에 보관하고, `public/data/`에 원본 지식 파일을 반영했습니다. 확인한 기준 커밋은 `322c104`입니다.

## 포함 기능

- 한국어 키워드·유의어·2글자 단위 검색
- 공식 FAQ 23건 + Open API·저작권·개인정보 정책 + 관리자 Q&A 데이터 동적 로드
- 근거가 충분한 FAQ만 답변하는 임계값 처리
- 관련 질문, 공식 FAQ 출처, 답변 피드백
- 모바일·키보드 접근성 대응
- `?embed=1` 전용 화면
- 기존 사이트에 한 줄로 부착하는 `public/bigkinds-chatbot.js`

## 로컬 실행

```bash
npm install
npm run dev
```

Windows에서 로컬 미리보기 워커가 실행되지 않으면 다음처럼 경량 미리보기 모드를 사용할 수 있습니다.

```powershell
$env:CODEX_LOCAL_PREVIEW='1'
npm run dev
```

## 기존 웹사이트에 부착

배포 URL이 `https://example.com`이라면 빅카인즈 공통 레이아웃의 `</body>` 직전에 아래 코드를 추가합니다.

```html
<script
  src="https://example.com/bigkinds-chatbot.js"
  data-chatbot-url="https://example.com"
  defer
></script>
```

처음부터 창을 열어 두려면 `data-open="true"`를 추가합니다. 스크립트 삽입이 어려운 환경은 `https://example.com/?embed=1`을 iframe으로 연결할 수 있습니다.

## 현재 범위와 운영 전환

현재 버전은 다운로드한 원본 데이터 파일을 브라우저에서 순서대로 로드하고 결정형 검색을 적용합니다. 운영 버전은 FAQ 관리 시스템 또는 승인된 API와 동기화하고, 서버 측 검색·재순위화·생성형 AI 답변 단계를 추가하는 방식을 권장합니다. API 키는 브라우저 코드에 넣지 않습니다.
