# 주요 기능

태그: `#feature` `#workflow` `#demo` `#safety`

이 문서는 Basalt에서 실제로 사용할 수 있는 주요 기능을 먼저 설명하고, 내부 구현 세부는 뒤의 확장 기능으로 분리합니다.

## 핵심 기능

| 기능 | 사용자가 하는 일 | 저장/표시 결과 |
| --- | --- | --- |
| 프로젝트 연결 | 로컬 프론트엔드 프로젝트 이름과 경로를 등록 | `ProjectSelector`, `Projects` 테이블 |
| 태스크 생성 | 짧은 UI 수정 요청을 등록 | 칸반 `Request` 카드, `Tasks` 테이블 |
| AI 계획 생성 | `Plan` 단계에서 실행 workflow 생성 | `Tasks.workflow`, plan 로그, 영향 범위 미리보기 |
| AI 실행 | `Dev (Working)` 단계에서 workflow step 실행 | 코드 변경, `Execution_Logs`, `metadata.fileChanges`, step 진행 상태 |
| 검증/정리 | `Test`와 상세 화면에서 결과 확인 | `metadata.qaPageCheck`, `metadata.qaSignoff`, QA 캡처, 복구/인수인계 Markdown |

## 기본 사용 흐름

1. `Request` 컬럼에서 프로젝트를 선택하고 태스크를 생성합니다.
2. `Plan`을 실행해 AI가 작업 계획을 만듭니다.
3. 영향 범위 확인이 필요한 경우 미리보기 내용을 확인합니다.
4. `Dev (Working)`에서 `Execute`를 실행합니다.
5. `Test` 단계와 `Task Details`에서 로그, 검증 결과, QA 캡처, 후속 정리 내용을 확인합니다.

## 상태 흐름

| 상태 | 사용자가 보는 것 | 내부 결과 |
| --- | --- | --- |
| `Request` | 새 태스크 카드와 프로젝트 선택 상태 | `Tasks.status = pending` |
| `Plan` | AI가 만든 작업 계획과 영향 범위 | `Tasks.workflow`, `metadata.impactPreview` |
| `Dev (Working)` | 실행 중 step, agent 로그, 코드 변경 진행 | `Execution_Logs`, `metadata.fileChanges` |
| `Test` | 검증 결과, QA 캡처, 작업 이력 | `metadata.qaPageCheck`, `metadata.qaSignoff` |
| `Review`/`Done` | 리뷰 결과 또는 완료된 작업 기록 | 리뷰 메타데이터, 완료 태스크 아카이브 |
| `Failed` | 실패 원인과 복구 가이드 | `metadata.lastError`, `metadata.executionRepairs` |

## AI 보조 기능

### 명확화 질문과 영향 범위 미리보기

- `pending` 태스크에서 AI가 명확화 질문을 생성하고 답변을 `metadata.clarifyingGate`에 저장합니다.
- 플랜 완료 후 예상 수정 경로, 위험도, 가정을 `metadata.impactPreview`에 저장합니다.
- 영향 범위를 확인하기 전에는 실행을 막을 수 있습니다.
- 관련 API: `POST /api/agent/clarify/generate`, `POST /api/agent/clarify/submit`, `POST /api/agent/execution/acknowledge-impact`

### 프롬프트 고도화와 스펙 확장

- 태스크 생성 화면의 AI Enhance는 `POST /api/agent/enhance-prompt`를 호출해 사용자 요청을 더 실행 가능한 형태로 다듬습니다.
- `spec-expand`는 짧은 요청을 수용 기준, 엣지 케이스, 수동 스모크가 포함된 Markdown으로 확장하고 `metadata.specExpansion`에 저장합니다.
- `specExpansion`은 이후 plan 입력에 합쳐집니다.

### 복구 가이드와 인수인계 요약

