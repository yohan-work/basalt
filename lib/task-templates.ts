
export interface TaskTemplate {
    id: string;
    name: string;
    icon: string;
    titlePrefix: string;
    description: string;
    priority: 'Low' | 'Medium' | 'High';
}

export const TASK_TEMPLATES: TaskTemplate[] = [
    {
        id: 'component',
        name: '컴포넌트 생성',
        icon: 'LayoutGrid',
        titlePrefix: 'Create component: ',
        description: `새 React 컴포넌트를 생성합니다.

요구사항:
- 컴포넌트 이름: [컴포넌트명]
- 위치: components/
- Props 정의 (TypeScript interface)
- Tailwind CSS로 스타일링
- 반응형 대응`,
        priority: 'Medium',
    },
    {
        id: 'api-endpoint',
        name: 'API 엔드포인트 추가',
        icon: 'Globe',
        titlePrefix: 'Add API endpoint: ',
        description: `새 API 엔드포인트를 생성합니다.

요구사항:
- 경로: /api/[경로]
- 메서드: [GET/POST/PUT/DELETE]
- 요청 body 스키마: {}
- 응답 스키마: {}
- 에러 처리 포함`,
        priority: 'Medium',
    },
    {
        id: 'bugfix',
        name: '버그 수정',
        icon: 'Bug',
        titlePrefix: 'Fix: ',
        description: `버그를 수정합니다.

현상:
- [어떤 문제가 발생하는지]

재현 방법:
1. [재현 순서]

기대 동작:
- [정상적으로 어떻게 동작해야 하는지]

관련 파일:
- [의심되는 파일 경로]`,
        priority: 'High',
    },
    {
        id: 'refactor',
        name: '리팩토링',
        icon: 'RefreshCw',
        titlePrefix: 'Refactor: ',
        description: `기존 코드를 리팩토링합니다.

대상 파일/모듈:
- [리팩토링 대상 경로]

리팩토링 목표:
- [ ] 가독성 개선
- [ ] 중복 코드 제거
- [ ] 타입 안전성 강화
- [ ] 성능 최적화

제약 사항:
- 기존 API/인터페이스 변경 없이 내부 구현만 개선`,
        priority: 'Low',
    },
    {
        id: 'page',
        name: '페이지 생성',
        icon: 'FileText',
        titlePrefix: 'Create page: ',
        description: `새 페이지를 생성합니다.

요구사항:
- 페이지 생성 경로: /[페이지 경로]
- 레이아웃: [레이아웃 설명]
- 주요 섹션:
  1. [섹션 1]
  2. [섹션 2]
- 반응형 대응
- SEO 메타데이터 포함`,
        priority: 'Medium',
    },
    {
        id: 'styling',
        name: '스타일링 개선',
        icon: 'Paintbrush',
        titlePrefix: 'Style: ',
        description: `UI 스타일을 개선합니다.

대상:
- [컴포넌트/페이지 경로]

변경 내용:
- [ ] 색상/타이포그래피
- [ ] 간격/정렬
- [ ] 애니메이션/트랜지션
- [ ] 다크모드 대응
- [ ] 반응형 대응`,
        priority: 'Low',
    },
    {
        id: 'test',
        name: '테스트 작성',
        icon: 'TestTube',
        titlePrefix: 'Test: ',
        description: `테스트 코드를 작성합니다.

대상:
- [테스트 대상 파일/함수]

테스트 범위:
- [ ] 정상 케이스
- [ ] 에러 케이스
- [ ] 엣지 케이스

테스트 프레임워크: [Jest/Vitest 등]`,
        priority: 'Medium',
    },
    {
        id: 'docs',
        name: '문서화',
        icon: 'BookOpen',
        titlePrefix: 'Docs: ',
        description: `문서를 작성하거나 업데이트합니다.

대상:
- [문서화 대상]

포함 내용:
- [ ] 개요 / 설명
- [ ] 사용 방법
- [ ] API 레퍼런스
- [ ] 예제 코드`,
        priority: 'Low',
    },
];
