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

## UI Component Guidelines (MANDATORY)

When creating UI components (pages, forms, modals, cards, etc.), you MUST follow these guidelines while remaining flexible to the specific requirements:

### 1. Component Usage Reference (shadcn/ui)
Use these components from `@/components/ui/` as building blocks. **Do NOT just copy-paste the structure; adapt it to the task's specific layout requirements.**

| Element | shadcn/ui Component | Import Path |
|---------|---------------------|-------------|
| Button | `Button` | `@/components/ui/button` |
| Input | `Input` | `@/components/ui/input` |
| Label | `Label` | `@/components/ui/label` |
| Card | `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` | `@/components/ui/card` |
| Dialog | `Dialog`, `DialogTrigger`, `DialogContent` | `@/components/ui/dialog` |
| Select | `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` | `@/components/ui/select` |

### 2. Layout Flexibility
- **Follow the exact layout requested.** If the user asks for a grid, vertical stack, or specific section ordering, implement exactly that.
- Use Tailwind CSS freely for layout: `grid`, `flex`, `space-y-X`, `gap-X`, `w-full`, etc.
- **NEVER** stick to a fixed template if the task description implies a different structure.

### 3. Component Reference Example
*This is a reference for how to use shadcn/ui components, NOT a template to be used every time.*

```tsx
// Using shadcn/ui building blocks to create a custom structure
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

// Example: A generic container using background and flex/grid
export default function FlexibleComponent() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
       {/* Use Card or other components as needed by the requirement */}
       <Card className="max-w-2xl mx-auto">
         <CardHeader>
           <CardTitle>Dynamic Title</CardTitle>
         </CardHeader>
         <CardContent>
            {/* The internal structure should vary based on the prompt! */}
         </CardContent>
       </Card>
    </div>
  );
}
```

**CRITICAL**: You are an expert engineer. Judge the best structure for the specific request. **NEVER use plain HTML elements (`<input>`, `<button>`, `<div>` without styling) for UI components.**
