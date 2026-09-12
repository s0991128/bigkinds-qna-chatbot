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
- Service Copilot 페이지 맥락(HOME·뉴스검색·OPEN API·FAQ·Q&A 등) 전달 및 맥락별 추천질문
- 결정형 검색식 Builder(OR·AND·정확문구·NOT)와 호스트 페이지 적용 브리지
- 검색결과 없음·다운로드·Open API 문제를 단계적으로 확인하는 진단 Flow
- 현행 정책 > 공식 FAQ > 소개 > 검증 Q&A 순의 Knowledge Authority와 검토 필요 표시
- 답변 요약·자세히 보기·이용 순서·주의사항·기준일·출처 배지
- Q&A escalation, 문의내용 복사, 피드백 사유 선택 및 질문 원문을 저장하지 않는 로컬 fallback
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

현재 버전은 다운로드한 원본 데이터 파일을 브라우저에서 순서대로 로드하고 결정형 검색을 적용합니다. 운영 버전은 FAQ 관리 시스템 또는 승인된 API와 동기화하고, 서버 측 검색·재순위화·생성형 AI 답변 단계를 추가하는 방식을 권장합니다. API 키는 브라우저 코드에 넣지 않습니다.

## 오답 방지 및 LLM 연동안

질문 처리 순서는 다음과 같이 고정합니다.

1. 날짜·검색식 만들기·개인정보·OPEN API처럼 규칙이 명확한 요청은 결정형 핸들러가 먼저 처리합니다.
2. 나머지 질문은 750건 지식베이스에서 검색하고, 근거가 임계값보다 약하면 “저장된 공식 문서에서 관련 내용을 찾지 못했습니다”로 안내합니다.
3. 운영 승인 후에만 상위 근거 3건을 서버의 `/api/chat` 프록시에 전달해 LLM이 문장을 다듬습니다. 근거에 없는 사실·요금·날짜는 생성하지 않도록 시스템 지침을 적용하고, 근거가 없으면 정적 답변으로 되돌립니다.

현재 앱에는 동일한 계약의 `/api/chat` 라우트가 연결되어 있고, 정적 위젯용 참고 구현은 `upstream-source/server/server.mjs`에 있습니다. 서버는 `LLM_PROVIDER=gemini`로 설정하면 Gemini 무료 등급을 우선 사용하고, `LLM_PROVIDER=openai`로 설정하면 OpenAI를 사용합니다. 설정하지 않았을 때는 Gemini 키가 있으면 Gemini, 없으면 OpenAI를 선택합니다. 공식 문서와 키워드가 충분히 일치하는 질문은 LLM을 호출하지 않고 정적 답변을 사용하며, 애매한 질문만 브라우저 일일 20회·서버 일일 100회 한도 안에서 LLM을 호출합니다. 어떤 provider도 설정되지 않거나 호출에 실패하면 공식 문서 기반 정적 답변으로 자동 전환됩니다.

무료 Gemini 로컬·AxHub 테스트 설정은 `.env.local`에 다음처럼 입력합니다(실제 키는 저장소에 커밋하지 않습니다).

```env
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

adapter가 없으면 검색식 적용 요청을 `jsonSearchParam` POST 형식으로 공식 뉴스 검색 화면에 전달하고, 그 외 동작은 `bigkinds-chatbot-action` CustomEvent로 전달합니다. Q&A escalation 기본 주소는 `https://www.bigkinds.or.kr/news/qnaList.do`입니다.
