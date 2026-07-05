---
version: "alpha"
name: "SilkScribe Product Design"
description: "A Stitch-style design system for SilkScribe, a quiet offline-first desktop speech-to-text app with warm native surfaces, forest primary actions, berry accents, gold focus states, soft panel depth, and compact settings workflows."
sources:
  stitchOverview: "https://stitch.withgoogle.com/docs/design-md/overview/"
  stitchSpecification: "https://stitch.withgoogle.com/docs/design-md/specification/"
  inspiration: "https://github.com/VoltAgent/awesome-design-md"
colors:
  primitive-green: "#293a18"
  primitive-pink: "#b1205f"
  primitive-gold: "#febf2b"
  primitive-red: "#c11317"
  primitive-sand: "#9e5f0a"
  neutral-ivory: "#fff8ef"
  neutral-cream: "#f7efe4"
  neutral-mist: "#efe4d6"
  neutral-stone: "#e2d3c2"
  neutral-sand-gray: "#c9b9a6"
  neutral-umber: "#3a2e24"
  neutral-ink: "#1b1511"
  dark-ink-0: "#0f0c0a"
  dark-ink-1: "#15110e"
  dark-ink-2: "#1d1712"
  dark-ink-3: "#2a211a"
  dark-border-1: "#3a2e24"
  dark-border-2: "#4a3b30"
  dark-text-1: "#fff3e6"
  dark-text-2: "#e7d9cb"
  dark-text-3: "#cbbba7"
  dark-disabled: "#7e7268"
  canvas: "#fff8ef"
  surface: "#ffffff"
  surface-alt: "#f7efe4"
  elevated: "#ffffff"
  text-primary: "#1b1511"
  text-secondary: "#3a2e24"
  text-tertiary: "#6a594b"
  text-inverse: "#fff8ef"
  text-disabled: "#a19386"
  border-subtle: "#efe4d6"
  border-default: "#e2d3c2"
  border-strong: "#c9b9a6"
  brand-primary: "#293a18"
  on-primary: "#fff8ef"
  brand-secondary: "#b1205f"
  on-secondary: "#fff8ef"
  brand-highlight: "#febf2b"
  on-highlight: "#1b1511"
  success: "#293a18"
  warning: "#febf2b"
  danger: "#c11317"
  info: "#9e5f0a"
  action-primary: "#293a18"
  action-primary-hover: "#223114"
  action-primary-pressed: "#1b2610"
  action-disabled: "#c9b9a6"
  action-danger: "#c11317"
  action-danger-hover: "#a80f12"
  action-focus: "#febf2b"
  accent-selection: "#b1205f"
  accent-glow: "#febf2b"
typography:
  display-lg:
    fontFamily: "'SF Pro Display', 'SF Pro Text', Inter, 'Segoe UI', sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 0.94
    letterSpacing: "-0.03em"
  display-md:
    fontFamily: "'SF Pro Display', 'SF Pro Text', Inter, 'Segoe UI', sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  title-lg:
    fontFamily: "'SF Pro Text', 'SF Pro Display', Inter, 'Segoe UI', sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  title-md:
    fontFamily: "'SF Pro Text', 'SF Pro Display', Inter, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0.01em"
  body-md:
    fontFamily: "'SF Pro Text', 'SF Pro Display', Inter, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0"
  body-sm:
    fontFamily: "'SF Pro Text', 'SF Pro Display', Inter, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0"
  label-sm:
    fontFamily: "'SF Pro Text', 'SF Pro Display', Inter, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.22em"
    textTransform: "uppercase"
  caption:
    fontFamily: "'SF Pro Text', 'SF Pro Display', Inter, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0"
  button:
    fontFamily: "'SF Pro Text', 'SF Pro Display', Inter, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.01em"
  mono:
    fontFamily: "'SF Mono', 'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0"
rounded:
  sm: "12px"
  md: "14px"
  lg: "18px"
  xl: "22px"
  onboarding-card: "36px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
