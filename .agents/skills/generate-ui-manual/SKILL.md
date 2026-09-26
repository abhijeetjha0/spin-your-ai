---
name: generate-ui-manual
description: Deep scans UI features to generate or update the UI manual as an in-app Help page, ensuring human readability, and updates README.md and AGENTS.md to enforce keeping the manual synced with feature changes.
author: "Abhijit Kumar Jha"
author_url: "https://github.com/abhijeetjha0"
version: "1.1.0"
---

# 📝 Skill: generate-ui-manual

Use this skill whenever asked to generate, update, or maintain the UI Manual based on the active UI features in the application.

---

## 📌 Core Rules & Workflow for AI Agents

1. **Deep Scan of UI Features**:
   - **Pre-Scan Verification**: If the development server is not running, prompt the user to execute `npm run dev` before proceeding.
   - **Active Browser Navigation**: You MUST use AI-based browser navigation tools (like `browser_subagent` or `read_url_content`) to actively navigate and scan the rendered web components and routes in the running browser at `http://localhost:3000`. Do NOT solely rely on reading the source code in the `app/` directory. Navigating the real UI ensures that no interactive features (e.g., dropdowns, layout toggles, badges, or hidden panels) are missed.
   - Fully map out all active UI capabilities across all main routes (Pokedex, Team Builder, Moves, Items, Abilities, Types, Generations) to understand exactly what the product can do from a user's perspective.
   - **Note:** Do NOT analyze the `app/help` route itself during the scan.
   - Read the `README.md` and `AGENTS.md` files to cross-reference and ensure no active features or context are missed.
1. **Generate or Update the In-App Help Page**:
   - **Data Separation**: The actual content of the manual MUST be stored in `app/help/help-sections.json` and mapped into the client component (`app/help/help-client.js`). Do not hardcode manual text inside the React components.
   - **No Headers**: Do NOT include a top-level page header (no `h1`), and do NOT include any introductory alert regarding GitHub pages. The first element should be the search bar or the sections.
   - **In-Page Search**: Include a text input at the top of the manual that filters the visible sections based on string matches (filtering titles, descriptions, and nested steps).
   - **Semantic Structure**: Use standard HTML semantic tags (`<section id="...">`, `<h2>`, `<h3>`). The `id` tags are critical for deep linking.
   - **Step-by-Step Guidance**: First explain what a feature is, then add "Steps to use", then add numerical digits "1. " "2. " as steps detailing exactly *how* to use the feature.
   - **Step Accuracy & Terminology**: Explicitly mention specific UI elements (e.g., "buttons/tabs" instead of assuming "dropdowns"). Mention edge-case features like "extreme end pagination buttons". Use "List" instead of "Catalog" or "main page", and use positive framing (e.g., "informational" instead of "text-heavy").
   - **Exhaustive Breakdowns**: Break down complex pages (like Pokemon Details) into exhaustive sub-features (e.g., Card/Info, Pokedex Entry, Forms, Base Stats, Type Defenses, Evolution Chain, Abilities, Moves, Game Locations) rather than grouping them generically.
   - **Concise Titles**: Section titles should be concise without explanatory text in brackets (e.g., use "Pokedex" instead of "Pokedex (The Pokemon Encyclopedia)").
   - **Deep Explanations**: Assume the user has **zero** knowledge about the Pokémon universe. Extensively explain core mechanics (Types, Moves, Abilities, Stats, Evolutions) in simple, beginner-friendly terms.
   - **Route Coverage**: Each route that is accessible through the main Navbar MUST have its own dedicated Help section (with the sole exception of the "Help" route itself).
   - Group features into categories representing each page exactly the way they appear in the UI (e.g., "Home/Pokedex", "Team Builder", "Moves", "Items", "Abilities").
   - If the Help page already exists, surgically update the components to add new features or remove obsolete ones.
3. **Integrate with Navbar & Floating Button**:
   - Update `app/components/navbar.js` to include a distinct "Help" link.
   - Update `app/page.js` to include a project-themed blue button (e.g., `.btn-primary`) pointing to the manual route.
   - Ensure a context-aware floating button (`HelpFloatingButton`) exists and functions on all pages to link to the correct section IDs of the manual based on `usePathname()`.
4. **Update `README.md`**:
   - Edit the root `README.md` to mention the in-app Help page (and note its availability on GitHub Pages deployment).
   - Suggest that users read the manual to fully understand how to use the application's features.
5. **Update `AGENTS.md` Architecture**:
   - Edit the root `AGENTS.md` (and any highly relevant modular `AGENTS.md` files like `app/AGENTS.md`) to include a new **mandatory rule**.
   - The rule MUST explicitly state: 
     > *"Whenever adding, removing, or updating a UI feature, agents MUST automatically update the `app/help/page.js` manual to reflect the changes to keep the project manual accurate and in-sync."*
6. **Approval & Verification**:
   - Present a summary of the UI features you discovered and the manual structure you created/updated to the developer.
   - Verify that the Navbar link, `README.md` updates, and `AGENTS.md` rules were successfully placed.
