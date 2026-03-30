# 로컬 개발·Turbopack·Ollama 트러블슈팅

태그: `#dev` `#turbopack` `#ollama` `#realtime` `#local`

Basalt를 로컬에서 `npm run dev`로 돌릴 때 나올 수 있는 이슈와, Ollama·Supabase Realtime과 맞물린 증상을 정리합니다. 코드 세부는 [`llm.md`](./llm.md)·[`setup.md`](./setup.md)·[`features.md`](./features.md) §13과 교차 참고하세요.

## Turbopack dev 캐시

**설정**: 루트 [`next.config.ts`](../next.config.ts)에 `experimental.turbopackFileSystemCacheForDev: false`가 있으면, Turbopack이 dev 중 파일시스템에 영속 캐시를 쓰지 않습니다. 동시 쓰기·압축 관련 오류를 줄이기 위한 목적입니다.

**자주 보이는 메시지**

- `Persisting failed: ... Compression of value for blob file failed` / `CompressionFailed`
- `Persisting failed: Another write batch or compaction is already active (Only a single write operations is allowed at a time)`

**대응**

- 위 설정이 켜져 있는지 확인한다.
- 증상이 남으면 dev 서버를 끄고 프로젝트 루트에서 `.next` 디렉터리를 삭제한 뒤 `npm run dev`를 다시 실행한다.

**참고**: 첫 요청 컴파일 시간은 환경·의존성·캐시 상태에 따라 수십 초까지 갈 수 있다. “캐시 오류”와 별개로 느릴 수 있다.

## AI Enhance vs 유사 태스크 (로그 혼동)

- **AI Enhance**(프롬프트 고도화): `POST /api/agent/enhance-prompt` — [`CreateTaskModal`](../components/CreateTaskModal.tsx)의 AI Enhance 버튼이 호출한다. Ollama `SMART_MODEL`을 사용한다.
- **유사 완료 태스크**: `GET /api/tasks/similar` — 제목·설명 입력 시 디바운스로 조회한다. **LLM을 쓰지 않는다.**

터미널에 `GET /api/tasks/similar`만 보이고 enhance 결과가 갱신되지 않으면, enhance 요청(`POST .../enhance-prompt`)이 실패했거나 응답이 비었을 수 있다. 유사 태스크 200 응답만으로 enhance 성공을 판단하면 안 된다. 상세는 [`features.md`](./features.md) §13·§13e.

## Ollama `/api/generate` (Qwen3.x thinking·빈 응답)

**thinking 계열 모델**: Ollama에서 Qwen3.x 등 thinking 모델을 쓸 때, 내부 추론에 토큰이 쓰이면 JSON의 `response` 필드가 비어 보일 수 있다. Ollama 쪽에서는 `/api/generate` 요청 본문 **최상위**에 `think: false`를 두는 방식이 언급된다(모델·Ollama 버전에 따라 동작이 다를 수 있음).

**HTTP 200이어도 실패로 취급해야 하는 경우**

- 본문에 `error` 문자열 필드가 있는 경우
- `response`가 없거나 공백만 있는 경우

서버 라우트·[`lib/llm.ts`](../lib/llm.ts)에서 위를 검사하지 않으면 재시도 로그만 반복되거나 UI가 조용히 갱신되지 않을 수 있다. 구현 시에는 `data.error` 확인·`response` trim·적절한 HTTP 상태(예: 502)와 클라이언트 메시지를 권장한다.

## Supabase Realtime과 부분 `payload.new`

`postgres_changes`의 `UPDATE`에서 `payload.new`가 **행 전체가 아니라 일부 컬럼만** 담기는 경우, 클라이언트에서 `payload.new`로 기존 태스크 객체를 통째로 바꾸면 `title`·`description` 등이 `undefined`로 덮여 **화면에서 문구가 사라진 것처럼** 보일 수 있다.

**권장**: Realtime으로 받은 필드만 이전 상태에 병합하는 패턴(방어적 merge). [`KanbanBoard`](../components/KanbanBoard.tsx)의 `setTasks` / `setSelectedTask` 갱신 시 유의한다.

## spec-expand UI와 `metadata.specExpansion`

성공 시 서버가 `Tasks.metadata.specExpansion`에 `{ markdown, generatedAt }`을 저장하고, UI는 일반적으로 그 메타를 읽어 표시한다. Realtime 전파가 늦으면 “생성했는데 바로 안 보임”처럼 느껴질 수 있다. 그 경우 API 응답 본문을 로컬 state에 반영하는 패턴으로 보완할 수 있다(구현 여부는 [`TaskDetailsModal`](../components/TaskDetailsModal.tsx)를 확인).