shadows:
  card: "0 10px 28px rgba(16, 11, 8, 0.1)"
  lift: "0 14px 40px rgba(16, 11, 8, 0.14)"
  dark-card: "0 10px 28px rgba(0, 0, 0, 0.35)"
  dark-lift: "0 14px 40px rgba(0, 0, 0, 0.45)"
  overlay-lift: "0 20px 50px rgba(10, 16, 4, 0.55), 0 6px 16px rgba(158, 95, 10, 0.08)"
motion:
  press: "90ms"
  hover: "140ms"
  state: "220ms"
  panel: "260ms"
  overlay-in: "280ms"
  overlay-out: "220ms"
components:
  button-primary:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.on-primary}"
    borderColor: "{colors.action-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    minHeight: "40px"
    padding: "0 16px"
    shadow: "{shadows.card}"
  button-secondary:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text-primary}"
    borderColor: "{colors.border-default}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    minHeight: "40px"
    padding: "0 16px"
  settings-group:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border-subtle}"
    rounded: "{rounded.lg}"
    shadow: "{shadows.card}"
  setting-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    borderColor: "{colors.border-subtle}"
    rounded: "{rounded.lg}"
    minHeight: "48px"
    padding: "12px 14px"
  input:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.text-primary}"
    borderColor: "{colors.border-default}"
    rounded: "{rounded.md}"
    minHeight: "44px"
    padding: "10px 14px"
  toggle:
    backgroundColor: "{colors.elevated}"
    activeBackgroundColor: "{colors.action-primary}"
    borderColor: "{colors.border-default}"
    rounded: "{rounded.pill}"
    width: "52px"
    height: "28px"
  sidebar:
    backgroundColor: "{colors.surface-alt}"
    borderColor: "{colors.border-subtle}"
    width: "240px"
  dashboard-card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border-subtle}"
    rounded: "{rounded.xl}"
    shadow: "{shadows.card}"
    padding: "20px"
  onboarding-shell:
    backgroundColor: "rgba(255, 255, 255, 0.9)"
    borderColor: "{colors.border-default}"
    rounded: "{rounded.onboarding-card}"
    shadow: "{shadows.lift}"
  recording-overlay:
    backgroundColor: "#131e08"
    textColor: "{colors.dark-text-1}"
    borderColor: "rgba(254, 191, 43, 0.13)"
    rounded: "{rounded.lg}"
    width: "300px"
    minHeight: "84px"
    shadow: "{shadows.overlay-lift}"
---

# SilkScribe Design System

SilkScribe is a local-first desktop speech-to-text app. Its design should feel native, private, calm, and efficient: one shortcut, one short burst of speech, one pasted result. The interface is not a generic SaaS dashboard and not a marketing canvas inside the product. It is a compact desktop utility with enough warmth to feel approachable and enough density to support repeated settings work.

This file follows the plain-text `DESIGN.md` convention introduced by Google Stitch and the extended practical section structure popularized by `awesome-design-md`. Treat it as the visual companion to `AGENTS.md`: coding instructions live there, product visual intent lives here.

## Visual Theme & Atmosphere

SilkScribe's product UI is warm native utility. The app uses an ivory canvas, white and cream panels, soft umber text, forest-green primary actions, berry accents, and gold highlights. The result should feel like a polished macOS preference pane crossed with a focused transcription instrument.

Core characteristics:

- Warm ivory canvas with subtle berry and gold atmospheric glow.
- Soft elevated panels with hairline borders and restrained shadows.
- Compact, information-dense settings rows that remain easy to scan.
- Forest-green primary action in light mode; gold primary action in dark mode.
- Berry accent for active navigation, progress, selection, and emphasis.
- Gold focus/highlight for affordances, onboarding glow, and recording energy.
- Speech-specific visual language: waveform bars, pulsing progress, small status chips, and dark recording overlay.
- Native desktop proportions: fixed sidebars, grouped rows, modest button heights, and predictable controls.

