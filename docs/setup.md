# 설치·실행·운영 가이드

태그: `#ops` `#setup` `#script` `#environment`

## 빠른 시작

```bash
git clone <repository-url>
cd basalt
npm install

# .env.local 직접 생성/편집
npm run dev
```

브라우저: `http://localhost:3000`

## Next.js dev (Turbopack)

개발 서버는 기본적으로 Turbopack을 사용한다. Turbopack dev **파일시스템 영속 캐시**는 [`next.config.ts`](../next.config.ts)에서 끄는 설정이 있다. 캐시·압축 관련 오류가 나거나 동시 쓰기 메시지가 보이면 [`local-dev-troubleshooting.md`](./local-dev-troubleshooting.md)의 Turbopack 절을 따른다.

## 환경 변수

```env
# 필수
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# 선택
OLLAMA_BASE_URL=http://127.0.0.1:11434
FAST_MODEL=llama3.2:latest
SMART_MODEL=gemma3:latest
CODING_MODEL=qwen2.5-coder:7b
MOCK_LLM=false

# consult_agents 참가자 상한 (기본 8, 최대 16)
# CONSULT_MAX_PARTICIPANTS=8

# 대상 앱(워크스페이스) dev 서버 QA — 미설정 시 DEV_SERVER_URL → package.json 포트 추론 → http://localhost:3001
# QA_DEV_SERVER_URL=http://localhost:3001
# (환경변수·메타 URL은 path가 있어도 origin만 사용하고, 경로는 fileChanges 추론 또는 메타로 합칩니다.)

# 태스크 metadata 예시 (Supabase Tasks.metadata JSON):
# "qaDevServerUrl": "http://localhost:3001/custom"   — 전체 URL에 path 포함 시 그대로 QA
# "qaDevServerPath": "/test"                          — origin만 env로 잡고 이 path로 접속
# "qaRouteInferenceWarning": "..."                    — (자동) App Router URL 추론이 실패했을 때 안내 문자열

# testing 단계 HTTP/브라우저 스모크 실패 시 검증 실패로 처리 (기본: 경고만, 메타에 qaPageCheck 저장)
# QA_FAIL_ON_PAGE_ERRORS=true

# Dev 종료 QA: 페이지 스모크 실패 시 자동 write_code 재시도 상한 (기본 5, 최대 12)
# DEV_QA_MAX_REPAIR_ROUNDS=5

# Dev 종료 QA 시작 시 대상 워크스페이스에서 `next build` 실행(느림). stdout/stderr 발췌는 메타 `devQaNextBuild`·자동 수정 프롬프트에 포함.
# DEV_QA_RUN_NEXT_BUILD=1
# 위와 함께 켰을 때 `next build`가 비정상 종료면 Dev QA 파이프라인을 즉시 실패 처리.
# DEV_QA_FAIL_ON_NEXT_BUILD=1

# 대상 프로젝트에 components/ui 가 없을 때(스캔 기준) Next/React 에서 최소 button·input·label 자동 생성 (기본: 켜짐). 끄려면:
# BASALT_AUTO_SCAFFOLD_UI=0

# write_code 시 @/components/ui/<name> 누락에 대한 확장 스캐폴드(textarea 등). 끄려면:
# BASALT_AUTO_SCAFFOLD_UI_EXTENDED=0

# 태스크당 LLM 토큰 상한의 절대 상한(동적 예산은 그 아래로 계산). 기본 약 400만. 0 또는 unlimited 는 사실상 무제한에 가깝게 취급.
# BASALT_MAX_TOKENS_PER_TASK_CEILING=4000000

# Next: src/app 만 있고 루트 app/ 이 없는데 tsconfig 의 @/* 가 ./* 만 가리키는 경우에만, tsconfig.json 의 paths 를 ./src/* 로 맞춤 (선택).
# BASALT_ALIGN_NEXT_PATH_ALIAS=1

# Dev 종료 QA: 스크린샷·반응형 캡처·스모크(콘솔/네트워크)에 쓰는 agent-browser CLI (외부 바이너리).
# 동일 오리진 fetch/XHR 4xx/5xx 탐지는 agent-browser 0.23+ 권장(구버전은 network 로그가 비어 있을 수 있음).
# PATH에 없거나 IDE가 다른 환경으로 서버를 띄우면 탐지 실패할 수 있음 → 절대 경로 지정 권장.
# AGENT_BROWSER_BIN=/usr/local/bin/agent-browser
# 명시적으로 끄기(스크린샷·브라우저 기반 스모크 보강 생략, HTML 문자열 스모크는 유지).
# AGENT_BROWSER_ENABLED=false
```

대상 프로젝트 루트에 Basalt가 QA PNG를 쓸 때 `.basalt/basalt-qa/<taskId>/`가 생깁니다. 해당 레포를 Git에 올리지 않으려면 그 프로젝트의 `.gitignore`에 `.basalt/`를 추가하세요.

## 사용 예시

- 실행 옵션: `discussionMode`, `maxDiscussionThoughts`, `strategyPreset`
- 팀 협업 실행: `/api/team/execute` + `runId` 조회
- 리뷰 제안 적용, 파일 패치, 요소 수정은 상태 조건을 준수해야 함

## 스크립트

- `simulate_team_collab.ts`
- `test-intelligence.ts`
- `test-intelligence-signup.ts`
- `test-loader.ts`
- `test-orchestrator.ts`
- `test-plan-generation.ts`
- `test-extraction.ts`

실행 예시:

```bash
npx tsx scripts/test-orchestrator.ts
```
