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

// --- Extended UI scaffold: missing `@/components/ui/<name>` (e.g. Textarea) ---

/** `BASALT_AUTO_SCAFFOLD_UI_EXTENDED=0|false` 이면 비-LLM 확장 스캐폴드를 끕니다. */
export function isExtendedUiScaffoldEnabled(): boolean {
    const v = process.env.BASALT_AUTO_SCAFFOLD_UI_EXTENDED;
    if (v === '0' || v === 'false') return false;
    return true;
}

/**
 * import 경로에서 `components/ui/<basename>` 추출 (확장자 제거, 소문자).
 * 예: `@/components/ui/textarea` → `textarea`
 */
export function parseUiDeepBasenameFromSpecifier(specifier: string): string | null {
    const s = specifier.trim();
    const patterns = [/^@\/components\/ui\/([^/'"]+)/i, /(?:^|\/)components\/ui\/([^/'"]+)/i];
    for (const re of patterns) {
        const m = s.match(re);
        if (!m?.[1]) continue;
        return m[1].replace(/\.(tsx?|jsx?)$/i, '').toLowerCase();
    }
    return null;
}

export function collectUiDeepBasenamesFromSpecifiers(specifiers: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const sp of specifiers) {
        const b = parseUiDeepBasenameFromSpecifier(sp);
        if (!b || seen.has(b)) continue;
        seen.add(b);
        out.push(b);
    }
    return out;
}

function uiBasenameToPascalExport(basename: string): string {
    return basename
        .split(/[-_]/)
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join('');
}

function textareaExtendedSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}\n\nexport const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(\n  ({ className, ...props }, ref) => (\n    <textarea className={className} ref={ref} {...props} />\n  ),\n);\nTextarea.displayName = "Textarea";\n`;
}

function scrollAreaExtendedSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {}\n\nexport const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(\n  ({ className, style, ...props }, ref) => (\n    <div\n      ref={ref}\n      className={className}\n      style={{ overflow: "auto", maxHeight: "100%", ...style }}\n      {...props}\n    />\n  ),\n);\nScrollArea.displayName = "ScrollArea";\n`;
}

function separatorExtendedSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport interface SeparatorProps extends React.HTMLAttributes<HTMLHRElement> {\n  orientation?: "horizontal" | "vertical";\n}\n\nexport const Separator = React.forwardRef<HTMLHRElement, SeparatorProps>(\n  ({ className, orientation = "horizontal", ...props }, ref) => (\n    <hr\n      ref={ref}\n      role="separator"\n      className={className}\n      style={orientation === "vertical" ? { width: 1, alignSelf: "stretch", border: "none", background: "currentColor", opacity: 0.2 } : { border: "none", borderTop: "1px solid currentColor", opacity: 0.2, margin: "0.5rem 0" }}\n      {...props}\n    />\n  ),\n);\nSeparator.displayName = "Separator";\n`;
}

function badgeExtendedSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {}\n\nexport const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(\n  ({ className, ...props }, ref) => (\n    <span ref={ref} className={className} {...props} />\n  ),\n);\nBadge.displayName = "Badge";\n`;
}

function skeletonExtendedSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}\n\nexport const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(\n  ({ className, style, ...props }, ref) => (\n    <div\n      ref={ref}\n      className={className}\n      style={{ minHeight: "1rem", borderRadius: 4, background: "rgba(128,128,128,0.2)", ...style }}\n      {...props}\n    />\n  ),\n);\nSkeleton.displayName = "Skeleton";\n`;
}

function alertExtendedSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {}\n\nexport const Alert = React.forwardRef<HTMLDivElement, AlertProps>(\n  ({ className, role = "alert", ...props }, ref) => (\n    <div ref={ref} role={role} className={className} {...props} />\n  ),\n);\nAlert.displayName = "Alert";\n`;
}

function checkboxExtendedSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {}\n\nexport const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(\n  ({ className, type = "checkbox", ...props }, ref) => (\n    <input ref={ref} type={type} className={className} {...props} />\n  ),\n);\nCheckbox.displayName = "Checkbox";\n`;
}

function selectExtendedSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}\n\nexport const Select = React.forwardRef<HTMLSelectElement, SelectProps>(\n  ({ className, ...props }, ref) => (\n    <select ref={ref} className={className} {...props} />\n  ),\n);\nSelect.displayName = "Select";\n`;
}

function dialogExtendedSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport interface DialogProps extends React.HTMLAttributes<HTMLDivElement> {\n  open?: boolean;\n}\n\nexport const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(\n  ({ className, open = true, style, children, ...props }, ref) => {\n    if (!open) return null;\n    return (\n      <div\n        ref={ref}\n        role="dialog"\n        aria-modal="true"\n        className={className}\n        style={{\n          position: "fixed",\n          inset: 0,\n          zIndex: 50,\n          display: "flex",\n          alignItems: "center",\n          justifyContent: "center",\n          background: "rgba(0,0,0,0.4)",\n          ...style,\n        }}\n        {...props}\n      >\n        {children}\n      </div>\n    );\n  },\n);\nDialog.displayName = "Dialog";\n`;
}

function cardExtendedSource(useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(\n  ({ className, style, ...props }, ref) => (\n    <div ref={ref} className={className} style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 8, ...style }} {...props} />\n  ),\n);\nCard.displayName = "Card";\n\nexport const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(\n  ({ className, ...props }, ref) => <div ref={ref} className={className} style={{ padding: "1rem 1rem 0" }} {...props} />\n);\nCardHeader.displayName = "CardHeader";\n\nexport const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(\n  ({ className, ...props }, ref) => <p ref={ref} className={className} style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }} {...props} />\n);\nCardTitle.displayName = "CardTitle";\n\nexport const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(\n  ({ className, ...props }, ref) => <p ref={ref} className={className} style={{ margin: "0.25rem 0 0", opacity: 0.8, fontSize: "0.875rem" }} {...props} />\n);\nCardDescription.displayName = "CardDescription";\n\nexport const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(\n  ({ className, ...props }, ref) => <div ref={ref} className={className} style={{ padding: "1rem" }} {...props} />\n);\nCardContent.displayName = "CardContent";\n\nexport const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(\n  ({ className, ...props }, ref) => <div ref={ref} className={className} style={{ padding: "0 1rem 1rem" }} {...props} />\n);\nCardFooter.displayName = "CardFooter";\n`;
}