The product should never drift into flashy AI-product chrome. Avoid oversized hero sections, decorative card stacks, broad gradients, and promotional copy inside application surfaces.

## Color Palette & Roles

| Token                      |       Hex | Role                                                                   |
| -------------------------- | --------: | ---------------------------------------------------------------------- |
| `{colors.canvas}`          | `#fff8ef` | Main light app canvas and page floor.                                  |
| `{colors.surface}`         | `#ffffff` | Primary cards, setting groups, dropdowns, and elevated product panels. |
| `{colors.surface-alt}`     | `#f7efe4` | Sidebar, secondary panels, grouped row backgrounds, and quiet fills.   |
| `{colors.border-subtle}`   | `#efe4d6` | Default low-contrast dividers and card outlines.                       |
| `{colors.border-default}`  | `#e2d3c2` | Stronger panel borders and control outlines.                           |
| `{colors.border-strong}`   | `#c9b9a6` | Scrollbar thumbs, disabled fills, strong separators.                   |
| `{colors.text-primary}`    | `#1b1511` | Main text, headings, critical values.                                  |
| `{colors.text-secondary}`  | `#3a2e24` | Secondary copy and readable descriptions.                              |
| `{colors.text-tertiary}`   | `#6a594b` | Captions, helper text, inactive labels.                                |
| `{colors.brand-primary}`   | `#293a18` | Light-mode primary action, success, completed onboarding states.       |
| `{colors.brand-secondary}` | `#b1205f` | Active navigation, selected model, progress accents, emphasis.         |
| `{colors.brand-highlight}` | `#febf2b` | Focus ring, glow, warning, onboarding atmosphere.                      |
| `{colors.danger}`          | `#c11317` | Destructive action, errors, failed states.                             |
| `{colors.info}`            | `#9e5f0a` | Warm informational accents and overlay atmosphere.                     |

Dark mode inverts toward near-black ink surfaces: `{colors.dark-ink-0}` `#0f0c0a`, `{colors.dark-ink-1}` `#15110e`, `{colors.dark-ink-2}` `#1d1712`, and `{colors.dark-ink-3}` `#2a211a`. Text becomes warm parchment: `{colors.dark-text-1}` `#fff3e6`, `{colors.dark-text-2}` `#e7d9cb`, and `{colors.dark-text-3}` `#cbbba7`.

Usage rules:

- Use forest green as the primary action in light mode, never as a large decorative wash.
- Use berry for selected, active, and "currently happening" states.
- Use gold for focus, readiness glow, subtle ambient energy, and progress blends.
- Use red only for actual failure or destructive behavior.
- Do not invent blue or purple product accents. The marketing site has sibling colors, but product UI is governed by the tokens above.

## Typography Rules

SilkScribe uses the platform-native Apple stack first:

`'SF Pro Text', 'SF Pro Display', Inter, 'Segoe UI', sans-serif`

Technical values use:

`'SF Mono', 'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace`

| Token                     |   Size | Weight | Line Height |  Tracking | Use                                                   |
| ------------------------- | -----: | -----: | ----------: | --------: | ----------------------------------------------------- |
| `{typography.display-lg}` | `36px` |    600 |      `0.94` | `-0.03em` | Onboarding and major product headlines.               |
| `{typography.display-md}` | `32px` |    600 |       `1.1` | `-0.03em` | Dashboard page title and compact hero headings.       |
| `{typography.title-lg}`   | `20px` |    700 |      `1.25` |       `0` | Feature card titles and important panel headings.     |
| `{typography.title-md}`   | `15px` |    600 |      `1.35` |  `0.01em` | Setting titles, sidebar labels, card labels.          |
| `{typography.body-md}`    | `15px` |    500 |       `1.5` |       `0` | Default prose and descriptions.                       |
| `{typography.body-sm}`    | `14px` |    500 |       `1.5` |       `0` | Dense settings copy and secondary rows.               |
| `{typography.caption}`    | `12px` |    500 |      `1.45` |       `0` | Helper text, compact status labels.                   |
| `{typography.label-sm}`   | `11px` |    700 |       `1.4` |  `0.22em` | Uppercase section labels and eyebrows.                |
| `{typography.button}`     | `14px` |    600 |         `1` |  `0.01em` | Buttons and command controls.                         |
| `{typography.mono}`       | `12px` |    500 |      `1.45` |       `0` | Paths, keyboard bindings, logs, and technical values. |

