---
name: duplicate-code-resolver
description: Analyzes duplication reports or raw code, generates an iterative implementation plan to resolve duplications, waits for developer approval before executing, and completes the process by ensuring code quality and tests pass.
author: "Abhijit Kumar Jha"
author_url: "https://github.com/abhijeetjha0"
version: "1.2.0"
---

# 📝 Skill: duplicate-code-resolver

Use this skill whenever asked to resolve code duplication. This skill enforces a strict, iterative workflow to safely refactor and dry up the codebase while maintaining full test coverage and code quality, regardless of the language or tooling used.

---

## 📌 Core Rules & Workflow for AI Agents

1. **Detect Setup & Ensure Tooling (Prerequisite)**:
   - Before running any analysis, check whether the repository already has a duplication detection tool configured. Look for:
     - Existing config files (e.g., `.jscpd.json`, `.cpd.xml`, `sonar-project.properties`, `.flay` config).
     - Scripts in `package.json` (e.g., `"dupcheck"`, `"jscpd"`), `Makefile`, `Rakefile`, or CI config that invoke a duplication tool.
   - **If NO tool is found**, detect the project's primary language/framework by inspecting manifest and config files (e.g., `package.json`, `tsconfig.json`, `pom.xml`, `build.gradle`, `Gemfile`, `requirements.txt`, `go.mod`, `Cargo.toml`, `*.csproj`). Then recommend the most appropriate tool from the table below:

     | Language / Stack | Recommended Tool | Install Command |
     |---|---|---|
     | JavaScript / TypeScript | [jscpd](https://github.com/kucherenko/jscpd) | `npm install --save-dev jscpd` or `npx jscpd` (no install) |
     | Java (Maven) | [PMD CPD](https://pmd.github.io/) | `mvn pmd:cpd` (plugin, no separate install) |
     | Java (Gradle) | [PMD CPD](https://pmd.github.io/) | Add `pmd` plugin to `build.gradle` |
     | Python | [pylint](https://pylint.readthedocs.io/) (similarities checker) | `pip install pylint` then `pylint --disable=all --enable=similarities` |
     | Ruby | [flay](https://github.com/seattlerb/flay) | `gem install flay` |
     | Go | [dupl](https://github.com/mibk/dupl) | `go install github.com/mibk/dupl@latest` |
     | Rust | [rust-code-analysis](https://github.com/nicovank/duplo) | `cargo install duplo` |
     | C# / .NET | [jscpd](https://github.com/kucherenko/jscpd) (multi-lang) | `npx jscpd` or `dotnet tool install --global jscpd` |
     | Multi-language / Monorepo | [jscpd](https://github.com/kucherenko/jscpd) | `npx jscpd` (supports 150+ formats) |

   - **Prompt the user before installing**: Present the recommendation clearly and ask:
     > "I detected this is a **[language/framework]** project but no duplication detection tool is configured. I recommend installing **[tool]** via `[install command]`. Should I proceed with the installation?"
   - **STOP and wait** for the user's explicit approval before running any install command.
   - If the user declines or prefers a different tool, use their choice instead. If no tool is desired at all, fall back to manual/semantic analysis in the next step.

2. **Analyze Duplication**:
   - If a specific duplication tool is configured in the repository (e.g., `jscpd`, SonarQube, or a custom script) or was just installed in Step 1, run it using the appropriate command.
   - If no tool is available (user declined installation), manually inspect the provided code paths or use semantic tools to identify clones.
   - Identify the duplicated lines, tokens, and exactly which files and code snippets are involved.
3. **Generate the Implementation Plan**:
   - Do NOT write any application code or refactoring code during this phase.
   - Create or update the `implementation_plan.md` artifact (setting `request_feedback = true` and `user_facing = true`).
   - The plan MUST include:
     - **Duplication Summary**: Which components/files contain the clones.
     - **Refactoring Strategy**: How you plan to extract the duplicated logic. Will it be a new utility function? A base class? A custom hook?
     - **Affected Files**:
       - **New Files**: Where the shared logic will be extracted.
       - **Updated Files**: The files where the duplications will be removed and replaced by imports/usage of the new shared logic.
     - **Open Questions**: Highlight any design ambiguity (e.g., how to name the new shared component, or edge cases).
4. **Solicit User Feedback & Replan**:
   - Explicitly ask the user: "Do you approve of this refactoring plan? Please provide any review comments."
   - STOP execution and wait for the developer's explicit approval.
   - If the developer provides feedback or requests changes, update the `implementation_plan.md` and ask for approval again. **Do NOT proceed until the developer explicitly asks you to.**
5. **Execute the Plan**:
   - Only begin modifying code after the developer approves the plan.
   - Create a `task.md` artifact to track your progress as you extract the shared logic and update the dependent files.
6. **Post-Implementation Verification (Critical)**:
   - After the refactoring succeeds, you MUST verify the changes using the repository's generic tools:
     - Run the repository's configured linter (if any) to ensure code style is maintained.
     - Run the repository's configured test suite (if any) to verify that the refactoring did not break existing functionality.
   - If tests fail, you MUST update or add new test cases to cover the newly created shared utilities/components and fix the broken tests.
   - Run the duplication check again to verify that the duplication has been successfully removed.