function genericUiWrapperSource(componentPascal: string, useClient: boolean): string {
    const head = useClient ? '"use client";\n\n' : '';
    return `${head}import * as React from "react";\n\nexport interface ${componentPascal}Props extends React.HTMLAttributes<HTMLDivElement> {}\n\nexport const ${componentPascal} = React.forwardRef<HTMLDivElement, ${componentPascal}Props>(\n  ({ className, ...props }, ref) => (\n    <div ref={ref} className={className} {...props} />\n  ),\n);\n${componentPascal}.displayName = "${componentPascal}";\n`;
}

const EXTENDED_UI_TEMPLATES: Record<string, (useClient: boolean) => string> = {
    textarea: textareaExtendedSource,
    'scroll-area': scrollAreaExtendedSource,
    separator: separatorExtendedSource,
    badge: badgeExtendedSource,
    skeleton: skeletonExtendedSource,
    alert: alertExtendedSource,
    checkbox: checkboxExtendedSource,
    select: selectExtendedSource,
    dialog: dialogExtendedSource,
    card: cardExtendedSource,
};

function resolveExtendedUiSource(basename: string, useClient: boolean): string {
    const gen = EXTENDED_UI_TEMPLATES[basename];
    if (gen) return gen(useClient);
    return genericUiWrapperSource(uiBasenameToPascalExport(basename), useClient);
}

function uiFileExists(absUiDir: string, basename: string): boolean {
    const variants = [`${basename}.tsx`, `${basename}.ts`, `${basename}.jsx`, `${basename}.js`];
    return variants.some((n) => fs.existsSync(path.join(absUiDir, n)));
}

function appendBarrelExportIfNeeded(absUiDir: string, basename: string, exportName: string): string | null {
    const indexNames = ['index.ts', 'index.tsx'] as const;
    for (const iname of indexNames) {
        const ip = path.join(absUiDir, iname);
        if (!fs.existsSync(ip)) continue;
        const text = fs.readFileSync(ip, 'utf-8');
        const importPath = `./${basename}`;
        if (
            text.includes(`from "${importPath}"`) ||
            text.includes(`from '${importPath}'`) ||
            text.includes(`from "./${basename}"`) ||
            text.includes(`from './${basename}'`)
        ) {
            return null;
        }
        const line = `export { ${exportName} } from "./${basename}";\n`;
        const next = text.endsWith('\n') ? `${text}${line}` : `${text}\n${line}`;
        fs.writeFileSync(ip, next, 'utf-8');
        return iname;
    }
    return null;
}

export type ScaffoldMissingUiResult = {
    /** 프로젝트 루트 기준 POSIX 상대 경로 */
    createdFiles: string[];
    /** 배럴 index에 export 줄을 추가한 경우 해당 상대 경로 */
    barrelTouched?: string;
};

/**
 * `validateImportsExistence` 가 돌려준 `offendingUiSpecifiers` 등에 대해,
 * 디스크에 없는 `components/ui/<basename>` 파일을 네이티브·최소 래퍼로 생성한다.
 * button/input/label 은 기존 minimal 스캐폴드에 맡기고, 여기서는 건너뜀(이미 있으면 스킵).
 */
export function scaffoldMissingUiFromImportSpecifiers(
    projectRoot: string,
    specifiers: string[],
    opts?: ScaffoldUiOptions
): ScaffoldMissingUiResult {
    const createdFiles: string[] = [];
    if (!isExtendedUiScaffoldEnabled()) {
        return { createdFiles };
    }

    const basenames = collectUiDeepBasenamesFromSpecifiers(specifiers);
    if (basenames.length === 0) {
        return { createdFiles };
    }

    const rel = opts?.relativeUiDir || inferComponentsUiRelativeDir(projectRoot);
    const abs = path.join(projectRoot, rel);
    const useClient = Boolean(opts?.useClientDirective);

    if (!fs.existsSync(abs)) {
        fs.mkdirSync(abs, { recursive: true });
    }

    let barrelTouched: string | undefined;

    for (const basename of basenames) {
        if (uiFileExists(abs, basename)) continue;

        const content = resolveExtendedUiSource(basename, useClient);
        const fileName = `${basename}.tsx`;
        const fp = path.join(abs, fileName);
        fs.writeFileSync(fp, content, 'utf-8');
        createdFiles.push(path.join(rel, fileName).replace(/\\/g, '/'));

        const exportName = uiBasenameToPascalExport(basename);
        const barrel = appendBarrelExportIfNeeded(abs, basename, exportName);
        if (barrel && !barrelTouched) {
            barrelTouched = path.join(rel, barrel).replace(/\\/g, '/');
        }
    }

    return { createdFiles, barrelTouched };
}
