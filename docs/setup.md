# 설치·실행·운영 가이드

태그: `#ops` `#setup` `#environment` `#demo`

이 문서는 새 환경에서 Basalt 데모를 실행하기 위한 최소 절차를 정리합니다.

## 빠른 시작

```bash
git clone <repository-url>
cd basalt
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

Node.js는 `20.9.0` 이상을 권장합니다. 이 저장소의 `package.json`은 Next.js 16과 React 19를 사용합니다.

## 필수 준비

### 1. Supabase

1. Supabase 프로젝트를 생성합니다.
2. Project URL과 anon key를 `.env.local`에 넣습니다.
3. Supabase SQL Editor에서 [`../supabase/schema.sql`](../supabase/schema.sql)을 실행합니다.

필수 환경 변수:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

최소 테이블:

- `Projects`: Basalt가 연결할 로컬 프로젝트 이름과 경로
- `Tasks`: 칸반 태스크, 상태, workflow, metadata
- `Execution_Logs`: step별 실행 로그와 agent/skill 결과

### 2. Ollama 또는 호환 LLM 엔드포인트

Basalt는 기본적으로 Ollama의 `/api/generate` 호환 API를 사용합니다.

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_KEEP_ALIVE=5m
FAST_MODEL=llama3.2:latest
SMART_MODEL=gemma4:e2b
CODING_MODEL=qwen2.5-coder:7b
MOCK_LLM=false
```

모델 이름은 로컬에 설치된 태그에 맞게 바꿀 수 있습니다. 모델별 역할은 [`llm.md`](./llm.md)를 참고하세요.

### 3. 대상 프로젝트

Basalt는 자기 자신이 아니라 “수정할 대상 프론트엔드 프로젝트”를 연결해 작업합니다.

- Basalt dev 서버: 보통 `http://localhost:3000`
- 대상 프로젝트 dev 서버: 예를 들어 `http://localhost:3001`

대상 프로젝트도 별도 터미널에서 `npm run dev` 등으로 실행해 두면 Preview와 QA 스모크가 더 잘 동작합니다.

## 데모 체크리스트

1. Basalt에서 프로젝트를 등록합니다.
2. 짧은 프론트엔드 수정 태스크를 생성합니다.
3. `Plan`을 실행해 workflow가 생기는지 확인합니다.
4. `Execute`를 실행해 로그가 쌓이는지 확인합니다.
5. `Task Details`에서 검증 결과, QA 결과, 후속 정리 패널을 확인합니다.

## 환경 변수

`.env.example`에 기본 항목이 있습니다. 주요 옵션은 아래와 같습니다.

```env
# 대상 앱 dev 서버 QA — 미설정 시 DEV_SERVER_URL, package.json 포트 추론, http://localhost:3001 순으로 폴백
QA_DEV_SERVER_URL=http://localhost:3001

# testing 단계 HTTP/브라우저 스모크 실패를 검증 실패로 처리
QA_FAIL_ON_PAGE_ERRORS=true

# Dev 종료 QA: 페이지 스모크 실패 시 자동 write_code 재시도 상한
DEV_QA_MAX_REPAIR_ROUNDS=5

# Dev 종료 QA 시작 시 대상 워크스페이스에서 next build 실행
DEV_QA_RUN_NEXT_BUILD=1

# next build 실패 시 Dev QA 즉시 실패
DEV_QA_FAIL_ON_NEXT_BUILD=1

# agent-browser CLI 경로. 스크린샷, 반응형 캡처, 네트워크/콘솔 진단에 사용
AGENT_BROWSER_BIN=/usr/local/bin/agent-browser
AGENT_BROWSER_ENABLED=true

# 다단계 코드 생성
BASALT_CODEGEN_MULTI_PHASE=1
BASALT_CODEGEN_MULTI_PHASE_MAX_RETRIES=1

# elevated-risk 스킬 경고/차단
BASALT_SKILL_RISK_MODE=warn
```

태스크 metadata로 QA 경로를 직접 지정할 수도 있습니다.

```json
{
  "qaDevServerUrl": "http://localhost:3001/custom",
  "qaDevServerPath": "/test"
}
```

## QA 아티팩트

Dev/Test 검증에서 스크린샷이 생성되면 대상 프로젝트 아래에 다음 경로가 생깁니다.

```text
.basalt/basalt-qa/<taskId>/
```

대상 프로젝트를 Git에 올리지 않으려면 해당 프로젝트의 `.gitignore`에 `.basalt/`를 추가하세요.

## Next.js dev (Turbopack)

개발 서버는 기본적으로 Turbopack을 사용합니다. Turbopack dev 파일시스템 영속 캐시는 [`../next.config.ts`](../next.config.ts)에서 끄는 설정이 있습니다.

캐시·압축 관련 오류가 나거나 동시 쓰기 메시지가 보이면 [`local-dev-troubleshooting.md`](./local-dev-troubleshooting.md)의 Turbopack 절을 따르세요.

## 스크립트

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run test:arg-schemas
npm run test:command-risk
npm run test:session-memory
npm run test:path-sandbox
npm run test:next-validator
```

실험용 스크립트:

- `scripts/test-orchestrator.ts`
- `scripts/test-plan-generation.ts`
- `scripts/simulate_team_collab.ts`
- `scripts/test-intelligence.ts`

실행 예시:

```bash
npx tsx scripts/test-orchestrator.ts
```
