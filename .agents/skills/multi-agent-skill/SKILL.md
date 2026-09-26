---
name: multi-agent-skill
description: >-
  Facilitates a multi-agent, multi-perspective execution of any selected skill in the project. It spawns three distinct perspectives tailored to the task and combines their outputs into a final implementation plan.
author: "Abhijit Kumar Jha"
author_url: "https://github.com/abhijeetjha0"
version: "1.0.0"
---

# Multi-Agent Skill Execution

## Overview
This skill acts as a meta-skill. It allows you to run any other skill in the repository using a "Mixture of Experts" or "Multi-Agent" approach. It dynamically determines three distinct expert perspectives based on the chosen task, executes the selected skill from each of those perspectives, and then synthesizes the results into a single cohesive implementation plan.

## Recommended Workflow

### 1. Discovery & Selection
- Scan the repository's `skills/` or `.agents/skills/` directories using file discovery tools (e.g., `list_dir`).
- Prompt the user with the list of available skills and ask them to select one.
- Ask the user to define the exact task or objective they want the selected skill to perform.

### 2. Dynamic Perspective Generation
- Based on the user's selected skill and task, dynamically determine **three distinct expert personas/perspectives**. 
- *Example:* If the task is building a new UI component, the perspectives might be: 1. Accessibility & UX Expert, 2. Performance & State Management Optimizer, 3. Component Architecture Purist.
- Present the three chosen perspectives to the user for confirmation or adjustment.

### 3. Multi-Agent Execution
- You must simulate or invoke three independent executions of the chosen skill.
- If you have an `invoke_subagent` tool available, spawn three separate subagents, assigning each one a specific persona from Step 2.
- If you do not have an `invoke_subagent` tool, you MUST execute the skill three times sequentially yourself. For each run, strictly adopt the assigned persona and generate the output in isolation.
- Ensure that the execution of the target skill strictly follows its own `SKILL.md` instructions, but colored by the assigned perspective.

### 4. Synthesis & Planning
- Collect the outputs, findings, or proposed code from all three runs.
- Analyze the results for overlapping agreements and conflicting approaches.
- **Strict Requirement:** Do NOT apply any changes directly to the codebase during synthesis.
- Generate a final `implementation_plan.md` artifact that merges the best ideas from all three perspectives into a single, actionable plan. Present this plan to the user for final approval.

## Best Practices
- Keep the three perspectives distinct and non-overlapping to maximize the diversity of ideas.
- During synthesis, explicitly mention which perspective contributed which key idea, so the user understands the rationale.
