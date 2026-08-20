# 빅카인즈 이용 도우미

빅카인즈 공식 FAQ 23건을 검색해 자연어로 안내하고, 공식 원문 링크를 제공하는 웹사이트 부착형 챗봇 프로토타입입니다.

## 포함 기능

- 한국어 키워드·유의어·2글자 단위 검색
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

현재 버전은 2026-08-20에 확인한 공개 FAQ 스냅샷과 결정형 검색을 사용합니다. 운영 버전은 FAQ 관리 시스템 또는 승인된 API와 동기화하고, 서버 측 검색·재순위화·생성형 AI 답변 단계를 추가하는 방식을 권장합니다. API 키는 브라우저 코드에 넣지 않습니다.