Typography principles:

- Keep headings firm but not loud. Use weight 600 or 700, not black weights.
- Preserve compact labels for repeated settings surfaces.
- Use uppercase only for section labels, not button text.
- Do not scale type directly with viewport width. Use bounded responsive sizes or existing clamp patterns only when the surrounding component already uses them.
- Keep letter spacing at `0` unless matching existing labels, buttons, or headline tracking.

## Component Stylings

### App Shell and Sidebar

The app shell uses a fixed `240px` sidebar in `{colors.surface-alt}` with a right border in `{colors.border-subtle}`. The wordmark sits at the top, then grouped navigation sections. Active navigation uses berry-tinted background (`brand-secondary` at low opacity), a berry icon plate, and a subtle inset outline. Inactive navigation stays quiet until hover.

Do:

- Keep navigation rows `44px` minimum height with `12px` icon plates.
- Use lucide icons or existing SilkScribe brand marks.
- Keep section labels uppercase, `11px`, and widely tracked.

Do not:

- Turn the sidebar into a marketing nav.
- Add dense explanatory text inside nav rows.

### Home Dashboard

Dashboard panels use rounded surfaces, subtle warm gradients, and small readiness/status cards. The dashboard should answer: "Am I ready to dictate, and what happened recently?"

Use:

- `{components.dashboard-card}` for welcome, readiness, stats, and recent history modules.
- `20px` padding for dashboard cards.
- `18px` to `26px` radii for larger dashboard blocks.
- Gold and berry gradient accents sparingly in header cards and progress indicators.

### Settings Groups and Rows

Settings are the core repeated surface. They should be dense, aligned, and calm.

Use `{components.settings-group}` for grouped panels and `{components.setting-row}` for individual settings. A typical row has:

- Left side: title, optional inline description, or info tooltip trigger.
- Right side: compact control aligned center.
- Minimum row height `48px`.
- `14px` horizontal padding and `12px` vertical padding.
- Border dividers between grouped rows.

Long explanations should live in tooltips or compact helper copy. Do not create nested cards inside settings groups.

### Buttons

Button variants:

- Primary: forest green fill, ivory text, matching border, card shadow, hover lift.
- Primary soft: berry text on low-opacity berry fill.
- Secondary: cream fill, ink text, default border, hover to elevated white.
- Danger: red fill, white text, hover red-deep.
- Ghost: transparent, text-current, hover cream fill.

Rules:

- `sm`: `36px` minimum height, `12px` radius, `12px` horizontal padding.
- `md`: `40px` minimum height, `14px` radius, `16px` horizontal padding.
- `lg`: `44px` minimum height, `14px` radius, `20px` horizontal padding.
- Use `active:scale(0.985)` style press feedback.
- Use `focus-visible` rings with `{colors.action-focus}` at low opacity.

### Inputs, Textareas, Selects, and Dropdowns

Inputs use white elevated fills, default borders, `14px` radius, and `44px` minimum height. Placeholder text is tertiary. Focus uses berry border plus a gold-tinted ring.

Dropdown menus:

- Use `{colors.surface}` with `{shadows.lift}`.
- Radius `14px` to `18px`.
- Maximum height is constrained and scrollable.
- Selected options use berry text or low-opacity berry fill.

Path displays and technical fields use monospace captions and preserve selectable text.

