
export interface TemplateFieldOption {
    label: string;
    value: string;
}

export interface TemplateField {
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'checkbox-group' | 'radio' | 'props-builder';
    placeholder?: string;
    options?: TemplateFieldOption[];
    required?: boolean;
    defaultValue?: string | string[];
}

export type TemplateFieldValues = Record<string, string | string[]>;

// --- Props Builder Types ---

export interface PropDefinition {
    name: string;
    type: string;
    required: boolean;
    defaultValue?: string;
    description?: string;
}

export const PROP_TYPE_OPTIONS = [
    'string',
    'number',
    'boolean',
    'ReactNode',
    '() => void',
    'string[]',
    'Record<string, any>',
    'custom',
] as const;

export interface ComponentPatternPreset {
    id: string;
    name: string;
    description: string;
    defaultProps: PropDefinition[];
    features: string[];
    accessibilityNotes: string;
}

export const COMPONENT_PATTERN_PRESETS: ComponentPatternPreset[] = [
    {
        id: 'display-card',
        name: 'Display Card',
        description: '정보 표시 카드 (프로필, 상품, 콘텐츠 등)',
        defaultProps: [
            { name: 'title', type: 'string', required: true, description: '카드 제목' },
            { name: 'description', type: 'string', required: false, description: '카드 설명' },
            { name: 'imageUrl', type: 'string', required: false, description: '이미지 URL' },
            { name: 'footer', type: 'ReactNode', required: false, description: '하단 영역 커스텀 콘텐츠' },
            { name: 'onClick', type: '() => void', required: false, description: '클릭 핸들러' },
            { name: 'className', type: 'string', required: false, description: '추가 CSS 클래스' },
        ],
        features: [
            '이미지 로딩 실패 시 fallback 처리',
            '텍스트 오버플로우 ellipsis 처리',
            'hover 인터랙션 효과',
        ],
        accessibilityNotes: 'onClick이 있을 경우 role="button" 및 tabIndex=0, 키보드 Enter/Space 이벤트 처리',
    },
    {
        id: 'form',
        name: 'Form',
        description: '입력 폼 (로그인, 설정, 데이터 입력 등)',
        defaultProps: [
            { name: 'onSubmit', type: '(values: FormValues) => void', required: true, description: '폼 제출 핸들러' },
            { name: 'initialValues', type: 'Partial<FormValues>', required: false, description: '초기 폼 값' },
            { name: 'loading', type: 'boolean', required: false, defaultValue: 'false', description: '제출 중 로딩 상태' },
            { name: 'disabled', type: 'boolean', required: false, defaultValue: 'false', description: '폼 비활성화' },
            { name: 'onCancel', type: '() => void', required: false, description: '취소 핸들러' },
            { name: 'className', type: 'string', required: false, description: '추가 CSS 클래스' },
        ],
        features: [
            '필드별 유효성 검증 및 에러 메시지',
            '제출 시 로딩 상태 표시',
            'Enter 키로 제출 지원',
            '폼 초기화 기능',
        ],
        accessibilityNotes: 'label과 input 연결 (htmlFor/id), aria-invalid, aria-describedby로 에러 메시지 연결, 포커스 관리',
    },
    {
        id: 'data-table',
        name: 'Data Table',
        description: '데이터 테이블 (목록, 관리 화면 등)',
        defaultProps: [
            { name: 'columns', type: 'ColumnDef[]', required: true, description: '컬럼 정의 배열' },
            { name: 'data', type: 'T[]', required: true, description: '테이블 데이터' },
            { name: 'onSort', type: '(column: string, direction: "asc" | "desc") => void', required: false, description: '정렬 핸들러' },
            { name: 'onRowClick', type: '(row: T) => void', required: false, description: '행 클릭 핸들러' },
            { name: 'pagination', type: '{ page: number; pageSize: number; total: number }', required: false, description: '페이지네이션 설정' },
            { name: 'loading', type: 'boolean', required: false, defaultValue: 'false', description: '로딩 상태' },
            { name: 'emptyMessage', type: 'string', required: false, defaultValue: '"데이터가 없습니다"', description: '빈 상태 메시지' },
            { name: 'className', type: 'string', required: false, description: '추가 CSS 클래스' },
        ],
        features: [
            '컬럼별 정렬 기능',
            '빈 상태(empty state) 표시',
            '로딩 스켈레톤',
            '행 hover 하이라이트',
            '페이지네이션 UI',
        ],
        accessibilityNotes: 'role="table", 정렬 시 aria-sort, scope="col"/"row" 헤더 적용',
    },
    {
        id: 'modal',
        name: 'Modal / Dialog',
        description: '모달 다이얼로그 (확인, 폼 입력, 상세 보기 등)',
        defaultProps: [
            { name: 'open', type: 'boolean', required: true, description: '모달 열림 상태' },
            { name: 'onOpenChange', type: '(open: boolean) => void', required: true, description: '열림 상태 변경 핸들러' },
            { name: 'title', type: 'string', required: true, description: '모달 제목' },
            { name: 'description', type: 'string', required: false, description: '모달 설명' },
            { name: 'children', type: 'ReactNode', required: false, description: '모달 본문 콘텐츠' },
            { name: 'footer', type: 'ReactNode', required: false, description: '하단 액션 영역' },
            { name: 'className', type: 'string', required: false, description: '추가 CSS 클래스' },
        ],
        features: [
            'ESC 키로 닫기',
            '오버레이 클릭으로 닫기',
            '포커스 트랩',
            '열림/닫힘 애니메이션',
        ],
        accessibilityNotes: 'role="dialog", aria-modal="true", aria-labelledby로 제목 연결, 포커스 트랩 구현',
    },
    {
        id: 'list',
        name: 'List / Feed',
        description: '리스트/피드 (아이템 목록, 타임라인, 채팅 등)',
        defaultProps: [
            { name: 'items', type: 'T[]', required: true, description: '리스트 아이템 데이터' },
            { name: 'renderItem', type: '(item: T, index: number) => ReactNode', required: true, description: '아이템 렌더 함수' },
            { name: 'emptyMessage', type: 'string', required: false, defaultValue: '"항목이 없습니다"', description: '빈 상태 메시지' },
            { name: 'loading', type: 'boolean', required: false, defaultValue: 'false', description: '로딩 상태' },
            { name: 'onLoadMore', type: '() => void', required: false, description: '무한 스크롤/더보기 핸들러' },
            { name: 'className', type: 'string', required: false, description: '추가 CSS 클래스' },
        ],
        features: [
            '빈 상태 표시',
            '로딩 스켈레톤 (아이템 3개 플레이스홀더)',
            '더 보기/무한 스크롤 지원',
            '아이템 간 구분선',
        ],
        accessibilityNotes: 'role="list"와 role="listitem" 적용, aria-busy 로딩 상태 전달',
    },
    {
        id: 'navigation',
        name: 'Navigation',
        description: '네비게이션/사이드바 (메뉴, 탭 네비게이션 등)',
        defaultProps: [
            { name: 'items', type: '{ label: string; href: string; icon?: ReactNode }[]', required: true, description: '네비게이션 항목' },
            { name: 'activeItem', type: 'string', required: false, description: '현재 활성 항목 href' },
            { name: 'onItemClick', type: '(href: string) => void', required: false, description: '항목 클릭 핸들러' },
            { name: 'collapsed', type: 'boolean', required: false, defaultValue: 'false', description: '접힘 상태 (사이드바)' },
            { name: 'className', type: 'string', required: false, description: '추가 CSS 클래스' },
        ],
        features: [
            '활성 항목 하이라이트',
            '아이콘 지원',
            '접기/펼치기 토글 (사이드바)',
            '반응형 모바일 대응',
        ],
        accessibilityNotes: 'nav 시맨틱 태그, aria-current="page" 활성 항목, 키보드 화살표 탐색',
    },
    {
        id: 'feedback',
        name: 'Feedback / Alert',
        description: '피드백 컴포넌트 (알림, 토스트, 배너 등)',
        defaultProps: [
            { name: 'message', type: 'string', required: true, description: '알림 메시지' },
            { name: 'variant', type: '"info" | "success" | "warning" | "error"', required: false, defaultValue: '"info"', description: '알림 종류' },
            { name: 'title', type: 'string', required: false, description: '알림 제목' },
            { name: 'onClose', type: '() => void', required: false, description: '닫기 핸들러' },
            { name: 'action', type: 'ReactNode', required: false, description: '액션 버튼 영역' },
            { name: 'className', type: 'string', required: false, description: '추가 CSS 클래스' },
        ],
        features: [
            'variant별 색상/아이콘 매핑',
            '닫기 버튼 (onClose 시)',
            '자동 닫힘 타이머 옵션',
            '진입/퇴장 애니메이션',
        ],
        accessibilityNotes: 'role="alert" (에러/경고) 또는 role="status" (정보/성공), aria-live="polite"',
    },
];

