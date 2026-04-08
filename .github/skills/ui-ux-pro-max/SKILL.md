---
name: ui-ux-pro-max
description: "Use when improving web UI/UX quality, redesigning pages, polishing visual hierarchy, fixing responsiveness, adding animations, defining design tokens, improving accessibility, or implementing modern frontend experiences for Emerald Pearland Events. Trigger phrases: ui ux pro max, redesign, polish UI, improve UX, modernize layout, mobile responsiveness, accessibility improvements."
---

# UI UX Pro Max Skill

## Purpose
Use this skill to produce high-quality UI and UX improvements with clear visual direction, practical accessibility, and production-ready frontend code.

## Workflow
1. Inspect current page or component structure and identify constraints from the existing design system.
2. Define a focused visual direction before coding:
   - typography strategy
   - color palette and contrast
   - spacing and layout rhythm
   - motion strategy
3. Introduce or refine design tokens using CSS variables:
   - colors
   - spacing
   - radius
   - shadows
   - transition durations
4. Implement responsive behavior first for mobile, then refine tablet and desktop breakpoints.
5. Add meaningful motion only where it improves clarity (entrance transitions, progressive reveals, state changes).
6. Improve accessibility:
   - semantic HTML
   - keyboard focus states
   - aria labels for controls
   - color contrast checks
7. Validate visually and functionally:
   - no layout shifts
   - no overflow regressions
   - no broken interactions

## Output Requirements
- Keep existing product behavior intact unless a change is explicitly requested.
- Prefer small, reviewable commits and scoped file edits.
- Document what changed and why in concise terms.
- When adding styles, avoid one-off magic values when a reusable token can be used.

## Emerald-Specific Guidance
- Preserve existing brand language and event-management workflows.
- Prioritize admin dashboard clarity for high-density information areas.
- Ensure booking and payment related screens remain fast and legible on mobile.

## Example Requests This Skill Handles
- "Redesign the booking page with stronger hierarchy and mobile-first layout"
- "Improve dashboard readability and spacing without changing functionality"
- "Add modern transitions and visual polish to admin cards and tables"
- "Refactor styles to use consistent design tokens"

## Definition of Done
- Interface is clearly more intentional and polished.
- Mobile and desktop layouts both render correctly.
- Accessibility and focus states are preserved or improved.
- No new console errors or obvious regressions are introduced.
