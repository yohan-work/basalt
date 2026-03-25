# TypeScript Best Practices

Tags: `#typescript` `#conventions` `#best-practices`

## Overview
This document provides guidelines to prevent common TypeScript errors during AI code generation and to improve code quality and maintainability.

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
  } finally {
    setLoading(false);
  }
};
```
