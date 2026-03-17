# LLM 운영 가이드

Basalt의 LLM 호출은 `lib/llm.ts`에서 공통 처리됩니다.

## 모델 구성

`lib/model-config.ts` 기준 기본값은 다음과 같습니다.

- 빠른 응답(FAST): `llama3.2:latest` (`FAST_MODEL`)
- 분석/추론(SMART): `gemma3:latest` (`SMART_MODEL`)
- 코드 생성(CODING): `qwen2.5-coder:7b` (`CODING_MODEL`)

## 안정성 정책

- Exponential backoff 재시도: 최대 3회 (`0.5초 -> 1초 -> 2초`)
- 타임아웃
  - 코드 생성: 180초
  - JSON 생성: 90초
- JSON 파싱 방어
  - 모델 출력이 단편적으로 떨어져도 크래시가 나지 않도록 안전 파싱

## 호출 모드

- 스트리밍 모드(`generateCodeStream`, `generateJSONStream`) 지원
- 환경 변수로 `OLLAMA_BASE_URL` 재정의 가능

## App Router 가드

- Next.js 훅/컴포넌트 규칙을 위반하지 않도록 `use client` 프롬프트 규칙이 강화되어 있습니다.
- SEO 필수 메타(`title`, `meta`) 및 라우팅 규칙 준수 체크를 함께 수행합니다.

## 동적 라우팅

- 스킬 난이도에 따라 FAST/SMART 모델을 자동 분기
- 프로젝트 프로파일(`lib/profiler.ts`) 기반 경로/임포트 안정성 강화
