# TypeScript Best Practices

Tags: `#typescript` `#conventions` `#best-practices`

## Overview
This document provides guidelines to prevent common TypeScript errors during AI code generation and to improve code quality and maintainability.

For how generated code is validated, rolled back on failure, and how repair loops work in Basalt, see [TypeScript mitigation and validation](./typescript-mitigation-and-validation.md).

## 1. State Management & Type Definitions

### Patterns to Avoid
When using empty arrays or `null` as initial values without explicit types, TypeScript infers them as `never[]` or `any`, causing property access errors.

```typescript
// Bad: 'tasks' is inferred as 'never[]'
const [tasks, setTasks] = useState([]);

// Error when accessing properties later:
// tasks[0].id -> Property 'id' does not exist on type 'never'.
```

### Recommended Patterns
Always use Generics to explicitly declare the state type.

```typescript
// Good: Define interface first
interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
}

const [tasks, setTasks] = useState<Task[]>([]);
```

## 2. Error Handling

### Configuration (`tsconfig.json`)
`"useUnknownInCatchVariables": false` is enabled for convenience, treating `error` in `catch(error)` as `any`. However, narrowing types is still encouraged for safety.

### Recommended Patterns

```typescript
try {
  await apiCall();
} catch (error: any) {
  const message = error?.message || 'An unknown error occurred';
  console.error('API Error:', message);
}
```

## 3. Component Props

### Recommended Patterns
Define explicit interfaces for all component props. Function declarations are preferred over `React.FC`.

```typescript
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export default function Button({ label, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button className={`btn-${variant}`} onClick={onClick}>
      {label}
    </button>
  );
}
```

## 4. Data Fetching & Async Logic

### Recommended Patterns
Manage loading and error states explicitly for async operations.

```typescript
const [data, setData] = useState<Data | null>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const fetchData = async () => {
  setLoading(true);
  try {
    const result = await getData();
    setData(result);
  } catch (e: any) {
    setError(e.message);
  }
};
```

## 5. UI Component Imports (Shadcn UI)

### Table Component & Data Tables
A common source of errors is mixing up the visual Table component with the data table logic library.

- **Visual Components**: Import `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableHead`, `TableCaption` as **named imports** from `@/components/ui/table` — that module typically has **no default export** (**TS2613** if you use `import Table from '…'`).
- **Logic & Types**: Import `ColumnDef`, `useReactTable`, `getCoreRowModel`, `flexRender` from `@tanstack/react-table`.

#### Constraint
This project lists `@tanstack/react-table` in `package.json`. If you work in another repo, add it with `npm install @tanstack/react-table`.

#### TanStack Table v8 types (avoid TS2339 / TS2322)

- **`ColumnDef<T>` is a union** (accessor key, accessor function, group columns, etc.). Do **not** read `column.columnDef.accessorKey` without narrowing — TypeScript will error (`Property 'accessorKey' does not exist on type 'ColumnDef<...>'`). Prefer `header.column.id` / `cell.column.id` from the table API, or narrow: `'accessorKey' in column.columnDef && column.columnDef.accessorKey`.
- **`header` and `cell` are not always `ReactNode`**. They may be render functions. Do **not** put `column.columnDef.header` or `column.columnDef.cell` directly in JSX. Always use `flexRender` for both.
- **v8 `Header` vs `Column`**: In `headerGroup.headers.map((header) => …)`, `header` is a **`Header`** — it does **not** have `header.columnDef` (**TS2551**). Use **`header.column.columnDef`** (same as in `flexRender(header.column.columnDef.header, header.getContext())`).
- **`Row` vs `Cell`**: A **`Row`** from `table.getRowModel().rows` has **no** `row.column` (**TS2339**). Use **`row.getVisibleCells().map((cell) => …)`** and only then **`cell.column`** / `flexRender(cell.column.columnDef.cell, cell.getContext())`.
- **`getCoreRowModel`**: In `useReactTable({ … })`, set **`getCoreRowModel: getCoreRowModel()`** — the factory must be **called** (**TS2322** if you pass `getCoreRowModel` without `()`).

#### Correct Usage Pattern
```typescript
// 1. Imports
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// 2. Define Columns (explicitly typed)
const columns: ColumnDef<Payment>[] = [ ... ]

// 2b. Table instance — must exist before JSX that references `table`
const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
})

// 3. Render header row — flexRender for header (not raw columnDef.header)
<TableHeader>
  {table.getHeaderGroups().map((headerGroup) => (
    <TableRow key={headerGroup.id}>
      {headerGroup.headers.map((header) => (
        <TableHead key={header.id}>
          {header.isPlaceholder
            ? null
            : flexRender(header.column.columnDef.header, header.getContext())}
        </TableHead>
      ))}
    </TableRow>
  ))}
</TableHeader>

// 4. Render body — cells live on Row via getVisibleCells(), not row.column
{table.getRowModel().rows.map((row) => (
  <TableRow key={row.id}>
    {row.getVisibleCells().map((cell) => (
      <TableCell key={cell.id}>
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </TableCell>
    ))}
  </TableRow>
))}
```

