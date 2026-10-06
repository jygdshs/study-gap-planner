---
name: 학습 공백 분석
description: 학습 공백 분석 및 개인별 학습 계획 추천 시스템. A study plan set as a classroom timetable.
colors:
  shell: "#18233A"
  shell-raised: "#22304D"
  shell-line: "#34425F"
  shell-text: "#C9D2E3"
  ground: "#E9EDEB"
  sheet: "#FFFFFF"
  rule: "#D3D9D6"
  rule-strong: "#A9B3AF"
  ink: "#18233A"
  ink-soft: "#46536A"
  ink-muted: "#5F6B7E"
  today-tint: "#F1F3F7"
  interaction-blue: "#2459C8"
  gap-1: "#9E2A1C"
  gap-2: "#C2412C"
  gap-3: "#DD6E4E"
  gap-4: "#EDA58F"
  gap-5: "#F6D3C8"
  ok: "#127A55"
  warn: "#9A5B00"
  subject-1-blue: "#2459C8"
  subject-2-green: "#127A55"
  subject-3-amber: "#9A5B00"
  subject-4-violet: "#6B3FC0"
  subject-5-teal: "#0B7487"
  subject-6-magenta: "#B4295F"
  subject-7-olive: "#4E5E12"
  subject-8-indigo: "#3F4C8C"
typography:
  display:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "42px"
    fontWeight: 800
    lineHeight: 1.18
    letterSpacing: "-0.035em"
    fontFeature: "\"tnum\" 1"
  headline:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\" 1"
  numeral:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\" 1"
  title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  sheet-title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  cell-unit:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.375
  body:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.625
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
  caption:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.25
rounded:
  none: "0px"
  sm: "2px"
spacing:
  cell-inset: "4px"
  xs: "6px"
  sm: "12px"
  md: "16px"
  sheet: "20px"
  gutter: "24px"
components:
  button-primary:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.shell-raised}"
  button-primary-disabled:
    backgroundColor: "{colors.rule-strong}"
    textColor: "{colors.sheet}"
  button-quiet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-quiet-hover:
    backgroundColor: "{colors.ground}"
  field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  field-disabled:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink-muted}"
  sheet:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.none}"
  sheet-head:
    typography: "{typography.sheet-title}"
    padding: "12px 20px"
  nav-shell:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.shell-text}"
    height: "56px"
  plan-cell:
    typography: "{typography.cell-unit}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.none}"
    padding: "8px"
    height: "96px"
  plan-cell-compact:
    rounded: "{rounded.none}"
    padding: "8px"
    height: "56px"
  subject-chip:
    rounded: "{rounded.none}"
    size: "12px"
  score-bar:
    backgroundColor: "{colors.ground}"
    rounded: "{rounded.none}"
    height: "8px"
---

# Design System: 학습 공백 분석

## Overview

**Creative North Star: "The Classroom Timetable" (교실 시간표)**