export function getPatternPreset(patternId: string): ComponentPatternPreset | undefined {
    return COMPONENT_PATTERN_PRESETS.find(p => p.id === patternId);
}

export function serializeProps(props: PropDefinition[]): string {
    return JSON.stringify(props);
}

export function deserializeProps(raw: string | string[] | undefined): PropDefinition[] {
    if (!raw || Array.isArray(raw)) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function buildPropsInterface(componentName: string, props: PropDefinition[]): string {
    if (props.length === 0) return '';
    const interfaceName = `${componentName.replace(/\s+/g, '')}Props`;
    const lines = [`interface ${interfaceName} {`];
    for (const p of props) {
        const opt = p.required ? '' : '?';
        const desc = p.description ? `  // ${p.description}` : '';
        const def = p.defaultValue ? ` (default: ${p.defaultValue})` : '';
        lines.push(`  ${p.name}${opt}: ${p.type};${desc}${def}`);
    }
    lines.push('}');
    return lines.join('\n');
}

export interface TaskTemplate {
    id: string;
    name: string;
    icon: string;
    titlePrefix: string;
    description: string;
    priority: 'Low' | 'Medium' | 'High';
    fields?: TemplateField[];
    buildDescription?: (values: TemplateFieldValues) => string;
}

function str(v: string | string[] | undefined): string {
    if (Array.isArray(v)) return v.join(', ');
    return v || '';
}

function arr(v: string | string[] | undefined): string[] {
    if (Array.isArray(v)) return v;
    return v ? [v] : [];
}

const COMPONENT_FIELDS: TemplateField[] = [
    {
        key: 'componentName',
        label: '컴포넌트 이름',
        type: 'text',
        placeholder: 'e.g. UserProfileCard',
        required: true,
    },
    {
        key: 'pattern',
        label: '컴포넌트 패턴',
        type: 'select',
        options: [
            { label: '선택 안 함 (직접 구성)', value: '' },
            ...COMPONENT_PATTERN_PRESETS.map(p => ({ label: `${p.name} - ${p.description}`, value: p.id })),
        ],
        defaultValue: '',
    },
    {
        key: 'location',
        label: '생성 위치',
        type: 'select',
        options: [
            { label: 'components/', value: 'components/' },
            { label: 'components/ui/', value: 'components/ui/' },
            { label: 'app/components/', value: 'app/components/' },
            { label: '직접 입력', value: '_custom' },
        ],
        defaultValue: 'components/',
    },
    {
        key: 'componentType',
        label: '컴포넌트 타입',
        type: 'radio',
        options: [
            { label: 'Client Component', value: 'client' },
            { label: 'Server Component', value: 'server' },
        ],
        defaultValue: 'client',
    },
    {
        key: 'props',
        label: 'Props 정의',
        type: 'props-builder',
    },
    {
        key: 'features',
        label: '기능 요구사항',
        type: 'textarea',
        placeholder: '구현할 기능을 상세히 설명해주세요',
        required: true,
    },
    {
        key: 'styling',
        label: '스타일링 옵션',
        type: 'checkbox-group',
        options: [
            { label: 'Tailwind CSS', value: 'tailwind' },
            { label: '반응형 대응', value: 'responsive' },
            { label: '다크모드 대응', value: 'darkmode' },
            { label: '애니메이션', value: 'animation' },
        ],
        defaultValue: ['tailwind', 'responsive'],
    },
];

function buildComponentDescription(v: TemplateFieldValues): string {
    const componentName = str(v.componentName) || 'Component';
    const patternId = str(v.pattern);
    const preset = patternId ? getPatternPreset(patternId) : undefined;
    const props = deserializeProps(v.props);

    const lines = ['새 React 컴포넌트를 생성합니다.', ''];

    lines.push('## 요구사항');
    lines.push(`- 컴포넌트 이름: ${componentName}`);
    if (preset) {
        lines.push(`- 패턴: ${preset.name} (${preset.description})`);
    }
    lines.push(`- 위치: ${str(v.location)}`);
    lines.push(`- 타입: ${str(v.componentType) === 'client' ? 'Client Component ("use client")' : 'Server Component'}`);

    const stylingOpts = arr(v.styling);
    if (stylingOpts.length > 0) {
        const labels: Record<string, string> = { tailwind: 'Tailwind CSS', responsive: '반응형 대응', darkmode: '다크모드 대응', animation: '애니메이션' };
        lines.push(`- 스타일링: ${stylingOpts.map(s => labels[s] || s).join(', ')}`);
    }

    if (props.length > 0) {
        lines.push('', '## Props Interface');
        lines.push(`\`\`\`typescript`);
        lines.push(buildPropsInterface(componentName, props));
        lines.push(`\`\`\``);
    }

    if (preset) {
        lines.push('', '## 패턴 가이드');
        for (const feature of preset.features) {
            lines.push(`- ${feature}`);
        }
        if (preset.accessibilityNotes) {
            lines.push(`- 접근성: ${preset.accessibilityNotes}`);
        }
    }

    if (str(v.features)) {
        lines.push('', '## 기능 상세', str(v.features));
    }

    return lines.join('\n');
}

const API_ENDPOINT_FIELDS: TemplateField[] = [
    {
        key: 'routePath',
        label: 'API 경로',
        type: 'text',
        placeholder: 'e.g. /api/users, /api/posts/[id]',
        required: true,
    },
    {
        key: 'methods',
        label: 'HTTP 메서드',
        type: 'checkbox-group',
        options: [
            { label: 'GET', value: 'GET' },
            { label: 'POST', value: 'POST' },
            { label: 'PUT', value: 'PUT' },
            { label: 'PATCH', value: 'PATCH' },
            { label: 'DELETE', value: 'DELETE' },
        ],
        required: true,
        defaultValue: ['GET'],
    },
    {
        key: 'requestSchema',
        label: '요청 Body 스키마',
        type: 'textarea',
        placeholder: 'e.g. { name: string, email: string }',
    },
    {
        key: 'responseSchema',
        label: '응답 스키마',
        type: 'textarea',
        placeholder: 'e.g. { id: string, name: string, createdAt: string }',
    },
    {
        key: 'auth',
        label: '인증 필요 여부',
        type: 'radio',
        options: [
            { label: '인증 필요', value: 'required' },
            { label: '공개 API', value: 'public' },
        ],
        defaultValue: 'public',
    },
    {
        key: 'additionalRequirements',
        label: '추가 요구사항',
        type: 'textarea',
        placeholder: '에러 처리, 페이지네이션, 캐싱 등',
    },
];

function buildApiEndpointDescription(v: TemplateFieldValues): string {
    const lines = ['새 API 엔드포인트를 생성합니다.', ''];
    lines.push('## 요구사항');
    lines.push(`- 경로: ${str(v.routePath)}`);
    lines.push(`- 메서드: ${arr(v.methods).join(', ')}`);
    lines.push(`- 인증: ${str(v.auth) === 'required' ? '인증 필요' : '공개 API'}`);
    if (str(v.requestSchema)) {
        lines.push(`- 요청 Body 스키마:\n\`\`\`\n${str(v.requestSchema)}\n\`\`\``);
    }
    if (str(v.responseSchema)) {
        lines.push(`- 응답 스키마:\n\`\`\`\n${str(v.responseSchema)}\n\`\`\``);
    }
    lines.push('- 에러 처리 포함');
    if (str(v.additionalRequirements)) {
        lines.push('', '## 추가 요구사항', str(v.additionalRequirements));
    }
    return lines.join('\n');
}

const BUGFIX_FIELDS: TemplateField[] = [
    {
        key: 'symptom',
        label: '버그 현상',
        type: 'textarea',
        placeholder: '어떤 문제가 발생하는지 설명해주세요',
        required: true,
    },
    {
        key: 'reproduction',
        label: '재현 방법',
        type: 'textarea',
        placeholder: '1. 페이지 X에 접속\n2. 버튼 Y 클릭\n3. 에러 발생',
    },
    {
        key: 'expectedBehavior',
        label: '기대 동작',
        type: 'textarea',
        placeholder: '정상적으로 어떻게 동작해야 하는지',
    },
    {
        key: 'relatedFiles',
        label: '관련 파일 경로',
        type: 'textarea',
        placeholder: 'e.g. components/KanbanBoard.tsx, lib/agents/Orchestrator.ts',
    },
    {
        key: 'errorLog',
        label: '에러 로그 / 스택 트레이스',
        type: 'textarea',
        placeholder: '콘솔 에러나 스택 트레이스를 붙여넣어주세요',
    },
    {
        key: 'severity',
        label: '심각도',
        type: 'select',
        options: [
            { label: 'Critical (서비스 불가)', value: 'critical' },
            { label: 'High (주요 기능 장애)', value: 'high' },
            { label: 'Medium (부분 기능 장애)', value: 'medium' },
            { label: 'Low (사소한 문제)', value: 'low' },
        ],
        defaultValue: 'medium',
    },
];

function buildBugfixDescription(v: TemplateFieldValues): string {
    const lines = ['버그를 수정합니다.', ''];
    lines.push('## 현상');
    lines.push(str(v.symptom) || '(미입력)');
    if (str(v.reproduction)) {
        lines.push('', '## 재현 방법', str(v.reproduction));
    }
    if (str(v.expectedBehavior)) {
        lines.push('', '## 기대 동작', str(v.expectedBehavior));
    }
    if (str(v.relatedFiles)) {
        lines.push('', '## 관련 파일');
        str(v.relatedFiles).split(/[,\n]/).map(f => f.trim()).filter(Boolean).forEach(f => lines.push(`- ${f}`));
    }
    if (str(v.errorLog)) {
        lines.push('', '## 에러 로그', `\`\`\`\n${str(v.errorLog)}\n\`\`\``);
    }
    lines.push('', `심각도: ${str(v.severity)}`);
    return lines.join('\n');
}

const PAGE_FIELDS: TemplateField[] = [
    {
        key: 'pagePath',
        label: '페이지 경로',
        type: 'text',
        placeholder: 'e.g. /dashboard, /settings/profile',
        required: true,
    },
    {
        key: 'renderingType',
        label: '렌더링 방식',
        type: 'radio',
        options: [
            { label: 'SSR (Server-Side Rendering)', value: 'ssr' },
            { label: 'SSG (Static Site Generation)', value: 'ssg' },
            { label: 'Client-Side', value: 'csr' },
        ],
        defaultValue: 'ssr',
    },
    {
        key: 'layoutDescription',
        label: '레이아웃 설명',
        type: 'textarea',
        placeholder: 'e.g. 사이드바 + 메인 컨텐츠, 상단 네비게이션 포함',
    },
    {
        key: 'sections',
        label: '주요 섹션',
        type: 'textarea',
        placeholder: 'e.g.\n1. Hero 배너\n2. 기능 소개 카드 그리드\n3. FAQ 아코디언',
        required: true,
    },
    {
        key: 'pageOptions',
        label: '추가 옵션',
        type: 'checkbox-group',
        options: [
            { label: '반응형 대응', value: 'responsive' },
            { label: 'SEO 메타데이터', value: 'seo' },
            { label: '다크모드 대응', value: 'darkmode' },
            { label: '로딩 스켈레톤', value: 'skeleton' },
            { label: '에러 바운더리', value: 'error-boundary' },
        ],
        defaultValue: ['responsive', 'seo'],
    },
];

function buildPageDescription(v: TemplateFieldValues): string {
    const lines = ['새 페이지를 생성합니다.', ''];
    lines.push('## 요구사항');
    lines.push(`- 페이지 경로: ${str(v.pagePath)}`);
    const renderLabels: Record<string, string> = { ssr: 'SSR (Server-Side Rendering)', ssg: 'SSG (Static Site Generation)', csr: 'Client-Side' };
    lines.push(`- 렌더링: ${renderLabels[str(v.renderingType)] || str(v.renderingType)}`);
    if (str(v.layoutDescription)) {
        lines.push(`- 레이아웃: ${str(v.layoutDescription)}`);
    }
    if (str(v.sections)) {
        lines.push('', '## 주요 섹션', str(v.sections));
    }
    const opts = arr(v.pageOptions);
    if (opts.length > 0) {
        const labels: Record<string, string> = {
            responsive: '반응형 대응', seo: 'SEO 메타데이터', darkmode: '다크모드 대응',
            skeleton: '로딩 스켈레톤', 'error-boundary': '에러 바운더리',
        };
        lines.push('', '## 추가 옵션');
        opts.forEach(o => lines.push(`- ${labels[o] || o}`));
    }
    return lines.join('\n');
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
        fields: COMPONENT_FIELDS,
        buildDescription: buildComponentDescription,
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
        fields: API_ENDPOINT_FIELDS,
        buildDescription: buildApiEndpointDescription,
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
        fields: BUGFIX_FIELDS,
        buildDescription: buildBugfixDescription,
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
        fields: PAGE_FIELDS,
        buildDescription: buildPageDescription,
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
