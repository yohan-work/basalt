---
name: stack_rules_static_html
description: package.json 없음 또는 정적 자산 중심 — 상대 경로, 번들 없음
---

# Static HTML / CSS / JS

`package.json`이 없거나, 빌드 도구 없이 HTML/CSS/JS만 다루는 경우.

## Inputs

- **index.html** 위치(루트 vs `public/`)
- 스크립트가 **type="module"** 인지, 전역 `<script>` 인지

## Outputs

- 링크·이미지·스크립트는 **HTML 파일 기준 상대 경로**로 유지한다.

## Instructions

1. **npm import**가 불가하면 CDN·상대 경로 스크립트만 사용한다(프로젝트에 이미 있는 방식 유지).
2. 모던 `import` 문법은 브라우저가 module로 로드할 때만 사용한다.
3. 경로 깨짐을 막기 위해 배포 시 **서브디렉터리** 여부를 사용자/CONTEXT에서 확인한다.

## MUST NOT

- `INSTALLED PACKAGES`가 비어 있는데 `import axios from 'axios'` 같은 번들 import.
- Next/Vite 설정을 가정.

## Use Cases

- 랜딩 정적 프로토타입, 내장 브라우저 데모 HTML.

## Reference

- MDN — HTML script, module.
