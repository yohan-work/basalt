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
```

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