### Toggles and Sliders

Toggles use a `52px` by `28px` pill track. Off state is elevated white/ink surface with a border. On state uses primary action fill, with the thumb switching to `{colors.on-primary}`. Preserve RTL-aware thumb movement.

Sliders use primary fill for completed progress and a quiet elevated track for the remainder. Keep labels compact and aligned.

### Badges, Tooltips, Alerts

Badges use pill or small-radius geometry, never oversized tags. Tooltips use `{colors.surface}`, `{colors.border-default}`, `{rounded.md}`, compact `12px` text, and `{shadows.lift}`.

Alerts:

- Info: warm sand or gold tint.
- Success: forest tint in light mode, gold tint in dark mode.
- Danger: red text and low-opacity red background.
- Keep alert copy short and directly actionable.

### Onboarding Scene

Onboarding is the most expressive product surface. It uses an atmospheric full-screen scene with ivory/cream gradients, subtle grid movement, berry/gold/green blurred orbs, and a large translucent white shell.

Use:

- Outer scene with warm radial gradients.
- Main shell radius `36px`, border `{colors.border-default}`, `backdrop-blur-xl`, and `{shadows.lift}`.
- Step cards with `18px` radius.
- Active step: berry-tinted panel.
- Complete step: green-tinted panel.
- Upcoming step: cream panel and tertiary text.
- Headlines with `display-lg`, tight line-height, and restrained weight.

Do not reuse onboarding atmosphere in every settings view. It is a first-run and repair-flow treatment.

### Model Selector and Download States

Model controls are compact and status-driven. Use pill buttons for current model status and dropdown lists for alternatives. Download/extracting states should show progress, size, speed, and ETA when available, but keep the visual footprint compact.

Use berry for active model selection and gold/berry gradients for progress bars. Error states use red with short recovery copy.

### History Feed

History is a work surface, not a gallery. Use grouped day panels with card shadows, bordered rows, compact timestamps, transcript previews, save/copy/delete actions, and audio controls when present.

Rules:

- Preserve scanability by grouping by day.
- Keep empty states centered, warm, and brief.
- Use icon buttons for repeated row actions.
- Do not use large decorative cards for individual transcripts.

### Recording Overlay and Waveform

The recording overlay is a dark, compact floating instrument:

- Width: `300px`.
- Minimum height: `84px`.
- Radius: `18px`.
- Background: deep green-black vertical gradient.
- Text: warm parchment.
- Border: subtle gold.
- Shadow: strong dark overlay lift.
- Entry: scale from `0.96` and translate `6px`, fade in over `280ms`.

Waveform surfaces use deep green-black panels with inset shadows and gold/berry/sand energy. The overlay should feel immediate and system-level, not like a dashboard card.

## Layout Principles

Base spacing scale:

`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40`

Product layout rules:

- Prefer grouped vertical stacks over loose cards.
- Use `16px` to `24px` page gutters inside app content.
- Use `12px` gaps for dense setting sections, `20px` to `24px` for dashboard panels.
- Use `44px` as a comfortable minimum interactive row height and `48px` when a row contains description or a toggle.
- Keep fixed-format controls stable with explicit min-height, width, or grid tracks.
- Avoid nesting cards inside cards. Settings groups may contain rows; rows should not contain framed mini-cards unless the control itself demands it.

Desktop app surfaces should optimize for repeated use. Marketing-style hero composition belongs to the website, not the app window.

## Depth & Elevation

SilkScribe uses soft warm elevation:

| Level          | Treatment                                 | Use                                              |
| -------------- | ----------------------------------------- | ------------------------------------------------ |
| Canvas         | `{colors.canvas}` with subtle radial glow | App page background and onboarding scene floor.  |
| Surface        | `{colors.surface}` with border            | Settings groups, dashboard cards, dropdowns.     |
| Surface Alt    | `{colors.surface-alt}`                    | Sidebar, grouped backgrounds, inactive panels.   |
| Card Shadow    | `{shadows.card}`                          | Default cards and row containers.                |
| Lift Shadow    | `{shadows.lift}`                          | Hovered cards, dropdown menus, onboarding shell. |
| Overlay Shadow | `{shadows.overlay-lift}`                  | Recording overlay only.                          |