The whole app is a timetable pinned to a classroom board. A deep navy header band (the colour of a printed timetable's top strip) runs across every screen; below it, white printed sheets sit on a cool grey-green board, separated by 1px ruled lines rather than shadows. The plan itself is a 7-day by 2-period grid, and every planned study block is a solid slab of its subject's colour, so a subject is recognised by colour before its name is read, on every screen.

The system is dense, flat and numeric. It reads as an objective analysis instrument: tabular figures everywhere, near-square corners, and one fixed 0–100 score ramp in which deeper vermilion means a larger study gap. Interest comes from the timetable's own materials: the navy frame around today's column, hatched rest days, dashed outlines on unsaved suggestions, struck-through and stamped completed blocks, and capacity bars at the foot of each day. It does not come from decoration. Generic white-card-with-shadow dashboards and pastel gamification were explicitly rejected.

Motion is one short beat, and only for what changed: a block that a plan refresh replaced fills in left to right, and a newly completed block gets its check stamp. Nothing animates on first paint, and nothing animates under reduced motion.

**Key Characteristics:**
- Navy shell band, grey-green ground, white sheets, 1px rules; no elevation.
- Eight fixed subject colours assigned by subject creation order and identical across every screen.
- One five-band score ramp (vermilion, deepest = lowest score) for every score in the app.
- Near-square geometry: 0px on sheets, cells and chips; 2px only on interactive controls.
- Pretendard throughout, tabular numerals globally, extra-bold figures for the key numbers.
- Completion is shown as a light tint plus strike-through plus a stamped square check, never by colour alone.

## Colors

A navy-and-paper neutral frame that stays quiet so that two coloured systems can do all the talking: subject identity and score gap.

### Primary
- **Timetable Navy** (shell / ink): the header band, primary buttons, today's column frame and header cell, and all primary text. Navy is both the chrome and the ink, so it reads as one printed object.
- **Navy Raised** (shell-raised): primary button hover only.
- **Navy Rule** (shell-line): the hairline under the brand row inside the shell on mobile.
- **Header Chalk** (shell-text): inactive nav labels and the "오늘" date under today's header.

### Secondary
- **Score Gap Ramp** (gap-1 to gap-5): the single 0–100 score ramp in 20-point bands: gap-1 for 0–19 through gap-5 for 80–100. Used by score bars, the ramp legend, score tables and chart points. gap-2 also marks urgency (exam D-day) and errors; gap-1 is error text.

### Tertiary
- **Subject Codes** (subject-1-blue … subject-8-indigo): eight deep solids that each pass 4.5:1 under white text. Assigned by subject creation order (created_at, then id), cycling after eight. They fill plan blocks, subject chips, capacity bars, the picker's selected state and completed adherence slots.
- **Interaction Blue** (interaction-blue): text links ("크게 보기", "점수 근거 보기", "결과 입력"), the 2px focus outline and the text caret. Never a fill.

### Neutral
- **Board** (ground): page background, empty score-bar track, skeleton blocks, quiet-button hover, disabled fields.
- **Paper** (sheet): every sheet surface and grid cell.
- **Rule** (rule): sheet borders, internal dividers, and the 1px gutters of every grid (drawn as a rule-coloured background behind 1px gaps).
- **Strong Rule** (rule-strong): field and quiet-button borders, dashed "new" outlines, disabled primary fill, scrollbar thumb.
- **Soft Ink** (ink-soft) and **Muted Ink** (ink-muted): secondary copy and captions, hints, dates and period labels.
- **Today Tint** (today-tint): background of today's row or column in the mobile timetable, home mini timetable, and the selected row on the scores table.
- **Status** (ok / warn): success and warning notice text and borders, and the "plan outdated" line in warn.

### Named Rules
**The Subject Owns Its Colour Rule.** A subject gets one colour, decided by creation order, and that colour means that subject on every screen. Subject colours never encode score, status or emphasis.

**The One Ramp Rule.** Every score is drawn through the same five-band gap ramp. Text on a ramp swatch is white only on gap-1 and gap-2 (scores under 40); on all others it is navy. Vermilion is reserved for the ramp, which is why no subject colour is vermilion.

## Typography

**Display Font:** Pretendard Variable (with Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif)
**Body Font:** the same family
**Label/Mono Font:** none distinct; figures use Pretendard's tabular numerals

**Character:** A single neutral Korean grotesque carries everything. Hierarchy comes from weight (400 / 600 / 700 / 800) and tight negative tracking on large sizes, not from a second face. It is bundled from the npm package rather than a CDN, so the face cannot swap during a projector demo.

### Hierarchy
- **Display** (800, 32px mobile / 42px ≥640px, 1.18, -0.035em, balanced wrap): the one-line promise on the empty home state only.
- **Headline** (800, 28px mobile / 34px ≥640px, 1.25, -0.03em): page titles and the home date line.
- **Numeral** (800, 40px, 1, -0.03em): the adherence rate. Smaller figures in the same voice: priority rank 22px/800, subject score 18px/800, day label 19px/800 in the grid header.
- **Title** (700, 17px, -0.025em): the main sheet on a screen ("7일 시간표", "오늘 공부할 단원").
- **Sheet title** (700, 15px, -0.025em): every other sheet head.
- **Cell unit** (700, 14px compact / 16px ≥1024px, 1.375): the unit name inside a plan block; the subject name above it is 12–13px/600 at 85% white.
- **Body** (400, 15px, 1.625, max 60ch): page descriptions and explanatory copy.
- **Label** (600, 13px): field labels, period labels, sheet-head status lines, inline links.
- **Caption** (400, 12px): hints, dates, capacity readouts, footer. 12px is the floor.

### Named Rules
**The Tabular Figures Rule.** `font-feature-settings: "tnum" 1` is set on body, so every score, hour and date column aligns. Do not turn it off locally.

**The Keep-All Rule.** Korean text uses `word-break: keep-all`. The only exception is the home mini-timetable unit name, which clamps to two lines with `break-all` and ellipsis and carries the full text in `title` and `aria-label`.

## Layout

Content sits in a centred frame (max 1280px; narrow forms at 768px) with 16px side padding, rising to 24px at ≥640px. Page header: 32px top (40px ≥640px), 24px below. Sheets stack with a 24px gutter.

- **Plan screen (≥1024px):** a 320px left rail (priority ranking, then adherence) beside a fluid right column (timetable, then past plans).
- **Home (≥1024px):** 5:7 split; today's two blocks on the left, the mini week timetable and top-3 priorities on the right.
- **Timetable grid (≥768px):** a 52px period-label column plus seven equal day columns. Rows are header, 1교시, 2교시 and 시간 (capacity). Cells sit in 4px insets on paper, with 1px rule gutters between them. A rest day spans both periods.
- **Timetable (<768px):** the grid folds into a list of day rows (52px day stub + two compact blocks side by side + capacity bar). It never scrolls horizontally.
- **Sheet internals:** heads use 12px × 20px padding, bodies 20px, list rows 10–16px vertical with rule dividers.
- **Breakpoints in use:** 640px (sm), 768px (md), 1024px (lg).

## Elevation & Depth

Flat. There are no drop shadows anywhere. Depth is a two-step tonal stack: ground board, then white sheet with a 1px rule border. Navy is the only "high" layer, and it is sticky at the top. The one box-shadow form in use is an inset stroke (`inset 0 0 0 1px` / `2px` in subject colour), which draws an outline on an adherence slot or a mini-timetable suggestion without changing its box. It is a border, not lift.

### Named Rules
**The Ruled Sheet Rule.** Separation is drawn with 1px rules, never with shadow or blur. If two regions need separating, add a rule or a gap of ground.

**The Navy Today Rule.** Today is marked by a 3px navy frame running from header to capacity row (an outline on mobile and in the mini timetable), a navy header cell with "오늘" in Header Chalk, and Today Tint behind the day on compact views.

## Shapes

Near-square. Sheets, plan cells, subject chips, score bars, notices and the subject picker buttons have square corners (0px). Only the text controls, the field and the two button styles, get a barely-there 2px radius. The line vocabulary is solid 1px rules for structure, 2px solid subject-colour borders for picker options and stamps, dashed borders for anything not yet committed (unsaved suggestions, "새 과목", the new-subject form), and 135° stripes (ground/paper, 6px bands; 5px in the mini timetable) for rest days. Icons are drawn on a 24px grid with 2px strokes, square caps and mitred joins.

## Components

### Buttons
Firm and printed: solid navy or white with a strong rule, nothing in between.
- **Shape:** 2px radius; 10px × 16px padding; 14px/600 label; 8px gap to an optional 16px icon.
- **Primary:** navy fill, white text; hover Navy Raised; disabled Strong Rule fill with white text and a not-allowed cursor.
- **Quiet:** paper fill, Strong Rule border, navy text; hover border goes navy and fill goes ground. A saved, up-to-date plan swaps its primary button for the quiet one with a check icon ("최신 계획 저장됨").
- **Focus:** 2px Interaction Blue outline, 2px offset (global).

### Chips
- **Subject chip:** a 12px solid square of the subject colour before every subject name. Decorative (`aria-hidden`); the name carries meaning.
- **Subject picker option:** at least 44px tall, 2px subject-colour border, square. Unselected shows subject-colour text on paper; selected is a full fill with white text. The "새 과목" option is 2px dashed Strong Rule.

### Cards / Containers
- **Corner Style:** square (0px).
- **Background:** paper on ground.
- **Shadow Strategy:** none (see The Ruled Sheet Rule).
- **Border:** 1px rule; the head is separated by a 1px rule bottom border, with title left and a muted status or link right.
- **Internal Padding:** 20px.

### Inputs / Fields
- **Style:** full width, paper, 1px Strong Rule border, 2px radius, 10px × 12px padding, 15px text, placeholder Muted Ink at 70%.
- **Hover / Focus:** border to Muted Ink on hover; on focus the border goes navy plus a 2px Interaction Blue ring at 25%. The caret is Interaction Blue.
- **Disabled:** ground fill, Muted Ink text.
- **Notices:** square, 1px border, 12px × 16px padding, 14px/1.625 text. Error uses gap-2 border at 40%, gap-5 fill at 40% and gap-1 text with an alert icon. Warn and ok use their status hue at 30% border on a pale tint.

### Navigation
A sticky navy band, 56px on ≥640px. The brand (four-square timetable mark + "학습 공백 분석", 15px/700) sits left, and the four tabs (14px/600) sit right. Inactive tabs are Header Chalk and turn white on hover; the active tab is white with a 3px white bar along the bottom edge that scales in over 200ms. On mobile the brand row stacks above a horizontally scrollable tab row separated by a Navy Rule hairline.

### Plan Cell (signature)
One timetable square, and the unit of the whole system.
- **Saved:** solid subject-colour fill; the subject name (12–13px/600, white 85%) sits above the unit (14–16px/700, white). Checkable cells (today and earlier) are whole-cell labels with a hidden checkbox and an 18px white-bordered empty box bottom-right that lightens on hover.
- **Completed:** fill drops to a 14% subject-colour tint and text turns subject colour. The unit gets a 2px line-through, and a 24px square stamp with a 2px subject-colour border and check sits top-right, rotated -6°.
- **Suggested (unsaved):** paper with a 1px dashed subject-colour border and subject-colour text.
- **Rest:** stripes with a paper "쉬는 날" tag.
- **Size:** at least 84px tall (96px ≥1024px); compact cells are at least 56px.
- **Motion:** `cell-fill` (clip-path wipe left to right, 420ms) only on cells created by a refresh after first paint. `stamp-in` (scale 1.6 → 1 and rotate -12° → -6°, 260ms) only on a newly completed cell. Both use `cubic-bezier(0.16, 1, 0.3, 1)`, and both are off under `prefers-reduced-motion`.

### Score Bar and Capacity Bar
- **Score bar:** an 8px track (12px thick variant) in ground, filled to score% with that score's ramp band, with 1px paper ticks at 25/50/75. Width transitions over 500ms ease-out.
- **Capacity bar:** an 8px ground track at the foot of each day. Its width is proportional to that day's available hours, and it is split equally among the subject colours of that day's blocks. Under it sit hours (700, Soft Ink) and per-block time ("칸당 …").

### Priority Ranking
A fixed-column list: a 28px rank numeral, subject chip + name (16px/700) + optional exam "D-n" in gap-2, then a right-aligned score (18px/800), with a full-width score bar beneath. Unit rows are indented 60px: name, 64px bar, 40px score. Lowest score is first.

## Do's and Don'ts

### Do:
- **Do** put every surface on a paper sheet with a 1px rule border over the ground board, and separate regions with rules or ground gaps.
- **Do** resolve subject colour through the creation-order map so the same subject is the same colour on input, plan, home and scores.
- **Do** draw every score with the five-band gap ramp, white text only on the two deepest bands (score < 40).
- **Do** mark today with the 3px navy frame, navy header cell and "오늘", and mark completion with tint + strike-through + rotated check stamp together.
- **Do** use dashed borders for anything not yet saved or created, and stripes for rest days.
- **Do** keep text at 12px or larger, figures tabular, and key numbers extra-bold (800).
- **Do** animate only cells that changed after first paint, with the 420ms fill or 260ms stamp, and disable both under reduced motion.
- **Do** fold the timetable into day rows below 768px instead of scrolling it sideways.

### Don't:
- **Don't** add drop shadows, blur or lifted cards; the only box-shadow allowed is an inset subject-colour stroke used as a border.
- **Don't** round sheets, cells, chips or bars; the 2px radius belongs to fields and buttons only.
- **Don't** use a subject colour to mean score, status or emphasis, and don't introduce a vermilion subject colour.
- **Don't** use Interaction Blue as a fill; it is for text links, focus outlines and the caret.
- **Don't** build pastel, badge or confetti gamification, or generic white-card dashboards.
- **Don't** signal completion by colour change alone.
- **Don't** add a second typeface or turn off tabular numerals.