### AC·스모크 시나리오 생성 — “JSON이 필요한데 HTML” / HTTP 404

버튼은 `POST /api/agent/spec-expand`를 호출한 뒤 [`parseResponseAsJson`](../lib/fetch-json.ts)으로 본문을 파싱한다. 응답이 `<!DOCTYPE html>…`처럼 **HTML**이면 JSON 파싱 전에 오류가 난다.

- **태스크가 없을 때** API는 `404`이지만 본문은 **`{ "error": "Task not found" }` 형태의 JSON**이다. 그 경우 메시지는 보통 “Task not found” 류로 표시된다.
- **HTTP 404 + HTML**(한국어 `lang` 속성이 있는 문서 등)이면, 대개 **Basalt의 Route Handler에 도달하지 못하고** Next(또는 프록시)의 **HTML 404 페이지**가 온 것이다.

**확인 체크리스트**

1. 브라우저 개발자 도구 **Network**에서 `spec-expand` 요청의 **전체 URL**이 Basalt 앱 호스트인지(대상 워크스페이스 dev 포트만 연 탭이 아닌지).
2. 응답 **Content-Type**이 `text/html`인지, **Preview**가 앱 404 페이지인지.
3. 리버스 프록시·팀널 사용 시 **`/api` 경로가 Basalt로 프록시**되는지.
4. 배포 환경이면 최신 빌드에 `app/api/agent/spec-expand/route.ts`가 포함됐는지.

**URL이 이미 `http://localhost:3000/api/agent/spec-expand`처럼 로컬인데도 HTML 404인 경우**

- 오리진 불일치가 아니라 **그 포트에서 돌아가는 dev가 이 Basalt 트리가 아니거나**, **`.next`/Turbopack 캐시**로 라우트가 비어 보이는 경우가 흔합니다.
- 터미널에서 **Basalt 루트**인지 확인한 뒤 `.next`를 지우고 `npm run dev`를 다시 실행해 본다.
- 브라우저 주소창 또는 `curl -s http://localhost:3000/api/agent/spec-expand`로 **`GET`**을 호출한다. JSON에 `ok`, `service: "spec-expand"`가 오면 라우트는 등록된 것이고, 여전히 HTML 404면 **3000 포트에 다른 프로세스**가 붙어 있을 가능성을 의심한다.

자세한 오류 문구는 `lib/fetch-json.ts`의 HTML 분기에서 상태 코드별 힌트를 병합한다.

## Ollama 느려짐·무응답 (모델 여러 개 import 이후)

Hugging Face 등에서 GGUF를 연속 import하거나 대형 모델을 여러 개 두면 디스크·RAM·VRAM 압박으로 추론이 매우 느려지거나 타임아웃처럼 보일 수 있다.

**점검**

- `ollama ps` — 현재 메모리에 올라간 모델
- `ollama list` — 설치된 태그
- `~/.ollama`가 있는 볼륨의 디스크 여유
- 시스템 RAM·스왑 사용량

**완화**: 개발 중에는 `.env.local`의 `SMART_MODEL`·`CODING_MODEL`을 문서 기본값처럼 상대적으로 가벼운 태그로 두고, 대형 모델은 필요할 때만 쓴다. [`setup.md`](./setup.md) 환경 변수 절 참고.

## 타입 검사 (`tsc --noEmit`)

저장소 전체 `tsc --noEmit`이 [`ProjectPreviewPanel`](../components/ProjectPreviewPanel.tsx) 등 **기존 파일**의 타입 오류로 실패할 수 있다. 정책·완화 절차는 [`typescript-mitigation-and-validation.md`](./typescript-mitigation-and-validation.md)를 본다.

## 알려진 원인 vs 권장 패치 (요약)

- **Turbopack 영속 캐시**: 반영되는 경우가 많은 것 — `next.config.ts`에서 dev 파일시스템 캐시 끔. 권장 보완 — `.next` 삭제 후 재시도.
- **Qwen thinking·빈 `response`**: 권장 보완 — `/api/generate`에 `think: false`(최상위), `data.error`·빈 `response` 처리.
- **Realtime 부분 페이로드**: 권장 보완 — `payload.new`와 기존 행 병합.
- **spec-expand 즉시 표시**: 권장 보완 — API 응답을 로컬 state에 반영.

위 항목은 코드가 갱신되면 이 절을 “구현됨” 기준으로 다시 맞춘다.
