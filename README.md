# 빅카인즈 이용 도우미

빅카인즈 공식 FAQ와 Open API 정책·Q&A를 검색해 자연어로 안내하고, 공식 원문 링크를 제공하는 웹사이트 부착형 챗봇입니다.

## 반영한 GitHub 원본

사용자가 지정한 [s0991128/bigkinds-qna-chatbot](https://github.com/s0991128/bigkinds-qna-chatbot) 저장소의 최신 `main` 소스와 데이터 파일을 `upstream-source/`에 보관하고, `public/data/`에 원본 지식 파일을 반영했습니다. 확인한 기준 커밋은 `c8a4559`입니다.

## 포함 기능

- 한국어 키워드·유의어·2글자 단위 검색
- 공식 FAQ 23건 + Open API·저작권·개인정보 정책 + 관리자 Q&A 데이터 동적 로드
- 근거가 충분한 FAQ만 답변하는 임계값 처리
- 관련 질문, 공식 FAQ 출처, 답변 피드백
- 모바일·키보드 접근성 대응
- `?embed=1` 전용 화면
- 기존 사이트에 한 줄로 부착하는 `public/bigkinds-chatbot.js`
- Service Copilot 페이지 맥락(HOME·뉴스검색·OPEN API·FAQ·Q&A 등) 전달 및 맥락별 추천질문
- 결정형 검색식 Builder(OR·AND·정확문구·NOT)와 호스트 페이지 적용 브리지
- 검색결과 없음·다운로드·Open API 문제를 단계적으로 확인하는 진단 Flow
- 현행 정책 > 공식 FAQ > 소개 > 검증 Q&A 순의 Knowledge Authority와 검토 필요 표시
- 답변 요약·자세히 보기·이용 순서·주의사항·기준일·출처 배지
- 근거 부족 시 Q&A 안내, 출처 원문 링크, 피드백 및 민감정보 미저장 fallback
- 날짜 질문은 실행 시점의 한국 표준시로 답변하며, 자연어 검색식 요청은 문서 검색보다 먼저 결정형 검색식으로 변환
- 메신저를 열 때마다 현재 화면 맥락에 맞는 추천질문 3개를 새로 생성
- 질문답변 내역의 Excel 호환 CSV 내보내기
- 일반 상식·시사 질문은 지식베이스 근거가 없으면 답변하지 않고 범위를 안내

## 로컬 실행

```bash
npm install
npm run dev
```

데이터·공개 저장소의 민감정보 패턴은 다음 명령으로 점검합니다.

```bash
npm run security:scan
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

현재 버전은 공식 FAQ·소개 자료와 가져온 Q&A를 하나의 canonical 지식베이스로 관리하고, 브라우저와 서버 모두 같은 권한 판정·결정형 검색을 사용합니다. Q&A는 기본적으로 `HISTORICAL_QNA`·`REVIEW_REQUIRED`로 취급하므로 답변의 주 근거가 되지 않으며, 담당자 검토 후에만 현행 답변으로 승격할 수 있습니다. API 키는 브라우저 코드에 넣지 않습니다.

## 오답 방지 및 LLM 연동안

질문 처리 순서는 다음과 같이 고정합니다.

1. 날짜·검색식 만들기·개인정보·OPEN API처럼 규칙이 명확한 요청은 결정형 핸들러가 먼저 처리합니다.
2. 나머지 질문은 736건 canonical 지식베이스에서 후보를 찾은 뒤 `ANSWER`·`CLARIFY`·`NO_MATCH`·`ESCALATE`로 판정합니다. 근거가 약하거나 과거 Q&A만 검색되면 관련 문서를 억지로 답변하지 않습니다.
3. `LLM_ENABLED=true`로 명시적으로 활성화한 경우에만 고신뢰·현행 공식 문서를 서버의 `/api/chat`에서 문장 보완에 사용합니다. 클라이언트가 보낸 출처는 거부하고, 근거에 없는 사실·요금·날짜는 생성하지 않으며 호출 실패 시 정적 답변을 유지합니다.

현재 앱에는 동일한 계약의 `/api/chat` 라우트가 연결되어 있습니다. 기본값은 LLM 비활성화이며, 켜는 경우 `LLM_ENABLED=true`와 `LLM_PROVIDER=gemini` 또는 `LLM_PROVIDER=openai`를 서버 환경변수로 설정합니다. 공식 문서와 질문이 충분히 일치하면 LLM을 호출하지 않고 정적 답변을 사용하며, LLM 호출은 서버의 일일 한도와 고신뢰 판정을 모두 통과한 경우로 제한합니다. provider가 없거나 호출에 실패하면 공식 문서 기반 정적 답변으로 자동 전환됩니다.

무료 Gemini 로컬·AxHub 테스트 설정은 `.env.local`에 다음처럼 입력합니다(실제 키는 저장소에 커밋하지 않습니다).

```env
LLM_ENABLED=true
LLM_PROVIDER=gemini
GEMINI_API_KEY=발급받은_Google_AI_Studio_키
GEMINI_MODEL=gemini-2.5-flash-lite
```

Gemini 키는 [Google AI Studio API 키 페이지](https://aistudio.google.com/apikey)에서 발급합니다. 무료 등급은 모델·지역별 호출 한도가 있고 콘텐츠가 Google 제품 개선에 사용될 수 있으므로, 민감정보가 포함된 운영 데이터에는 별도 검토가 필요합니다. API 키는 자동 생성·추출·대리 입력하지 않으며 브라우저나 저장소에 넣지 않습니다.

## Service Copilot 연동

`public/bigkinds-chatbot.js`는 현재 BIGKinds pathname만 최소 context로 iframe에 전달합니다. 검색어·이름·이메일·회원번호·API Key는 전달하지 않습니다. 실제 BIGKinds 화면에서 검색식을 적용하려면 호스트 페이지에 다음 adapter를 연결할 수 있습니다.

```js
window.BIGKINDS_CHATBOT_ADAPTER = {
  applySearchQuery(query) { /* BIGKinds 검색 화면의 공식 연동 지점 */ },
};
```

adapter가 없으면 `bigkinds-chatbot-action` CustomEvent가 발생하고, 사용자는 검색식 복사·뉴스검색 화면 열기 fallback을 사용할 수 있습니다. Q&A escalation 기본 주소는 `https://www.bigkinds.or.kr/news/qnaList.do`입니다.

## 검증 명령

```bash
npm test
npm run security:scan
npm run validate:knowledge
npm run validate:upstream
npm run eval
npm run holdout
npm run typecheck
npm run lint
```

`npm run security:scan`은 실제 이메일·전화번호·주민번호·인증값과 검토가 필요한 제목·질문 신호를 구분해 보고합니다. Q&A 원문에 민감정보가 있으면 기록·LLM 전송 대상에서 제외합니다.
