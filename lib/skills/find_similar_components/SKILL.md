---
name: find_similar_components
description: Searches the codebase for components similar to what needs to be created, providing references for consistent code generation.
---

# Find Similar Components

Searches existing components in the project that are similar to what the agent needs to create, providing code references.

## Inputs
-   `projectPath`: The root path of the project.
-   `query`: Description of the component to find (e.g., "login form", "user card", "data table").
-   `componentType`: Type of component to search for (page, component, hook, util).

## Outputs
-   An array of similar components:
    -   `filePath`: Path to the component file
    -   `componentName`: Name of the component
    -   `relevanceScore`: How relevant this component is (0-1)
    -   `content`: Full content of the file
    -   `summary`: Brief description of what the component does

## Instructions
1.  Search component directories for files matching the query keywords.
2.  Read each candidate file and analyze its purpose.
3.  Score relevance based on name matching and content analysis.
4.  Return top 3-5 most relevant components with their full content.
5.  If using LLM, ask it to summarize each component's purpose.

## Use Cases
-   Before creating a new form, find existing forms to reference their structure.
-   When adding a new page, find similar pages for layout reference.
-   Ensure new components follow the same patterns as existing ones.
