---
name: feature-implementation-planner
description: Outlines a feature implementation plan adhering to project guidelines. Suggests new and updated components, highlights common components needed, asks for user feedback, and iteratively updates the plan based on review comments.
author: "Abhijit Kumar Jha"
author_url: "https://github.com/abhijeetjha0"
version: "1.1.0"
---

# 📝 Skill: feature-implementation-planner

Use this skill whenever asked to plan a new feature or significant architectural change. This skill enforces a structured, iterative planning process to ensure alignment with the user and adherence to project guidelines before any code is written.

---

## 📌 Core Rules & Learnings for AI Agents

1. **Research & Analysis First**:
   - Do NOT write any application code during the planning phase.
   - Thoroughly review existing project guidelines (`AGENTS.md`, modular `AGENTS.md` files) and the codebase to ensure the proposed feature integrates seamlessly.

2. **Generate the Implementation Plan**:
   - Create or update the `implementation_plan.md` artifact (setting `request_feedback = true` and `user_facing = true`).
   - The plan MUST include:
     - **Goal Description**: What the feature is and its business/technical value.
     - **Architecture & Component Strategy**:
       - **New Components**: List UI elements, utilities, or services to be created.
       - **Updated Components**: List existing files that require modification.
       - **Common Components**: Explicitly identify any components that should be generalized or abstracted for reusability across the project.
     - **Open Questions & User Review Required**: Highlight critical design decisions or ambiguity needing user input.
     - **Verification Plan**: Outline how the feature will be tested (unit tests, manual verification steps).

3. **Solicit User Feedback**:
   - Explicitly ask the user: "Do you like this plan? Please provide any review comments or modifications you'd like to make."
   - STOP execution and wait for the user's response.

4. **Iterative Updates**:
   - If the user provides feedback, criticisms, or requests changes, DO NOT proceed to execution.
   - Update the `implementation_plan.md` artifact incorporating the feedback.
   - Present the updated plan and ask for approval again.

5. **Proceed to Execution**:
   - Only begin modifying application code or executing the implementation steps *after* the user explicitly approves the plan.
   - Upon approval, initialize the `task.md` artifact to track implementation progress.
