# LLM 운영 가이드

태그: `#llm` `#model` `#prompt` `#stability`

Basalt의 AI 활용은 단일 챗봇 호출이 아니라 `계획 -> 실행 -> 검증 -> 정리` 흐름에 맞춘 모델 라우팅과 agent/skill 실행 구조입니다.

## 모델 구성

`lib/model-config.ts` 기준 기본값은 다음과 같습니다.

| 역할 | 환경 변수 | 기본 모델 | 주요 사용처 |
| --- | --- | --- | --- |
| 빠른 판단 | `FAST_MODEL` | `llama3.2:latest` | 경량 의사결정, 일부 skill 인자 생성 |
| 분석/추론 | `SMART_MODEL` | `gemma4:e2b` | 태스크 분석, workflow 설계, 검토, 검증, Markdown 요약 |
| 코드 생성 | `CODING_MODEL` | `qwen2.5-coder:7b` | 코드 생성, 수정, repair, 다단계 구현 |

모델 이름은 `.env.local`에서 로컬 Ollama 태그나 호환 엔드포인트에 맞게 바꿀 수 있습니다.

## 처리 흐름

1. 사용자가 태스크를 생성합니다.
2. `ProjectProfiler`가 대상 프로젝트의 구조, 의존성, 라우터, UI 컴포넌트, stack rules를 수집합니다.
3. `analyze_task`가 필요한 역할과 위험을 분석합니다.
4. `create_workflow`가 실행 가능한 step 목록을 만듭니다.
5. `consult_agents`가 필요한 agent 의견을 모읍니다.
6. `Orchestrator`가 step별 skill을 실행하고 결과를 `Execution_Logs`와 `Tasks.metadata`에 저장합니다.
7. QA/검증 단계에서 실패 신호를 기록하고 필요하면 repair 루프에 전달합니다.

## 프롬프트 구성

프롬프트는 다음 정보를 조합해 만듭니다.

- 사용자 태스크 제목과 설명
- 명확화 질문 답변과 spec expansion
- 대상 프로젝트의 파일 구조, package.json, 라우터 정보
- 설치된 패키지 목록과 import 제한
- Next.js App Router, RSC, metadata, `use client` 관련 규칙
- 기존 실행 로그와 실패/검증 결과
- agent/skill별 역할 계약

긴 시스템 규칙 문자열은 `lib/prompts/`에 모듈로 분리되어 있고, `lib/llm.ts`는 이 모듈을 import해 호출을 조립합니다. 예시는 `code-generation-rules`, `file-format`, `surgical-edit-rules`, `codegen-plan`입니다.

## 역할별 출력

| 단계 | 입력 | 출력 |
| --- | --- | --- |
| Plan | 태스크, 프로젝트 컨텍스트, 명확화 답변 | workflow, risk, required agents |
| Execute | workflow step, 파일 컨텍스트, 제한 조건 | 코드 변경, 로그, fileChanges |
| Verify | 변경 파일, QA 로그, 스모크 결과 | pass/fail 판단, 검증 메타데이터 |
| Recovery/Handoff | 실패/실행 메타데이터 | 복구 가이드, 인수인계 Markdown |

## 안정성 정책

- Exponential backoff 재시도: 최대 3회 (`0.5초 -> 1초 -> 2초`)
- 타임아웃
  - 코드 생성: 180초
  - JSON 생성: 90초
- JSON 파싱 방어
  - 모델 출력이 일부 깨져도 즉시 크래시하지 않도록 안전 파싱
- 코드 생성 가드
  - 미설치 npm 패키지 import 차단
  - 존재하지 않는 `@/components/ui/*` import 차단 또는 repair
  - Next.js App Router의 RSC/metadata 경계 위반 저장 전 차단
  - 신규 기능 페이지에서 루트 페이지 임의 덮어쓰기 방지
- QA 피드백 루프
  - Dev 종료 전 페이지 스모크, 브라우저 진단, verify, screenshot/responsive 결과를 메타데이터에 저장

## 다단계 코드 생성

`BASALT_CODEGEN_MULTI_PHASE=1`이면 `write_code` 경로에서 먼저 짧은 JSON plan을 만들고, 이후 구현 코드를 생성합니다. 저장 후 typecheck 실패가 남으면 진단을 포함해 제한된 횟수만큼 재구현을 시도합니다.

관련 옵션:

- `BASALT_CODEGEN_MULTI_PHASE=1`
- `BASALT_CODEGEN_MULTI_PHASE_MAX_RETRIES=1`
- UI의 `multiPhaseCodegen` 실행 옵션

## Ollama `/api/generate` 호출 규약

`lib/llm.ts`와 일부 API route는 Ollama에 `POST /api/generate`로 JSON 본문을 보냅니다.

- `OLLAMA_BASE_URL`로 엔드포인트를 바꿀 수 있습니다.
- `OLLAMA_KEEP_ALIVE`로 모델 warm 유지 시간을 조정할 수 있습니다.
- HTTP 200이어도 본문에 `error`가 있거나 `response`가 비어 있으면 실패로 처리하는 것이 안전합니다.
- thinking 계열 모델은 내부 추론 때문에 `response`가 비어 보일 수 있어, 모델/버전에 따라 `think: false` 옵션이 필요할 수 있습니다.

증상별 대응은 [`local-dev-troubleshooting.md`](./local-dev-troubleshooting.md)를 참고하세요.

## 관련 문서

- 기능 흐름: [`features.md`](./features.md)
- Agent/Skill 계약: [`agents-skills.md`](./agents-skills.md)
- Orchestrator 구조: [`architecture/orchestrator.md`](./architecture/orchestrator.md)
- 설치와 환경 변수: [`setup.md`](./setup.md)
