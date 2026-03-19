# API 엔드포인트

태그: `#api` `#orchestrator` `#team` `#system`

이 문서는 `app/api/**/route.ts` 기준으로 엔드포인트 사용 계약을 제공합니다.

## 공통 계약

### 목표
- `agent/project/team/system` API를 통해 상태 변화 없는 일관된 실행 경로를 제공

### 입력
- 각 API별 `method/path` + body 또는 query + 제어 파라미터

### 제약
- 상태/권한 조건 충족
- 호출 간 락/동시성 조건 위배 금지

### 출력
- 상태 변화 로그 + API별 응답 페이로드

### 성공기준
- 호출 후 코드 경로별로 기대 상태 전환이 반영됨
- 실패 시 재시도 또는 경고 메시지로 실패 원인 노출

## Agent API

| Method | Path | 용도 |
|---|---|---|
| POST | `/api/agent/plan` | 태스크 분석 및 워크플로우 생성 |
| POST | `/api/agent/execute` | 실행 파이프라인 실행 |
| POST | `/api/agent/retry` | 실패 태스크 재개 |
| POST | `/api/agent/verify` | 검증 및 PR 생성 |
| POST | `/api/agent/review` | 코드 리뷰 실행 (`deep_code_review`) |
| POST | `/api/agent/review/suggestions` | 리뷰 제안 생성 |
| POST | `/api/agent/review/apply` | 리뷰 제안 적용 |
| POST | `/api/agent/patch-file` | 특정 파일 diff 기반 패치 |
| POST | `/api/agent/edit-completed` | 완료/리뷰/테스트 단계 사용자 요청 반영 |
| POST | `/api/agent/modify-element` | 특정 요소 기준 수정 요청 |
| POST | `/api/agent/approve` | Review 태스크 최종 승인 |
| POST | `/api/agent/discuss` | 브레인스토밍 대화 생성 |
| POST | `/api/agent/enhance-prompt` | 사용자 프롬프트 고도화 (프로젝트 스택 동적 분석) |
| POST | `/api/agent/skills` | 스킬 직접 실행 |
| GET | `/api/agent/stream` | SSE 진행 스트리밍 |

## Project API

| Method | Path | 용도 |
|---|---|---|
| GET | `/api/project/components` | 컴포넌트 목록 조회 |
| GET | `/api/project/dev-server-info` | dev 서버 포트/URL 추정 |

## Team API

| Method | Path | 용도 |
|---|---|---|
| POST | `/api/team/execute` | 팀 협업 실행(비동기 기본) |
| GET | `/api/team/execute` | runId 기반 실행 상태 조회 |

## 시스템/유틸 API

| Method | Path | 용도 |
|---|---|---|
| POST | `/api/system/dialog` | 로컬 폴더 선택 다이얼로그 |
| POST | `/api/tts` | edge-tts-universal 기반 TTS 스트림 생성 |

## 운영 참고

- `execute`/`retry`/`stream`의 파라미터는 `discussionMode`, `strategyPreset`, `maxDiscussionThoughts` 등으로 제어
- 라우트별 응답 스키마는 실제 호출 코드에서 고정되므로 문서 변경은 라우트 파일 기준으로 갱신

### API별 계약 빠른 참조

- `POST /api/agent/execute`, `POST /api/agent/retry`는 상태 전이형 계약을 사용
- `POST /api/agent/review/*`, `POST /api/agent/patch-file`는 완료/리뷰/테스트 상태 가정 필요
- 상세 계약은 `docs/prompting/api-contracts.md` 참조
