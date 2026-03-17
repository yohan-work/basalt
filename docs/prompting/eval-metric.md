# 프롬프트 평가 지표

프롬프트 변경 전후 성능 변화를 측정하기 위한 최소 지표입니다.

- 정확성(Accuracy): 목표 태스크에서 요구 기능이 충족되는 비율
- 규칙 준수(Safety): 금지 동작/락 위반/권한 위반 감지 건수
- 일관성(Consistency): 동일 입력에서 동일 패턴으로 응답되는 비율
- 실행성(Executability): 제안이 실제 API 호출로 이어지는 비율
- 개선 효율(Delta Gain): 이전 대비 에러 재발생 감소율

평가 형식 예시:

```json
{
  "taskId": "",
  "scenario": "",
  "accuracy": 0.0,
  "safetyViolations": 0,
  "consistency": 0.0,
  "executability": 0.0,
  "deltaGain": 0.0,
  "notes": ""
}
```

평가 주기
- 스텝별: 실험 템플릿 반영 후 5~10개 태스크로 샘플링
- 릴리즈 전: 변경된 prompt-family 전부에 대해 회귀 체크
