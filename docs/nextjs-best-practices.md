# Next.js Best Practices

Tags: `#nextjs` `#react` `#best-practices`

## Overview
This document provides guidelines for Next.js App Router (v13+) development to ensure performance, accessibility, and type safety.

## 1. Routing & Links (`next/link`)

### ❌ Patterns to Avoid (`legacyBehavior`)
Next.js 13+ `Link` component renders an `<a>` tag by default. **Do NOT use `legacyBehavior` or `passHref`**.
Also, do not nest `<button>` inside `<Link>` (invalid HTML: `<a>` cannot contain interactive elements).

```tsx
// ❌ Deprecated / Invalid
<Link href="/login" legacyBehavior>
  <a>Login</a>
</Link>

// ❌ Invalid HTML (<a> inside <a>)
<Link href="/login">
  <a>Login</a>
</Link>

// ❌ Invalid HTML (<button> inside <a>)
<Link href="/login">
  <Button>Login</Button>
</Link>
```

### ✅ Recommended Patterns

#### Standard Link
```tsx
<Link href="/login" className="text-blue-500 hover:underline">
  Login
</Link>
```

#### Link as a Button (using shadcn/ui or Radix)
Use `asChild` prop on the `Button` to merge props onto the underlying `Link`. This renders a semantic `<a>` tag with button styles.

```tsx
import { Button } from "@/components/ui/button"
import Link from "next/link"

// ✅ Correct: Renders <a class="...button styles..." href="/login">Login</a>
<Button asChild>
  <Link href="/login">
    Login
  </Link>
</Button>
```

## 2. Server vs Client Components

### ✅ Directives
- Use `"use client"` at the top of files only when necessary (state, effects, event listeners).
- Default to Server Components for data fetching.

### ✅ Data Fetching
- Fetch data directly in Server Components using `async/await`.
- Do not use `useEffect` for initial data fetching unless absolutely necessary.

```tsx
// app/page.tsx
export default async function Page() {
  const data = await getData(); // Direct server call
  return <main>{data.title}</main>
}
```

## 3. Metadata
- Use `export const metadata` for static metadata.
- Use `export async function generateMetadata` for dynamic metadata.
- **Never** place metadata exports in a `"use client"` file.

## 4. Image Optimization
- Use `next/image` for all images.
- Ensure `width` and `height` are provided to prevent layout shift, or use `fill` with a parent container.
