# 대상 워크스페이스(앱) 환경 파악

태그: `#workspace` `#profiler` `#stack` `#qa`

Basalt가 코드를 쓰거나 QA할 **대상 저장소**(태스크에 연결된 프로젝트 루트)의 구조·스택을 정확히 알아야 플랜·실행·스모크 URL·UI 스캐폴드가 틀어지지 않습니다. 자동으로 채워지는 부분은 `ProjectProfiler`(`lib/profiler.ts`)·`inferStackProfile`(`lib/stack-profile.ts`)·`scan_project` 스킬이 담당하고, **사람이 문서화·검토할 때**는 아래 체크리스트를 씁니다.

## 자동 프로파일과의 역할 분담

| 영역 | 자동(코드) | 수동(이 문서) |
|------|------------|----------------|
| `package.json` 의존성·메이저 버전 | `getProfileData()`, `[PROJECT CONTEXT]` | 락파일·모노레포 서브패키지 여부 확인 |
| App / Pages / Vite 등 라우터 종류·Router Base | `stack-profile`, 이중 `app`/`src/app` 경고 | 비표준 폴더명·커스텀 번들러 |
| `components/ui` 존재·배럴 | UI 키트 스캔, `UI_COMPONENT_POLICY` | 디자인 시스템이 다른 경로에만 있을 때 |
| QA dev URL | `resolveQaPageUrlWithDiagnostics`, 메타 `qaDevServerUrl` 등 | 방화벽·포트·HTTPS 로컬 프록시 |
| 스택 규칙 팩 | `[STACK_RULES]` 주입 | 새 프레임워크용 `lib/stack-rules/*.md` 추가 검토 |

## 체크리스트 (대상 앱 루트 기준)

### 1. 식별

- [ ] Node/npm/pnpm/yarn 버전 요구사항(엔진 필드·CI와 동일한지)
- [ ] 단일 패키지 vs 모노레포(실제 빌드 대상 `package.json`이 태스크 경로와 일치하는지)

### 2. 라우팅·소스 트리

- [ ] Next: `app/` vs `src/app/` 단일 루트인지, **동시 존재** 시 어느 쪽이 실제 페이지가 많은지(경고 `routerDualRoot` 참고)
- [ ] Pages Router 잔존 여부, 기타(Vite·Nuxt 등)는 `structure`·스택 규칙 팩 확인

### 3. 경로 별칭·import

- [ ] `tsconfig.json` / `jsconfig.json`의 `paths["@/*"]`가 **실제 소스 루트**와 맞는지(`BASALT_ALIGN_NEXT_PATH_ALIAS`는 예외 보정용)
- [ ] `@/components/ui`가 가리키는 **물리 디렉터리**(루트 `components/ui` vs `src/components/ui`)

### 4. 스타일·UI

- [ ] Tailwind / CSS Modules / SCSS 중 무엇을 쓰는지, `globals.css`·`tailwind.config.*` 위치
- [ ] shadcn·Radix 등 **이미 설치된 UI 키트** 범위(자동 스캐폴드와 충돌 없는지)

### 5. QA·런타임

- [ ] 대상 dev 서버 포트·명령(`npm run dev`) — Basalt 메타 `qaDevServerUrl` / `QA_DEV_SERVER_URL`과 일치
- [ ] `agent-browser` CLI 사용 시: 별도 터미널 PATH와 **Basalt를 띄운 프로세스 PATH**가 다를 수 있음 → [`setup.md`](./setup.md)의 `AGENT_BROWSER_BIN` 등 참고

### 6. 보안·비밀

- [ ] `.env` 예시만 저장소에 있고, 실제 비밀은 Basalt/대상 앱 각각 로컬 규칙 준수

## 관련 코드·문서

- 플랜·실행 컨텍스트: [`features.md`](./features.md) §11, [`agents-skills.md`](./agents-skills.md)
- 스모크·URL 추론: [`architecture/orchestrator.md`](./architecture/orchestrator.md), `lib/qa/*`, `lib/project-dev-server.ts`
- 스택 규칙 팩: `lib/stack-rules/`, [`stack.md`](./stack.md)
