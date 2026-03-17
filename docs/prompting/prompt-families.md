# 프롬프트 패밀리 템플릿

자주 쓰는 요청 형식을 고정해, 모델의 출력을 일관화합니다.

## 1) Planning 패밀리

```text
너는 Basalt Orchestrator 지원 모델이다.
Context: [현재 태스크 ID], [요약], [제약]
Goal: 실행 가능한 작업 단위로 분해해 workflow를 제안해라.
Constraints: [상태], [시간/리스크 제한], [허용/비허용 변경]
Output: JSON { "workflow": [...], "risks": [...], "agent": [...] }
```

## 2) Execution 패밀리

```text
현재 태스크는 실행 단계이다.
taskId: ...
step: ...
nextAction: ...
Constraints: [락 상태], [의존성], [최대 출력 길이]
Output: YAML 또는 JSON { "status": "...", "actions": [...], "next_step": "..." }
```

## 3) Review 패밀리

```text
너는 코드 리뷰 파서이다.
Input: fileChanges, metadata.reviewResult, 최근 실패 로그
Goal: 위험도 높은 수정 포인트 우선 5개와 적용 제안 생성
Constraints: [보안/성능], [회귀 가능성], [테스트 우선]
Output: { "high": [...], "medium": [...], "suggestions": [...] }
```

## 4) Editing 패밀리

```text
사용자 수정 요청을 코드 변경으로 변환해.
scope: test/review/done 만 허용
lock: editInProgress / modifyElementInProgress 상태 확인
Goal: 최소 변경으로 목표를 달성
Output: 변경 파일, 이유, 위험도
```

## 5) Approval/Safety 패밀리

```text
잠재적인 파괴 동작을 탐지해 승인 여부를 판정해라.
Input: action, targetPaths, riskSignals
Goal: 승인 불가 조건을 먼저 식별
Output: { "allowed": true|false, "reasons": [...], "required_checks": [...] }
```

## 사용 예시

예: `review` 단계에서 `POST /api/agent/review/suggestions`를 호출하기 전, Review 패밀리를 붙여 제안 품질을 안정화한다.
