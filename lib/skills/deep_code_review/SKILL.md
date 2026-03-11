---
name: deep_code_review
description: Performs a deep, multi-dimensional code review focusing on security, performance, and best practices.
---

# Deep Code Review

This skill performs a rigorous review of the provided code snippet or file content. It acts as an expert senior engineer looking for subtle bugs and architectural flaws.

## Inputs
-   `codeToReview`: The specific code snippet or file content to review.
-   `context`: (Optional) Broader context of where this code belongs in the application.

## Instructions
1. Analyze the `codeToReview` line by line.
2. Look for security vulnerabilities (e.g., XSS, injection, improper auth).
3. Look for performance bottlenecks (e.g., N+1 queries, unnecessary re-renders).
4. Look for maintainability issues (e.g., tightly coupled logic, poor naming).
5. Provide actionable feedback with specific code suggestions.

Output a structured markdown report with the following sections:
- **Summary**: Brief overview of the code quality.
- **Security Check**: Any security issues found.
- **Performance Analysis**: Any performance bottlenecks.
- **Maintainability Suggestions**: Suggestions for cleaner code.
- **Refactored Example**: (Optional) A snippet showing how to fix the major issues.

IMPORTANT: Write the entire review in KOREAN.
