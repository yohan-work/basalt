---
name: generate_scss
description: Generates SCSS code for a specific module or component.
---

# Generate SCSS

Creates SCSS code adhering to the project's mixins and variables.

## Inputs
-   `moduleName`: Name of the class/module (e.g., 'Header').

## Outputs
-   The generated SCSS string.

## Instructions
1.  Use project variables (e.g., `var(--background)`) where possible.
2.  Nest selectors appropriately.
3.  Return valid SCSS code.