- 실패 또는 QA 이후 `recovery-suggestions`가 다음 시도용 한국어 가이드와 체크리스트를 생성합니다.
- `handoff-summary`는 실행 토론, workflow, 변경 파일을 팀 공유용 Markdown으로 압축합니다.
- 관련 API: `POST /api/agent/recovery-suggestions`, `POST /api/agent/handoff-summary`

## 검증과 QA

- 실행 완료 후 `runDevExitQaPipeline`이 Test 진입 전 QA를 수행합니다.
- 대상 프로젝트 dev URL은 `metadata.qaDevServerUrl`, `metadata.qaDevServerPath`, 변경 파일 기반 라우트 추론 순서로 결정합니다.
- `agent-browser`가 있으면 콘솔 오류, 페이지 오류, 동일 오리진 fetch/XHR 4xx/5xx, 스크린샷/반응형 캡처를 보강합니다.
- QA 결과는 `metadata.qaPageCheck`와 `metadata.qaSignoff`에 저장됩니다.
- 캡처 PNG는 대상 프로젝트의 `.basalt/basalt-qa/<taskId>/` 아래에 저장되고, `GET /api/project/qa-artifact`로 표시됩니다.
- 성공 시 `검수 완료` 탭에서 스모크 결과, 최종 문구, main/mobile/tablet/desktop 캡처 슬롯을 확인할 수 있습니다.

엄격한 검증이 필요하면 환경 변수로 조정합니다.

- `QA_FAIL_ON_PAGE_ERRORS=true`: 페이지 스모크 실패를 최종 검증 실패로 처리
- `DEV_QA_RUN_NEXT_BUILD=1`: Dev 종료 QA에서 대상 프로젝트 `next build` 실행
- `DEV_QA_FAIL_ON_NEXT_BUILD=1`: 빌드 실패 시 Dev QA 중단
- `DEV_QA_FAIL_ON_VERIFY=true` 또는 `BASALT_STRICT_VERIFY=true`: `verify_final_output` 실패 시 실행 실패 처리

## 실행 안정성

- `write_code`는 존재하지 않는 import, 미설치 npm 패키지, Next.js App Router의 RSC/metadata 경계 위반을 저장 전에 차단합니다.
- 대상 프로젝트의 router base가 `app`인지 `src/app`인지 감지해 경로를 보정합니다.
- `components/ui` 누락은 최소 UI 스캐폴드 또는 import repair 흐름으로 보완할 수 있습니다.
- 프로젝트 typecheck가 가능하면 코드 배치 저장 후 교차 파일 타입 오류를 조기에 잡습니다.

상세 구현은 [`architecture/orchestrator.md`](./architecture/orchestrator.md), [`agents-skills.md`](./agents-skills.md), [`implementation-history.md`](./implementation-history.md)를 참고하세요.

## 확장 기능

- **Ralph 이벤트 모드**: `plan -> execute -> verify`를 여러 라운드 반복하고 실패 요약을 다음 계획에 반영합니다.
- **다단계 코드 생성**: 짧은 JSON plan을 먼저 만들고, 구현 후 타입체크 실패가 남으면 진단을 포함해 재생성합니다.
- **스킬 risk 게이트**: shell/git/network 위험 스킬을 `BASALT_SKILL_RISK_MODE=warn|deny`로 경고 또는 차단합니다.
- **Buddy v2 / Deep Plan / Agent Inbox / Kairos-lite**: 실행 톤 보조, 깊은 계획, agent handoff, 이벤트 기반 사전 권고를 제공합니다.
- **유사 완료 태스크**: 같은 프로젝트의 완료 태스크 중 제목/설명 토큰 유사도가 높은 후보를 제시합니다. 이 기능은 LLM을 쓰지 않습니다.
- **칸반 검색**: 제목, 설명, metadata JSON 문자열 기준으로 태스크를 필터링합니다.

## 관련 문서

- 모델과 프롬프트: [`llm.md`](./llm.md)
- API 목록: [`api.md`](./api.md)
- UI 컴포넌트: [`ui-components.md`](./ui-components.md)
- 설치/환경 변수: [`setup.md`](./setup.md)
