---
name: test-case-and-coverage-enhancer
description: Analyzes test coverage and writes test cases to maintain > 90% total project code coverage. Ensures net positive coverage for the active git diff.
author: "Abhijit Kumar Jha"
author_url: "https://github.com/abhijeetjha0"
version: "1.1.0"
---

# 🧪 Skill: test-case-and-coverage-enhancer

Use this skill whenever asked to run test cases, analyze coverage, and write more test cases to enhance project coverage metrics.

---

## 📌 Core Rules & Learnings for AI Agents

1. **Total Project Coverage Standard**:
   - The primary goal is to achieve and maintain at least **90% total code coverage** across all measured metrics (Statements, Branches, Functions, Lines) in the project.
2. **Net-Positive Diff Coverage Requirement**:
   - When analyzing the current active Git changeset (`git diff HEAD` or `git diff main`), the changes MUST result in **net-positive code coverage**. 
   - New logic or changed code blocks must have corresponding unit test cases written or updated to hit those lines. Coverage must not drop as a result of the diff.
3. **Execution Steps**:
   - **Step 1: Test Execution**: Always begin by running the project's standard test command with coverage enabled (e.g., `npm run test:coverage`, `pytest --cov`, `go test -cover`) to generate the latest coverage matrix.
   - **Step 2: Differential Analysis**: Identify all application source files modified in the current git diff.
   - **Step 3: Coverage Gap Identification**: Extract the precise "Uncovered Line #s" from the coverage report output for the modified files.
   - **Step 4: Source Analysis**: Read the source code at those specific line numbers to understand the unhandled paths (e.g., error boundaries, loading states, conditional branches, ternary operators).
   - **Step 5: Test Generation**: Create or update the corresponding test files to explicitly trigger the uncovered code paths using the project's standard testing framework and libraries.
   - **Step 6: Verification**: Rerun the test and coverage commands. Assert that the coverage report shows 100% (or significantly improved) coverage for the modified files, resulting in a net-positive increase for the project, and ensuring total project coverage remains above 90%.
4. **Testing Conventions**:
   - Follow the established testing conventions of the current project strictly: correctly mock external dependencies, APIs, and routing as appropriate for the language/framework. 
   - Suppress expected error logs correctly using the standard mocking tools of the framework during tests that intentionally trigger errors.
   - Do not randomly guess test paths. Write precise tests targeting the exact uncovered line gaps.
5. **Strict Verification**:
   - **Zero Test Failures**: Ensure that **NO TESTS FAIL** before declaring the coverage enhancement successful. If tests are failing after adding coverage or making changes, you MUST fix the failing tests.
   - **Clean Console**: Check the test output for unexpected warnings or errors and resolve them by either fixing the underlying issue or mocking the output correctly.
6. **Reporting**:
   - After successfully raising the coverage, summarize the gaps that were filled and present the final coverage metrics to the user. For this, execute the coverage command again and compare the difference you have made. State the prior percentage, the current percentage, and the total increase contributed.
