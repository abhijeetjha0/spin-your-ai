---
name: project-explainer
description: >-
  Explains how a project works based on a deep scan and analysis of its files, directory structure, and configuration files. Use this skill when the user asks to understand a codebase, its architecture, or how its components interact.
author: "Abhijit Kumar Jha"
author_url: "https://github.com/abhijeetjha0"
version: "1.0.0"
---

# Project Explainer

## Overview
This skill provides a systematic approach for an AI agent to analyze, understand, and explain an unfamiliar project. It focuses on identifying key configuration files, mapping the directory structure, and reading critical source code to construct a comprehensive mental model and explain the project's architecture, technologies, and workflows to the user.

## Prerequisites & Tools
- File system access (tools like `list_dir`, `view_file`, `grep_search`).
- Understanding of common project structures and frameworks (e.g., Node.js, Python, Go, React).

## Recommended Workflow

### 1. Discovery & Analysis
- **Identify Root Configurations**: Look for package managers and build tools (`package.json`, `requirements.txt`, `pom.xml`, `go.mod`, `Makefile`, `docker-compose.yml`, etc.) to understand dependencies and the tech stack.
- **Scan Directory Structure**: Use `list_dir` or tree commands to understand the high-level layout. Identify source code directories (`src/`, `lib/`), test directories (`test/`, `spec/`), and static assets.
- **Locate Entry Points**: Find the main application entry points (e.g., `index.js`, `main.py`, `app.go`, `manage.py`).
- **Analyze Infrastructure/Deployment**: Look for CI/CD configs (`.github/workflows/`, `.gitlab-ci.yml`), Dockerfiles, and Terraform scripts.

### 2. Execution Steps
- **Gather Context**: Read the identified configuration files and entry points.
- **Trace Core Logic**: Follow imports and function calls from the entry points to core business logic and routing/controllers.
- **Synthesize Information**: Piece together the architecture. What is the frontend? What is the backend? How is data stored and accessed?
- **Generate Explanation**: Structure the explanation clearly for the user. Include:
  - High-level summary of the project's purpose.
  - Tech stack overview.
  - Directory structure highlights.
  - Explanation of key components and data flow.
  - Instructions on how to run or build the project locally.

### 3. Verification & Validation
- Ensure all major configuration files found were accounted for in the explanation.
- Verify that the entry points mentioned actually exist in the codebase.
- Ask the user if they need a deeper dive into any specific component.

## Best Practices & Guidelines
- Do not overwhelm the user with every single file; focus on the most critical files and directories.
- Always check for existing documentation (`README.md`, `CONTRIBUTING.md`, `docs/`) first, as it often provides a solid foundation or high-level architecture overview.
- Adapt the depth of the explanation based on the user's initial request.
