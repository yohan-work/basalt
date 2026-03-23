import fs from 'fs';
import path from 'path';

import { ProjectProfiler } from './profiler';
import type { StackPrimary } from './stack-profile';
import { inferComponentsUiRelativeDirFromConfig, maybeAlignNextPathAlias } from './tsconfig-paths';

/**
 * `@/components/ui/*` 가 가리킬 실제 디렉터리 (프로젝트 루트 기준 POSIX 경로).
 * tsconfig/jsconfig 병합 `paths["@/*"]` 를 우선하고, 없거나 모호할 때만 폴더 휴리스틱을 쓴다.
 */
export function inferComponentsUiRelativeDir(projectRoot: string): string {
    return inferComponentsUiRelativeDirFromConfig(projectRoot);
}

function buttonSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}\n\nexport const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(\n  ({ className, type = "button", ...props }, ref) => (\n    <button type={type} ref={ref} className={className} {...props} />\n  ),\n);\nButton.displayName = "Button";\n`;
}

function inputSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}\n\nexport const Input = React.forwardRef<HTMLInputElement, InputProps>(\n  ({ className, type = "text", ...props }, ref) => (\n    <input type={type} ref={ref} className={className} {...props} />\n  ),\n);\nInput.displayName = "Input";\n`;
}

function labelSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}\n\nexport const Label = React.forwardRef<HTMLLabelElement, LabelProps>(\n  ({ className, ...props }, ref) => (\n    <label ref={ref} className={className} {...props} />\n  ),\n);\nLabel.displayName = "Label";\n`;
}

function uiBarrelIndexSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}export { Button } from "./button";\nexport { Input } from "./input";\nexport { Label } from "./label";\n`;
}

export interface ScaffoldUiOptions {
    /** e.g. `components/ui` — 없으면 `inferComponentsUiRelativeDir` */
    relativeUiDir?: string;
    /** Next.js 이면 파일 상단에 "use client" */
    useClientDirective?: boolean;
}

/**
 * 최소 shadcn 호환 primitives (Radix 없음, 네이티브 요소 래핑). 이미 있으면 건너뜀.
 * @returns 생성된 파일의 프로젝트 루트 기준 상대 경로(POSIX)
 */
export function scaffoldMinimalUiPrimitives(projectRoot: string, opts?: ScaffoldUiOptions): string[] {
    const rel = opts?.relativeUiDir || inferComponentsUiRelativeDir(projectRoot);
    const abs = path.join(projectRoot, rel);
    const useClient = Boolean(opts?.useClientDirective);
    const created: string[] = [];

    if (!fs.existsSync(abs)) {
        fs.mkdirSync(abs, { recursive: true });
    }

    const files: Array<{ name: string; content: string }> = [
        { name: 'button.tsx', content: buttonSource(useClient) },
        { name: 'input.tsx', content: inputSource(useClient) },
        { name: 'label.tsx', content: labelSource(useClient) },
    ];

    for (const { name, content } of files) {
        const fp = path.join(abs, name);
        if (!fs.existsSync(fp)) {
            fs.writeFileSync(fp, content, 'utf-8');
            created.push(path.join(rel, name).replace(/\\/g, '/'));
        }
    }

    const hasBarrelIndex = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'].some((n) =>
        fs.existsSync(path.join(abs, n))
    );
    if (!hasBarrelIndex) {
        const indexPath = path.join(abs, 'index.ts');
        fs.writeFileSync(indexPath, uiBarrelIndexSource(useClient), 'utf-8');
        created.push(path.join(rel, 'index.ts').replace(/\\/g, '/'));
    }

    return created;
}

function allowAutoScaffoldForStack(primary: StackPrimary, dependencies: string[]): boolean {
    if (primary === 'next' || primary === 'react_vite') return true;
    if (primary === 'unknown' && dependencies.includes('react')) return true;
    return false;
}

/**
 * 실행 시작·갭 필: 스택이 React/Next 계열이면 `scaffoldMinimalUiPrimitives`로
 * 누락된 button/input/label·배럴 index를 채운다. 이미 일부 파일만 있어도(uiKitPresent) 조기 종료하지 않는다.
 * `BASALT_AUTO_SCAFFOLD_UI=0` 또는 `false` 이면 비활성.
 */
export async function maybeScaffoldMinimalUiKit(projectRoot: string): Promise<{
    created: string[];
    skippedReason?: string;
}> {
    const env = process.env.BASALT_AUTO_SCAFFOLD_UI;
    if (env === '0' || env === 'false') {
        return { created: [], skippedReason: 'BASALT_AUTO_SCAFFOLD_UI_disabled' };
    }

    maybeAlignNextPathAlias(projectRoot);

    const profiler = new ProjectProfiler(projectRoot);
    const data = await profiler.getProfileData();

    const primary = data.stackProfile.primary;
    if (!allowAutoScaffoldForStack(primary, data.dependencies)) {
        return { created: [], skippedReason: `stack_${primary}` };
    }

    const relativeUiDir = data.uiKitRelativePath || inferComponentsUiRelativeDir(projectRoot);
    const useClientDirective = primary === 'next';

    const created = scaffoldMinimalUiPrimitives(projectRoot, {
        relativeUiDir,
        useClientDirective,
    });

    if (created.length > 0) {
        return {
            created,
            skippedReason: data.uiKitPresent ? 'ui_kit_gap_fill' : 'new_ui_kit',
        };
    }

    return { created: [], skippedReason: data.uiKitPresent ? 'ui_kit_already_complete' : 'nothing_to_add' };
}
