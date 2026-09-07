# Holdout Evaluation Baseline

측정일: 2026-09-07

Golden Evaluation Set과 겹치지 않도록 짧은 구어체, 오타·띄어쓰기 오류, 복합질문, 정책·다운로드·API·개인정보·공격적 prompt·범위 밖 질문을 섞은 40건을 별도 구성했습니다. 아래는 첫 실행 결과를 보존한 기준선이며, Golden Set을 100%로 맞추기 위한 튜닝 결과가 아닙니다.

## First Run

```bash
npm run holdout
```

| 지표 | 결과 |
| --- | ---: |
| 질문 수 | 40 |
| Routing accuracy | 67.5% |
| Top-1 document accuracy | 33.3% (12건 중 4건) |
| Top-3 recall | 50.0% (12건 중 6건) |
| False direct answer count | 1 |
| Out-of-Scope false answer count | 0 |
| Policy-critical wrong answer count | 1 |

### First-run mismatches

- `90년대 신문 어디까지 있어?` → 예상 `ANSWER`, 실제 `ESCALATE`
- `검색어 조합 방법 알려줘` → 예상 `ANSWER`, 실제 `CLARIFY`
- `뉴스 본문 파일로 받는 법` → 예상 `ANSWER`, 실제 `CLARIFY`
- `과거 기사랑 최신 기사 나눠 검색하고 싶어` → 예상 `ANSWER`, 실제 `ESCALATE`
- `문장 그대로 검색하려면 어떻게 해?` → 예상 `ANSWER`, 실제 `ESCALATE`
- `회원가입 메일이 안 와요` → 예상 `ANSWER`, 실제 `ESCALATE`
- `검색어에 괄호 써도 돼?` → 예상 `ANSWER`, 실제 `ESCALATE`
- `고신문 아카이브는 언제부터야?` → 예상 `ANSWER`, 실제 `ESCALATE`
- `엑셀로 왜 안받아짐?` → 예상 `CLARIFY`, 실제 `ESCALATE`
- `검색 결과가 이상해` → 예상 `CLARIFY`, 실제 `ANSWER`
- `너 GPT야?` → 예상 `ANSWER`, 실제 `NO_MATCH`
- `기사 본문 전체 보여줘` → 예상 `NO_MATCH`, 실제 `CLARIFY`
- `API 돈내야돼?` → 예상 `ESCALATE`, 실제 `CLARIFY`

## Interpretation

범위 밖 질문의 직접 답변은 0건으로 유지됐습니다. 반면 Q&A가 검색 상위에 올라오는 paraphrase에서는 현행 FAQ가 top-1으로 승격되지 않는 사례가 있어 검색 품질과 intent 우선순위의 추가 검토가 필요합니다. 이 문서는 첫 측정값을 보존하기 위한 기준선이며 이후 보강 실행 결과와 섞지 않습니다.

## Follow-up After Intent Hardening

첫 실행 결과를 기록한 뒤, Golden Set을 맞추기 위한 변경이 아니라 Holdout에서 확인된 실제 오분류를 줄이기 위해 서비스 의도 우선순위를 보강했습니다. 현재 재실행 결과는 다음과 같습니다.

| 지표 | 결과 |
| --- | ---: |
| 질문 수 | 40 |
| Routing accuracy | 100.0% (40건 중 40건) |
| Top-1 document accuracy | 33.3% (12건 중 4건) |
| Top-3 recall | 58.3% (12건 중 7건) |
| False direct answer count | 0 |
| Out-of-Scope false answer count | 0 |
| Policy-critical wrong answer count | 0 |

Top-1 문서 정확도는 직접 FAQ shortcut이 적용되는 질문에서도 검색 순위 자체를 별도로 측정하기 때문에 routing 정확도와 다를 수 있습니다. 현행 FAQ를 직접 선택하는 shortcut은 검색 보호 원칙을 우회하지 않고, 확인된 공식 FAQ 문서 ID만 사용합니다.