Hover lift should be subtle: `translateY(-0.5px)` or `translateY(-1px)` for controls, with a shadow change. Avoid large floating cards and deep stacked shadows.

Dark mode uses the same hierarchy with darker ink surfaces and stronger black shadows.

## Do's and Don'ts

### Do

- Do keep SilkScribe native, quiet, offline-first, and utility-focused.
- Do use the existing CSS token names when implementing UI.
- Do use forest green for primary light-mode actions and gold for dark-mode primary actions.
- Do use berry for active states, selections, and progress emphasis.
- Do preserve compact settings rows and grouped panels.
- Do use gold focus rings and clear `focus-visible` states.
- Do preserve dark mode, reduced motion, and RTL-aware controls.
- Do use waveform/progress motion only where it communicates recording, transcribing, loading, or completion.
- Do use icons for repeated tools and row actions.

### Don't

- Don't redesign the product as a generic SaaS landing page.
- Don't introduce blue or purple product accents from the marketing site.
- Don't use berry or gold as full-page dominant color themes.
- Don't add decorative orbs, grids, or cinematic hero treatments to ordinary settings screens.
- Don't use oversized type inside compact panels.
- Don't place cards inside cards.
- Don't remove focus states or reduce touch targets below the established minimums.
- Don't use animation as decoration when no state is changing.

## Responsive Behavior

SilkScribe is a desktop Tauri app, but its web surfaces still need responsive discipline.

Breakpoints and behavior:

| Range          | Behavior                                                                               |
| -------------- | -------------------------------------------------------------------------------------- |
| `< 640px`      | Stack dense dashboard content, use one-column cards, preserve `44px` minimum controls. |
| `640px-1024px` | Use two-column readiness/stat areas where space allows.                                |
| `> 1024px`     | Full sidebar layout, dashboard panel grids, grouped settings with horizontal rows.     |

Rules:

- Keep text within containers at every width.
- Collapse grid cards before reducing touch target size.
- Preserve stable widths for controls such as toggles, model selectors, shortcut inputs, and icon buttons.
- Use truncation for sidebar labels and long model names.
- On RTL locales, use logical properties (`start`, `end`, `border-e`) and mirror toggle movement.
- For `prefers-reduced-motion: reduce`, disable nonessential animation and reduce transitions to near-instant.

## Agent Prompt Guide

When generating SilkScribe UI, use this shorthand:

> Build a warm native desktop utility UI for an offline-first speech-to-text app. Use ivory canvas `#fff8ef`, white/cream panels, ink text `#1b1511`, forest primary `#293a18`, berry accent `#b1205f`, gold focus/highlight `#febf2b`, soft warm borders, `12-22px` radii, and compact grouped settings rows. Keep it calm, dense, accessible, dark-mode aware, and speech-specific with subtle waveform/progress motion only for active states.

Preferred component defaults:

- Page background: `{colors.canvas}` with subtle gold and berry radial atmosphere only at top-level app/onboarding surfaces.
- Card: `{colors.surface}`, `{colors.border-subtle}`, `{rounded.lg}` or `{rounded.xl}`, `{shadows.card}`.
- Primary button: `{colors.action-primary}`, `{colors.on-primary}`, `{rounded.md}`, `40px` min height.
- Setting row: `48px` min height, title left, compact control right.
- Focus: gold ring at 30-45 percent opacity.
- Active/selected: berry-tinted background and berry text/icon.
- Recording overlay: dark green-black, parchment text, gold border, compact waveform.

If uncertain, choose the quieter option. SilkScribe should feel like a trustworthy tool that disappears into the user's writing flow.
