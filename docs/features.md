# 주요 기능 목록

README의 장문 기능 설명을 기능별로 분리한 문서입니다.

## 1) 완료 산출물 수정

- 테스트/리뷰/완료 상태에서 사용자 요청 기반으로 변경을 반영합니다.
- 대상 엔드포인트: `POST /api/agent/edit-completed`
- 동시 수정은 `metadata.editInProgress` 락으로 중복 실행 방지

## 2) 특정 요소 수정

- `filePath`, `elementDescriptor`, `request` 기반으로 세부 변경 요청
- 대상 엔드포인트: `POST /api/agent/modify-element`
- 적용 이력은 `metadata.fileChanges`에 기록

## 3) 리뷰 제안 생성/적용

- `POST /api/agent/review/suggestions`로 제안 생성
- `POST /api/agent/review/apply`로 제안 반영
- 추가로 `POST /api/agent/patch-file`로 직접 파일 patch 가능

## 4) 컴포넌트 기반 태스크 생성

- 생성 시 기존 컴포넌트 경로를 컨텍스트로 주입하여 import 유도
- `CreateTaskModal`에서 `attachedComponentPaths` 전달

## 5) 코드 리뷰와 검증

- `POST /api/agent/review` 실행 시 `deep_code_review` 기반 분석
- 결과는 `metadata.reviewResult`, `metadata.reviewAt`에 저장되어 세부 탭에 표시

## 6) 승인 워크플로우(HITL)

- `approve` API로 `review` 상태 태스크를 완료 상태로 반영
- 위험 액션은 자동 중단 후 사용자 승인 대기 가능

## 7) 토론/협업 보강

- `discuss` 엔드포인트로 실행 전후 브레인스토밍 대화 생성
- `enhance-prompt`로 사용자 초안 품질 향상

## 8) react-grab 연동

- 클립보드 기반 요소 컨텍스트 붙여넣기 지원
- 실시간 요소 전송 플로우(별도 플러그인 연동 필요)는 문서 가이드를 외부 환경에서 준비

## 9) TTS

- 서버 기반 `edge-tts-universal` 및 Web Speech API 폴백
- 메시지별 재생 토글, 자동 재생 큐, 오디오/에이전트 식별 표시

## 10) 실행/협업 시각화

- Execution Discussion, Agent Collaboration Matrix, 팀 Board/라운드 메트릭 등은 실시간/폴링 기반으로 노출
- `metadata.executionDiscussions`, `metadata.agentCollaboration` 등을 통해 뷰 데이터 구성
