---
name: modular-agents-generator
description: >-
  Scans a project's structure and recent changes to create or update folder-scoped
  AGENTS.md files following a modular, hierarchical pattern. Detects the tech stack,
  identifies each module's purpose, and generates contextual agent guidelines per
  directory — keeping the root AGENTS.md as a high-level orchestrator.
author: "Abhijit Kumar Jha"
author_url: "https://github.com/abhijeetjha0"
version: "1.0.0"
---

# 📝 Skill: modular-agents-generator

Use this skill whenever asked to create, update, or maintain `AGENTS.md` (or `GEMINI.md`) files in a project — especially when the project benefits from **folder-scoped, modular agent guidelines** rather than a single monolithic file.

---

## 🧠 Why Modular AGENTS Files?

A single root `AGENTS.md` becomes unwieldy as projects grow. Modular AGENTS files:
- **Scope rules to where they matter** — database rules live in `src/db/AGENTS.md`, not in the root.
- **Reduce noise** — agents only load guidelines relevant to the folder they're working in.
- **Scale naturally** — adding a new module means adding a new AGENTS file, not editing a giant one.
- **Follow progressive disclosure** — root file provides high-level guidance; leaf files provide deep context.

---

## 📌 Core Rules & Workflow for AI Agents

### 1. Discover the Project & Recent Changes

- **Scan the project structure**: Use `list_dir` and `view_file` to understand the repository layout — directories, config files, and any existing AGENTS/GEMINI files.
- **Inspect recent changes** (if updating, not creating from scratch):
  - Run `git log --oneline -20` to see recent commits.
  - Run `git diff HEAD~5 --stat` (or an appropriate range) to identify which folders/files changed recently.
  - Focus AGENTS updates on the directories that were modified.
- **Detect the tech stack**: Inspect manifest/config files (`package.json`, `tsconfig.json`, `pom.xml`, `build.gradle`, `requirements.txt`, `go.mod`, `Cargo.toml`, `Gemfile`, `pyproject.toml`, etc.) to understand the project's language, frameworks, and tooling.

### 2. Identify Modules & Plan the AGENTS Hierarchy

Map out which directories deserve their own `AGENTS.md`. Use this decision framework:

| Directory Pattern | Gets an AGENTS.md? | Rationale |
|---|---|---|
| Project root (`/`) | ✅ Always | High-level project purpose, global conventions, and cross-cutting rules |
| Source root (`src/`, `app/`, `lib/`) | ✅ Usually | Overall code style, import conventions, shared patterns |
| Feature modules (`src/auth/`, `src/dashboard/`) | ✅ If distinct domain | Domain-specific rules, naming conventions, business logic constraints |
| API / Routes (`src/api/`, `pages/api/`) | ✅ If present | Endpoint conventions, middleware rules, response format standards |
| Database / Models (`src/db/`, `src/models/`) | ✅ If present | Schema conventions, migration rules, query patterns, ORM usage |
| Components / UI (`src/components/`, `src/ui/`) | ✅ If present | Component patterns, prop conventions, styling rules |
| Tests (`tests/`, `__tests__/`, `spec/`) | ✅ If present | Testing framework, naming conventions, fixture management |
| Config / Infra (`infra/`, `.github/`, `scripts/`) | ⚠️ Optional | CI/CD conventions, deployment rules — only if non-trivial |
| Generated / Vendor (`node_modules/`, `dist/`, `build/`) | ❌ Never | These are not human-authored; skip entirely |

**Present the planned hierarchy to the user** before writing any files:
```
Proposed AGENTS.md structure:
├── AGENTS.md                  (root — project overview & global rules)
├── src/AGENTS.md              (source conventions & shared patterns)
│   ├── src/api/AGENTS.md      (API endpoint rules)
│   ├── src/db/AGENTS.md       (database & schema conventions)
│   └── src/components/AGENTS.md (UI component patterns)
└── tests/AGENTS.md            (testing guidelines)
```

Ask the user: **"Does this hierarchy look right? Should I add or remove any folders?"**

**STOP and wait** for user approval before proceeding.

### 3. Generate / Update Each AGENTS.md

For each directory in the approved plan, generate an `AGENTS.md` file with the following structure:

