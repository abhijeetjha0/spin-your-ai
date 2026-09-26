---
name: duplicate-code-resolver
description: Analyzes duplication reports or raw code, generates an iterative implementation plan to resolve duplications, waits for developer approval before executing, and completes the process by ensuring code quality and tests pass.
author: "Abhijit Kumar Jha"
author_url: "https://github.com/abhijeetjha0"
version: "1.1.0"
---

# 📝 Skill: duplicate-code-resolver

Use this skill whenever asked to resolve code duplication. This skill enforces a strict, iterative workflow to safely refactor and dry up the codebase while maintaining full test coverage and code quality, regardless of the language or tooling used.

---

## 📌 Core Rules & Workflow for AI Agents

1. **Analyze Duplication**:
   - If a specific duplication tool is configured in the repository (e.g., `jscpd`, SonarQube, or a custom script), run it using the appropriate generic command or locally configured script.
   - If no tool is available, manually inspect the provided code paths or use semantic tools to identify clones.
   - Identify the duplicated lines, tokens, and exactly which files and code snippets are involved.
2. **Generate the Implementation Plan**:
   - Do NOT write any application code or refactoring code during this phase.
   - Create or update the `implementation_plan.md` artifact (setting `request_feedback = true` and `user_facing = true`).
   - The plan MUST include:
     - **Duplication Summary**: Which components/files contain the clones.
     - **Refactoring Strategy**: How you plan to extract the duplicated logic. Will it be a new utility function? A base class? A custom hook?
     - **Affected Files**:
       - **New Files**: Where the shared logic will be extracted.
       - **Updated Files**: The files where the duplications will be removed and replaced by imports/usage of the new shared logic.
     - **Open Questions**: Highlight any design ambiguity (e.g., how to name the new shared component, or edge cases).
3. **Solicit User Feedback & Replan**:
   - Explicitly ask the user: "Do you approve of this refactoring plan? Please provide any review comments."
   - STOP execution and wait for the developer's explicit approval.
   - If the developer provides feedback or requests changes, update the `implementation_plan.md` and ask for approval again. **Do NOT proceed until the developer explicitly asks you to.**
4. **Execute the Plan**:
   - Only begin modifying code after the developer approves the plan.
   - Create a `task.md` artifact to track your progress as you extract the shared logic and update the dependent files.
5. **Post-Implementation Verification (Critical)**:
   - After the refactoring succeeds, you MUST verify the changes using the repository's generic tools:
     - Run the repository's configured linter (if any) to ensure code style is maintained.
     - Run the repository's configured test suite (if any) to verify that the refactoring did not break existing functionality.
   - If tests fail, you MUST update or add new test cases to cover the newly created shared utilities/components and fix the broken tests.
   - Run the duplication check again to verify that the duplication has been successfully removed.
