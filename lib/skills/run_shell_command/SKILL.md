---
name: run_shell_command
description: Executes a shell command in the terminal.
---

# Run Shell Command

Executes a command string in the system shell.

## Inputs
-   `command`: The command to execute (e.g., 'npm test').

## Outputs
-   A JSON object with `stdout` and `stderr`.

## Instructions
1.  Execute the command safely.
2.  Capture standard output and standard error.
3.  Return these as the result.
