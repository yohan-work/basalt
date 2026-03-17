# API 엔드포인트

API 라우트는 `app/api/**/route.ts` 기준으로 정리되어 있으며, 프런트엔드-에이전트 동작은 이 인터페이스를 중심으로 연동됩니다.

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
| POST | `/api/agent/enhance-prompt` | 사용자 프롬프트 고도화 |
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
