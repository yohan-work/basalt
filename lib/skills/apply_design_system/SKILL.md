---
name: apply_design_system
description: Applies the project's design system to a component or page.
---

# Apply Design System

Injects appropriate classes or styles to match the project's design guidelines.

## Inputs
-   `componentPath`: Path to the component file.

## Outputs
-   Success message.

## Project Design System

### Available shadcn/ui Components
The project uses **shadcn/ui** (new-york style) with the following components available at `@/components/ui/`:

| Component | Exports | Usage |
|-----------|---------|-------|
| `button` | `Button`, `buttonVariants` | Primary actions, form submissions |
| `input` | `Input` | Text inputs, form fields |
| `label` | `Label` | Form field labels |
| `card` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | Content containers, forms |
| `dialog` | `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle` | Modals, popups |
| `select` | `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` | Dropdowns |
| `avatar` | `Avatar`, `AvatarImage`, `AvatarFallback` | User avatars |
| `badge` | `Badge` | Status indicators, tags |
| `separator` | `Separator` | Visual dividers |
| `scroll-area` | `ScrollArea` | Scrollable containers |

### Design Tokens (CSS Variables)
The project uses a **White/Black + Point Color (#007AFF)** theme defined in `app/globals.css`:

```css
:root {
  --background: #FFFFFF;
  --foreground: #000000;
  --primary: #007AFF;
  --primary-foreground: #FFFFFF;
  --card: #FFFFFF;
  --card-foreground: #000000;
  --border: #000000;
  --input: #000000;
  --ring: #007AFF;
  --radius: 0rem; /* Flat minimalism */
}
```

### Tailwind Class Mapping
| Token | Tailwind Class |
|-------|----------------|
| Background | `bg-background` |
| Foreground | `text-foreground` |
| Primary Button | `bg-primary text-primary-foreground` |
| Card | `bg-card text-card-foreground` |
| Border | `border-border` |
| Muted Text | `text-muted-foreground` |

## Instructions
1.  Analyze the component's current structure.
2.  Replace plain HTML elements with shadcn/ui components.
3.  Add Tailwind utility classes that align with the Global Design System (colors, spacing, typography).
4.  Use CSS variable-based classes (`bg-background`, `text-foreground`, etc.) instead of hardcoded colors.
5.  Ensure dark mode support by using the design token system.
6.  Do not break existing functionality.
