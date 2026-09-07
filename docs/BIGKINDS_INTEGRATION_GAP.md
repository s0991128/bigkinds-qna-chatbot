# BIGKinds Integration Gap

목적: 챗봇을 BIGKinds 본사이트에 안전하게 부착하기 위한 확인 목록입니다. 실제 BIGKinds HTML·CSP·공식 frontend hook은 현재 저장소에 없으므로 확인할 수 없는 항목은 추측하지 않고 `UNKNOWN / BIGKinds 개발사 확인 필요`로 표시합니다.

## 1. 삽입 방식

공통 레이아웃의 `</body>` 직전에 다음 loader를 삽입합니다.

```html
<script
  src="https://<chatbot-origin>/bigkinds-chatbot.js"
  data-chatbot-url="https://<chatbot-origin>"
  defer
></script>
```

staging origin은 `https://bigkinds-qna-chatbot--staging.kpf.axhub.ai`를 기준으로 검증합니다. 최종 운영 origin은 `UNKNOWN / 배포 담당자 확인 필요`입니다.

## 2. 보안·브라우저 계약

- 허용 chatbot origin: staging origin 및 최종 승인된 운영 origin만 허용
- iframe: `${chatbotOrigin}/?embed=1`
- CSP: `frame-src`에 chatbot origin, `script-src`에 loader origin 허용
- `postMessage` targetOrigin: loader가 계산한 chatbot origin으로 고정
- 수신 검증: `event.origin`과 `event.source === iframe.contentWindow`를 함께 확인
- context: `type: "bigkinds-chatbot-context"`, `pageType`, `pathname`, `loggedIn`
- 검색어·이름·이메일·회원번호·API Key는 context로 전달하지 않음
- 운영 origin과 CSP 실제 값: `UNKNOWN / BIGKinds 개발사 확인 필요`

## 3. Host Action 계약

| Action | 현재 fallback | BIGKinds 공식 연결 필요 여부 |
| --- | --- | --- |
| `OPEN_URL` | 허용 host만 새 탭 열기 | 선택 |
| `OPEN_QNA` | BIGKinds Q&A URL 열기 | 선택 |
| `OPEN_FAQ` | BIGKinds FAQ URL 열기 | 선택 |
| `OPEN_API` | News Store/API 안내 URL 열기 | 선택 |
| `COPY_SEARCH_QUERY` | 챗봇 안에서 검색식 복사 | 선택 |
| `APPLY_SEARCH_QUERY` | `BIGKINDS_CHATBOT_ADAPTER.applySearchQuery(query)` 호출 | 공식 hook 필요 |

실제 뉴스검색 input selector나 React/Vue state를 추측해 직접 조작하지 않습니다. `APPLY_SEARCH_QUERY`를 사용하려면 BIGKinds 개발사가 공식 adapter 또는 postMessage 수신 hook을 제공해야 합니다.

## 4. 로그인·링크

- 현재 `loggedIn`은 `null`이며 로그인 여부를 추측하지 않음
- 로그인 상태 전달 필요 여부: `UNKNOWN / BIGKinds 보안·개인정보 검토 필요`
- Q&A: `https://www.bigkinds.or.kr/news/qnaList.do`
- News Store: `https://www.newstore.or.kr/`
- FAQ·API 최종 URL: `UNKNOWN / BIGKinds 개발사 확인 필요`

## 5. 장애 격리·rollback

- loader는 shadow root에만 host를 만들고 실행 실패 시 BIGKinds DOM을 수정하지 않음
- iframe은 lazy loading으로 챗봇을 열기 전 network 요청을 발생시키지 않음
- iframe load·message 오류는 챗봇 닫기 또는 비활성화로 격리하고 host page 예외로 전파하지 않음
- rollback은 공통 layout의 loader 한 줄을 이전 승인 버전 URL로 되돌리거나 제거
- 운영 feature flag·모니터링 endpoint: `UNKNOWN / 운영 담당자 확인 필요`

## 6. 모바일·접근성

- launcher는 고정 우측 하단이며 키보드 `Enter`·`Space`로 열기 가능
- launcher의 `aria-label`·`aria-expanded`와 panel `aria-hidden`을 동기화
- 모바일에서는 viewport 안에 panel을 맞추고 BIGKinds header·cookie banner와 z-index 충돌 확인
- 최종 모바일 브라우저·스크린리더 조합: `UNKNOWN / 운영 QA 필요`

## 7. BIGKinds 측 확인 필요 사항

1. 공통 layout에 loader를 넣을 위치
2. staging·production chatbot origin과 allowlist
3. `frame-src`, `script-src`, `connect-src` CSP
4. 로그인 상태 전달 여부
5. `OPEN_FAQ`, `OPEN_API` 공식 URL
6. `APPLY_SEARCH_QUERY` 공식 연동 hook
7. 장애 시 loader를 끌 feature flag 또는 rollback 방식
8. 모바일 z-index·cookie banner 충돌 여부
