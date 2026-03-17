# UI 및 컴포넌트 가이드

Basalt 핵심 화면 요소는 `components/` 기준으로 관리됩니다.

## 핵심 컴포넌트

- `KanbanBoard`: Request/Plan/Dev/Test/Review/Failed 보드, 실시간 구독
- `LogViewer`: 실행 로그 뷰어(THOUGHT/ACTION/RESULT/ERROR)
- `AgentDiscussion`/`OfficeLayout`/`AgentAvatar`: 가상 오피스형 브레인스토밍/상태 시각화
- `TaskDetailsModal`: 코드 수정/요소 수정/리뷰 결과 탭 통합
- `ProjectPreviewPanel`: 미리보기 iframe/포트 관리
- `ProjectSelector`: 프로젝트 선택·생성
- `CreateTaskModal`: 컴포넌트 선택 옵션 포함 태스크 생성 폼
- `CodeDiffViewer`: 변경사항 시각화
- `DoneTasksArchive`: 완료 아카이브
- `IncomingReactGrabProvider`: 요소 컨텍스트 수신 브릿지

## 분석/대시보드 컴포넌트

- `AnalyticsDashboard`
- `DailyTokenChart`
- `AgentActivityChart`
- `AgentActionRadarChart`
- `ErrorRankingTable`
- `PerformanceBenchmarkPanel`
- `TeamActivityView`
- `StatCard`
- `ChatChannel`
- `CollaborationMatrix`

## 공통 UI

`components/ui`에는 shadcn/radix 기반 원자 컴포넌트가 존재합니다.

예시: `Avatar`, `Badge`, `Button`, `Calendar`, `Card`, `DateRangePicker`, `Dialog`, `Input`, `Label`, `Popover`, `ScrollArea`, `Select`, `Separator`, `Skeleton`, `Table`, `Tabs`

## 페이지

- `/`: 메인 보드/진행 모니터
- `/analytics`: 통계 및 지표 페이지
- `/done`: 완료 태스크 아카이브 페이지