#### Anti-Patterns (DO NOT DO THIS)
- `import { ColumnDef } from "@/components/ui/table"` -> **Error: Module has no exported member 'ColumnDef'.**
- `import { useTable } from "@tanstack/react-table"` or `useTable(...)` -> **TS2305** in v8. Use **`useReactTable`** and **`getCoreRowModel`** from `@tanstack/react-table`.
- `import { flexRender } from "@/components/ui/table"` -> **TS2305**. **`flexRender` is only exported from `@tanstack/react-table`**; `@/components/ui/table` is for visual wrappers (`Table`, `TableRow`, …). Basalt’s extended UI scaffold creates those wrappers when `table.tsx` is auto-generated.
- `<Button asChild><Link …></Link></Button>` when the project’s `Button` is a **minimal native `<button>` wrapper** -> **TS2322** (`asChild` does not exist). Use `<Link className="...">` or `<button>` instead.
- Using `row` without types in `map` -> **Error: Binding element 'row' implicitly has an 'any' type.** Always type your data.
- `{column.columnDef.header}` or `{column.columnDef.cell}` as JSX children -> **TS2322** (template may be a function). Use `flexRender` with `header.getContext()` / `cell.getContext()`.
- `someColumn.columnDef.accessorKey` on an untyped `ColumnDef` -> **TS2339**. Use `column.id` or narrow with `'accessorKey' in column.columnDef`.
- Using `flexRender` in JSX without importing it -> **TS2552** (“Cannot find name 'flexRender'”). Add `import { flexRender, … } from "@tanstack/react-table"` in **that** file.
- `header.columnDef` on a value from `headers.map((header) => …)` -> **TS2551** (`Property 'columnDef' does not exist on type 'Header<…>'`). Use **`header.column.columnDef`** only.
- `row.column` on a TanStack **`Row`** -> **TS2339**. Use **`row.getVisibleCells()`** and **`cell.column`** inside that loop.
- `import Table from "@/components/ui/table"` (or any default import from that path) -> **TS2613**. Use **`import { Table, TableHeader, … } from "@/components/ui/table"`**.
- `getCoreRowModel: getCoreRowModel` without `()` in `useReactTable` -> **TS2322**. Use **`getCoreRowModel: getCoreRowModel()`**.
- `(cell)` or `(header)` implicitly `any` in `.map` -> **TS7006**. Add `import type { Cell, Header } from "@tanstack/react-table"` and e.g. `(cell: Cell<YourRow, unknown>)`, or ensure `useReactTable<YourRow>({ … })` so inference fills the callback types.
- `column.columnDef.meta.width` (or any custom `meta` field) without a module augmentation -> **TS2339** (`Property 'width' does not exist on type 'ColumnMeta<…>'`). Either use **`size` / `minSize` / `maxSize`** on the column definition and **`header.getSize()`** / **`column.getSize()`** for layout ([column sizing](https://tanstack.com/table/latest/docs/guide/column-sizing)), or extend types:

```ts
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends object, TValue> {
    width?: number;
  }
}
```

(Prefer built-in `size` / `getSize()` unless you truly need custom `meta`; match `ColumnMeta`’s generic constraints to your installed `@tanstack/react-table` types if the compiler complains.)

#### Rules of Hooks + `useReactTable` (runtime: hook order mismatch)

TanStack’s `useReactTable` is a hook. If the first render returns early (e.g. `if (loading) return <Spinner />`) **before** `useReactTable` runs, and a later render runs `useReactTable`, React reports **“Rendered more hooks than during the previous render”** and a diff like `useState`, `useEffect`, then `undefined` vs `useState` for the next slot.

**Do not:**

```tsx
if (loading) return <div>Loading…</div>;
const columns = useMemo(() => [...], []);
const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
```

**Do:**

```tsx
const columns = useMemo(() => [...], []);
const table = useReactTable({
  data: rows ?? [],
  columns,
  getCoreRowModel: getCoreRowModel(),
});
if (loading) return <div>Loading…</div>;
// or: return loading ? <Skeleton /> : <Table>…</Table>
```

See [Rules of Hooks](https://react.dev/reference/rules/rules-of-components-and-hooks).

### 5.1 Basalt extended UI scaffold contract (avoid `components/ui/*` TS2305)

When Basalt **auto-creates** missing `@/components/ui/<name>` files (`lib/project-ui-kit.ts` extended scaffold), some basenames use **dedicated templates** with **multiple named exports** (e.g. `table`, `card`, `tabs`). Any other basename typically becomes a **single `forwardRef` wrapper** around a `<div>` (one export only).

- **Do not** copy full shadcn compound APIs (`DialogTrigger`, `DropdownMenuItem`, `SheetContent`, …) unless that file on disk (or **Available UI** in `[PROJECT CONTEXT]`) actually exports them — otherwise you get **TS2305 Module has no exported member**.
- Prefer **semantic HTML** (`<dialog>`, `<select>`, `<details>`) or only import symbols you have verified.
- **`cn` / `@/lib/utils`**: If the profiler reports no `lib/utils` / `src/lib/utils`, avoid `import { cn } from '@/lib/utils'` — use string concatenation for `className` or add a real `cn` helper first.
- **App Router client hooks**: Use `useRouter`, `usePathname`, `useSearchParams`, `useParams` from **`next/navigation`**, never **`next/router`**, in `app/` projects (**TS2305** / wrong runtime).
- **Optional packages** (`sonner`, `next-themes`, `vaul`, …): Import only if listed in `package.json`; otherwise use native patterns.
- **Forms**: Use `react-hook-form` + `zod` + `@hookform/resolvers` only when **all** required packages are installed.

### 5.2 Cross-file and repair limits

Single-file `write_code` validation and Orchestrator **TypeScript repair** cannot fix every cross-file type error. If diagnostics keep referencing other modules, use **`read_codebase`** (or human edit) to align imports and shared types before regenerating.

## 6. Next.js 15+ Dynamic APIs (Params & SearchParams)

### Context
In Next.js 15 and 16, `params` and `searchParams` in Pages and `generateMetadata` are **Promises**. Accessing them without `await` will result in errors.

### Recommended Patterns
```typescript
// Good: Await the params object
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug } = await params
  const { query } = await searchParams
  // ...
}
```

## 7. Lucide React Icons

### Usage Patterns
Icon names occasionally change between versions (e.g., `CheckCircle` vs `Check`). Always check the official documentation or the `lucide-react` package if an import fails.

### Recommended Patterns
```typescript
import { Check, X, AlertCircle } from 'lucide-react'

// Use descriptive names if needed via aliasing
import { Check as CheckIcon } from 'lucide-react'
```

## 8. Zod Type Inference

### Recommended Patterns
Avoid duplicate definitions for schemas and interfaces. Use `z.infer` to derive types directly from your schemas.

```typescript
import { z } from 'zod'

export const UserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3),
  email: z.string().email(),
})

// Derive the TypeScript interface from the schema
export type User = z.infer<typeof UserSchema>
```

## 9. Radix UI `asChild` Pattern

### Context
To avoid nested `<a>` or `<button>` tags (which cause hydration errors and invalid HTML), full **Radix / shadcn** `Button` components may support the `asChild` prop.

**Basalt minimal scaffold `Button`** (native `<button>` wrapper in auto-generated `components/ui/button.tsx`) **does not** implement `asChild` — using it causes **TS2322**. For those targets, style **`<Link className="...">`** like a button or use a plain `<button>` (see §5.1 and Next.js `Link` notes in `[PROJECT CONTEXT]`).

### When `asChild` is valid
Use the `asChild` prop only when the project’s `Button` (or other primitive) is actually implemented with Radix **Slot** / shadcn and exposes `asChild` in its types.

### Recommended Patterns (Radix / full shadcn `Button` only)
```typescript
import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Good: Link is rendered as the button element (requires Button with asChild + Slot)
<Button asChild variant="outline">
  <Link href="/dashboard">Go to Dashboard</Link>
</Button>

// Bad: Nested interactive elements (Results in hydration error)
<Link href="/dashboard">
  <Button>Go to Dashboard</Button>
</Link>
```

For **Basalt minimal** `Button`, use `<Link className="...">` instead of `asChild` (see §5.1).

## 10. Prisma client in Next.js Route Handlers

### UI-only work (default for many tasks)

If the goal is **screens and layout** (boards, tables, dashboards) and the user did **not** ask for a real database, **you do not need Prisma**. Use typed **mock/sample data** in the page or a small `lib/mock-*.ts` so nothing imports `@prisma/client`. The package may be listed in `package.json` from a template — that is not a reason to wire every page to the DB.

### Problem (when you do use Prisma)

Tutorials often show `prisma.user.findMany()` as if `prisma` were global. In real apps it is almost always a **module-level import** from a singleton file. Omitting the import yields **TS2304 Cannot find name 'prisma'**.

### Recommended patterns

```typescript
// Prefer the project singleton (path varies — check `lib/prisma.ts` or `src/lib/prisma.ts`)
import { prisma } from '@/lib/prisma'

export async function GET() {
  const rows = await prisma.user.findMany()
  return Response.json(rows)
}
```

If the repo has no shared module yet, the same file may use:

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(req: Request) {
  // ...
}
```

Use one consistent pattern per target repository; do not mix bare `prisma.` calls without a binding.

### TS2305: `Module '"@prisma/client"' has no exported member 'PrismaClient'`

This usually means the **generated client was never created** (or the install is incomplete). After schema changes or a fresh clone, run **`npx prisma generate`** at the project root so **`node_modules/.prisma/client`** exists. Do not “fix” with `any` or unrelated imports.

If the schema uses **`generator client { output = "..." }`**, types and runtime load from that **custom path** instead; the default folder check may not exist even when the project is healthy.

For `app/**/page.tsx`, prefer `import { prisma } from '@/lib/prisma'` when the singleton file exists, instead of instantiating `new PrismaClient()` in every page (generation is still required). Never use Prisma inside `"use client"` components.
