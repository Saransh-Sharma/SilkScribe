# SilkScribe Marketing Website Copy Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current implementation/support-oriented GitHub Pages copy with premium, workflow-first marketing copy for private Mac voice typing.

**Architecture:** Keep all work scoped to the GitHub Pages site. Use `site/src/content.ts` as the source of structured copy and keep page components responsible for rendering the new sections.

**Tech Stack:** React, TypeScript, Vite, GitHub Pages, Bun.

---

## Tasks

### Task 1: Guardrails
- [x] Confirm existing dirty worktree contains unrelated app/backend changes.
- [x] Keep implementation scoped to `site/**` and this plan document.
- [x] Do not edit `src/**`, `src-tauri/**`, or `src/i18n/**`.

### Task 2: Content Model
- [x] Add CTA fallback constants for App Store URL or GitHub Releases.
- [x] Add structured arrays for hero proof points, how-it-works steps, examples, app badges, privacy cards, output cards, use cases, audience cards, setup cards, and trust strip.
- [x] Rewrite support channels, FAQ, and nav copy to match the new tone.

### Task 3: Homepage
- [x] Replace hero copy with "Don't open another AI app. Just speak."
- [x] Add before/after demo copy in the first viewport.
- [x] Add problem, workflow, examples, app coverage, privacy, output quality, use case, Mac utility, open source, and final CTA sections.
- [x] Remove App Store review and iOS companion positioning from the homepage.

### Task 4: Shared Shell And Support
- [x] Update nav, header CTA, footer tagline, and footer description.
- [x] Rewrite support page hero, FAQ intro, and known-limits language.
- [x] Keep support utility intact for permissions, shortcuts, insertion, model setup, history/logs, email, and GitHub issues.

### Task 5: SEO And CSS
- [x] Update homepage and support metadata.
- [x] Add CSS for the new card grids, app badges, before/after cards, and final CTA.
- [x] Preserve the existing visual system and responsive breakpoints.

### Task 6: Verification
- [x] Run `bun run build:site`.
- [x] Verify changed files are limited to site files and the plan document.
