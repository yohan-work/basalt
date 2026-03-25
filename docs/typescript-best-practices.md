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

- **Visual Components**: Import `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableHead`, `TableCaption` from `@/components/ui/table`.
- **Logic & Types**: Import `ColumnDef`, `useReactTable`, `getCoreRowModel`, `flexRender` from `@tanstack/react-table`.

#### Constraint
This project lists `@tanstack/react-table` in `package.json`. If you work in another repo, add it with `npm install @tanstack/react-table`.

#### TanStack Table v8 types (avoid TS2339 / TS2322)

- **`ColumnDef<T>` is a union** (accessor key, accessor function, group columns, etc.). Do **not** read `column.columnDef.accessorKey` without narrowing — TypeScript will error (`Property 'accessorKey' does not exist on type 'ColumnDef<...>'`). Prefer `header.column.id` / `cell.column.id` from the table API, or narrow: `'accessorKey' in column.columnDef && column.columnDef.accessorKey`.
- **`header` and `cell` are not always `ReactNode`**. They may be render functions. Do **not** put `column.columnDef.header` or `column.columnDef.cell` directly in JSX. Always use `flexRender` for both.

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
export const columns: ColumnDef<Payment>[] = [ ... ]

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

// 4. Render body — flexRender for cell
<TableCell key={cell.id}>
  {flexRender(cell.column.columnDef.cell, cell.getContext())}
</TableCell>
```

#### Anti-Patterns (DO NOT DO THIS)
- `import { ColumnDef } from "@/components/ui/table"` -> **Error: Module has no exported member 'ColumnDef'.**
- Using `row` without types in `map` -> **Error: Binding element 'row' implicitly has an 'any' type.** Always type your data.
- `{column.columnDef.header}` or `{column.columnDef.cell}` as JSX children -> **TS2322** (template may be a function). Use `flexRender` with `header.getContext()` / `cell.getContext()`.
- `someColumn.columnDef.accessorKey` on an untyped `ColumnDef` -> **TS2339**. Use `column.id` or narrow with `'accessorKey' in column.columnDef`.

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
To avoid nested `<a>` or `<button>` tags (which cause hydration errors and invalid HTML), use the `asChild` prop provided by Radix UI and Shadcn UI components.

### Recommended Patterns
```typescript
import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Good: Link is rendered as the button element
<Button asChild variant="outline">
  <Link href="/dashboard">Go to Dashboard</Link>
</Button>

// Bad: Nested interactive elements (Results in hydration error)
<Link href="/dashboard">
  <Button>Go to Dashboard</Button>
</Link>
```
