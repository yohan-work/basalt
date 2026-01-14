---
name: manage_git
description: Performs basic git operations like checkout, commit, and merge.
---

# Manage Git

Executes git commands to manage version control.

## Inputs
-   `action`: 'checkout', 'commit', or 'merge'.
-   `args`: Arguments for the action (branch name, commit message).

## Outputs
-   Success or error message.

## Instructions
1.  Construct the git command based on `action` and `args`.
2.  Execute it.
3.  Return the output.
