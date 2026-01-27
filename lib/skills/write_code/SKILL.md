---
name: write_code
description: Writes content to a file, creating directories if needed.
---

# Write Code

Writes string content to a specified file path.

## Inputs
-   `filePath`: Target file path (relative).
-   `content`: The code/text to write.

## Outputs
-   Success message or error message.

## Instructions
1.  Ensure the directory structure exists. If not, create it.
2.  Write the `content` to `filePath`.
3.  Overwrite if file exists.
4.  **IMPORTANT**: Always use the correct file extension based on the explicit `Tech Stack` provided in the context (e.g., use `.tsx` for React/Next.js components, `.ts` for logic, `.css`/`.scss` for styles).
5.  Do NOT create `.txt` or `.md` files unless explicitly asked for documentation.
6.  For UI components in Next.js/React, ensure you import React and necessary libraries.

## UI Component Styling Rules (MANDATORY)

When creating UI components (pages, forms, modals, cards, etc.), you MUST follow these rules:

### 1. Use shadcn/ui Components
Always import and use existing UI components from `@/components/ui/`:

| Element | shadcn/ui Component | Import Path |
|---------|---------------------|-------------|
| Button | `Button` | `@/components/ui/button` |
| Input | `Input` | `@/components/ui/input` |
| Label | `Label` | `@/components/ui/label` |
| Card | `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` | `@/components/ui/card` |
| Dialog | `Dialog`, `DialogTrigger`, `DialogContent` | `@/components/ui/dialog` |
| Select | `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` | `@/components/ui/select` |

### 2. Use Tailwind CSS Utilities for Layout
Apply Tailwind classes for layout and spacing:
- Container: `min-h-screen flex items-center justify-center`
- Card width: `w-full max-w-md` or `max-w-lg`
- Spacing: `space-y-4`, `gap-4`, `p-6`
- Flex: `flex flex-col`, `flex items-center`

### 3. Use Design Tokens (CSS Variables)
Always use project's design tokens for colors:
- Background: `bg-background`, `bg-card`
- Text: `text-foreground`, `text-muted-foreground`
- Border: `border-border`, `border-input`
- Primary: `bg-primary`, `text-primary`

### 4. Example: Form Page Structure
```tsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

export default function ExampleFormPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Form Title</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="field1">Field Label</Label>
            <Input id="field1" placeholder="Enter value..." />
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full">Submit</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
```

**NEVER use plain HTML elements (`<input>`, `<button>`, `<div>` without styling) for UI components.**