#### Root AGENTS.md Template

```markdown
# Project Agent Guidelines

## Project Overview
[Brief description of what this project does, auto-detected from README/package.json/etc.]

## Tech Stack
- **Language**: [detected]
- **Framework**: [detected]
- **Package Manager**: [detected]
- **Test Framework**: [detected]

## Global Conventions
- [coding style rules — e.g., "Use TypeScript strict mode", "Follow PEP 8"]
- [import ordering rules]
- [error handling patterns]

## Modular Guidelines
This project uses folder-scoped AGENTS files. Each subdirectory may contain its own
`AGENTS.md` with rules specific to that module. Always check for and follow the
nearest `AGENTS.md` when working in a subdirectory.

## Directory Guide
| Directory | Purpose |
|---|---|
| `src/` | Application source code |
| `tests/` | Test suites |
| ... | ... |
```

#### Subdirectory AGENTS.md Template

```markdown
# [Module Name] — Agent Guidelines

## Purpose
[What this module/folder does — auto-detected from file analysis]

## Key Files
| File | Role |
|---|---|
| `index.ts` | Module entry point / barrel exports |
| `types.ts` | Shared type definitions |
| ... | ... |

## Conventions
- [module-specific patterns — e.g., "All API handlers must validate input with zod"]
- [naming conventions — e.g., "Component files use PascalCase"]
- [dependency rules — e.g., "This module must NOT import from `src/ui/`"]

## Common Patterns
[Code patterns specific to this directory, e.g.:]
- Middleware pattern for API routes
- Repository pattern for database access
- Compound component pattern for UI

## Testing
- [How to test files in this directory]
- [Test file naming convention]
```

#### Content Generation Rules

- **DO NOT invent rules.** Base all guidelines on what you actually observe in the code — naming patterns, existing conventions, import styles, error handling, etc.
- **DO quote real examples** from the codebase when illustrating a pattern.
- **DO flag inconsistencies** as "Open Questions" rather than silently picking one style.
- **DO keep each file concise** — aim for 30–80 lines per AGENTS file. If it's longer, you're probably including rules that belong in a child directory.

### 4. Present Results & Solicit Feedback

After generating all AGENTS files:
- Create an artifact (`agents_hierarchy_summary.md`) listing every AGENTS file created/updated with a brief summary of what each contains.
- Ask the user: **"Please review the generated AGENTS files. Should I adjust any rules, add more detail to specific modules, or remove any files?"**
- **STOP and wait** for user feedback.
- Iterate based on feedback until the user approves.

### 5. Update-Only Mode (for Recent Changes)

When the user asks to **update** existing AGENTS files based on recent changes:

1. Run `git diff` or `git log` to identify changed directories.
2. For each changed directory that already has an `AGENTS.md`:
   - Re-scan the directory contents.
   - Compare the current AGENTS rules against the actual code patterns.
   - Update rules that are outdated, add rules for new patterns, remove rules for deleted patterns.
3. For each changed directory that does NOT have an `AGENTS.md`:
   - Evaluate whether it now qualifies (see the table in Step 2).
   - If yes, propose creating one and ask the user.
4. Present a diff-style summary of all changes made.

---

## ⚙️ Configuration & Naming

- **File name**: Use `AGENTS.md` by default. If the user's tooling prefers `GEMINI.md` or another variant, ask once and use that consistently.
- **Inheritance**: Rules cascade from root → parent → child. Child AGENTS files should NOT repeat rules from the root; they should only add module-specific guidance.
- **Conflict resolution**: If a child rule contradicts a parent rule, flag it as a warning and ask the user to resolve it.

---

## 🚫 Anti-Patterns to Avoid

- **Don't create AGENTS files for every single folder** — only for directories with meaningfully distinct conventions.
- **Don't include implementation details** — AGENTS files describe *how to work in the folder*, not *what the code does line by line*.
- **Don't duplicate linter/formatter rules** — if ESLint/Prettier/Black already enforces a rule, don't restate it. Reference the config instead (e.g., "Follow `.eslintrc.json` for style rules").
- **Don't make assumptions about external services** — if you see API keys or service integrations, note them but don't guess at their configuration.
