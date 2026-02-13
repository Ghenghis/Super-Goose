# TimeWarp Bar: Complete UI/UX Specification

**Document Type:** Extreme-Detail UI/UX Engineering Specification  
**Component:** TimeWarp Bar — the always-visible timeline control embedded in Super-Goose desktop  
**Design Lineage:** Fusion 360 parametric timeline × video editor multi-track × GitKraken commit graph × DAW transport controls  
**Target Frameworks:** React + Tauri (or Electron) + HTML Canvas (for high-performance rendering)

---

## Table of Contents

1. [Layout Architecture](#1-layout-architecture)
2. [Zone Map — Every Pixel Region](#2-zone-map--every-pixel-region)
3. [Track System — Multi-Lane Branch Rails](#3-track-system--multi-lane-branch-rails)
4. [Event Nodes — Visual Language](#4-event-nodes--visual-language)
5. [Playhead & Scrubber](#5-playhead--scrubber)
6. [Time Ruler](#6-time-ruler)
7. [Branch Visualization](#7-branch-visualization)
8. [Event Inspector Panel](#8-event-inspector-panel)
9. [Minimap / Overview Strip](#9-minimap--overview-strip)
10. [Transport Controls](#10-transport-controls)
11. [Context Menus — Every Right-Click](#11-context-menus--every-right-click)
12. [Keyboard Shortcuts — Complete Map](#12-keyboard-shortcuts--complete-map)
13. [Search & Filter System](#13-search--filter-system)
14. [Zoom System](#14-zoom-system)
15. [Drag & Drop Interactions](#15-drag--drop-interactions)
16. [Tooltips — Every Hover](#16-tooltips--every-hover)
17. [Status Indicators & Badges](#17-status-indicators--badges)
18. [Animations & Transitions](#18-animations--transitions)
19. [Responsive Sizing](#19-responsive-sizing)
20. [Accessibility](#20-accessibility)
21. [Color System & Theming](#21-color-system--theming)
22. [Performance Requirements](#22-performance-requirements)
23. [Integration Points with Super-Goose](#23-integration-points-with-super-goose)
24. [Edge Cases & Empty States](#24-edge-cases--empty-states)
25. [Complete Wireframes](#25-complete-wireframes)

---

## 1. Layout Architecture

The TimeWarp Bar is a **persistent, docked panel** that lives between the main content area (chat/editor) and the bottom of the Super-Goose desktop window. It is **always visible** during active agent sessions, collapsible to a minimal strip when not in focus.

### Window Layout (Top to Bottom)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Title Bar / Window Controls                                    ─ □ ✕│
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│              MAIN CONTENT AREA                                      │
│              (Chat / Code Editor / Agent Output)                    │
│              Height: flexible (takes remaining space)               │
│                                                                     │
├───────────────────────── DRAG HANDLE ───────────────────────────────┤
│ EVENT INSPECTOR PANEL (collapsible, 120-300px)                      │
│ Shows details of selected event — diffs, metadata, actions          │
├─────────────────────────────────────────────────────────────────────┤
│ TIMEWARP BAR (always visible, 80-200px)                             │
│ ┌─────┬──────────────────────────────────────────────┬────────────┐ │
│ │CTRL │  TIMELINE TRACKS + EVENTS + BRANCHES         │ MINIMAP   │ │
│ │PANEL│  (scrollable horizontally)                    │ (fixed)   │ │
│ └─────┴──────────────────────────────────────────────┴────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ STATUS BAR: Branch: main │ Event 47/312 │ Session 3h 22m │ ◉  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Sizing Rules

| Component | Min Height | Default Height | Max Height | Resizable |
|---|---|---|---|---|
| TimeWarp Bar (total) | 80px | 140px | 200px | Yes (drag handle on top edge) |
| Event Inspector | 0px (collapsed) | 120px | 300px | Yes (drag handle) |
| Control Panel (left) | — | 48px wide | 64px wide | No |
| Minimap (right) | — | 120px wide | 200px wide | Yes (drag left edge) |
| Status Bar (bottom) | 24px | 24px | 24px | No |
| Track height | 20px | 28px | 40px | Yes (per-track) |

### Collapse States

| State | Trigger | What Shows |
|---|---|---|
| **Full** | Default during agent session | All tracks + inspector + controls |
| **Compact** | Click collapse arrow, or `Ctrl+Shift+T` | Single-track summary + playhead + transport controls only |
| **Minimal** | Double-click collapse, or `Ctrl+Shift+T` twice | Thin 24px strip: event counter + branch name + recording indicator |
| **Hidden** | `Ctrl+Shift+H` or Settings toggle | Completely hidden, accessible via menu |

---

## 2. Zone Map — Every Pixel Region

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TIMEWARP BAR                                                             │
│                                                                          │
│  ┌──────┐ ┌────────────────────────────────────────────────┐ ┌────────┐  │
│  │ ZONE │ │                    ZONE B                       │ │ ZONE C │  │
│  │  A   │ │             TIMELINE VIEWPORT                   │ │MINIMAP │  │
│  │      │ │                                                 │ │        │  │
│  │TRANS-│ │  ┌─ ZONE B1: TIME RULER ─────────────────────┐  │ │Overview│  │
│  │PORT  │ │  │ |10:01|  |10:02|  |10:03|  |10:04|        │  │ │of full │  │
│  │CTRLS │ │  └───────────────────────────────────────────┘  │ │timeline│  │
│  │      │ │  ┌─ ZONE B2: BRANCH TRACKS ─────────────────┐  │ │        │  │
│  │⏮ ◀  │ │  │ main:  ●──●──●──●──●──▼──●──●──●──●──●   │  │ │ ████   │  │
│  │▶ ▶⏭ │ │  │ auth:       ╲──●──●──●                    │  │ │ ██     │  │
│  │      │ │  │ cache:                  ╲──●──●            │  │ │  █     │  │
│  │Branch│ │  └───────────────────────────────────────────┘  │ │        │  │
│  │ ≡    │ │  ┌─ ZONE B3: DETAIL LANE ───────────────────┐  │ │Viewport│  │
│  │Filter│ │  │ [file thumbnails / waveform-style bars]   │  │ │bracket │  │
│  │ 🔍   │ │  └───────────────────────────────────────────┘  │ │[  ]    │  │
│  └──────┘ └────────────────────────────────────────────────┘ └────────┘  │
│                                                                          │
│  ┌─ ZONE D: STATUS BAR ─────────────────────────────────────────────┐    │
│  │ 🌿 main │ E47/312 │ 📊 3 branches │ ⏱ 3h22m │ 💾 12MB │ ◉ REC │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Zone A: Transport Controls (Left Panel)

**Width:** 48–64px (fixed)  
**Background:** Slightly darker than timeline background  
**Contents (top to bottom):**

| Control | Icon | Action | Tooltip |
|---|---|---|---|
| Jump to Start | `⏮` | Jump to E1 (first event) | "Jump to first event (Home)" |
| Step Back | `◀` | Move playhead to previous event | "Previous event (←)" |
| Play/Pause | `▶` / `⏸` | Auto-advance through events (replay mode) | "Play timeline (Space)" |
| Step Forward | `▶\|` | Move playhead to next event | "Next event (→)" |
| Jump to End | `⏭` | Jump to HEAD (latest event) | "Jump to latest event (End)" |
| **Divider** | — | — | — |
| Branch Selector | `🌿 ≡` | Dropdown: switch active branch | "Switch branch (B)" |
| Search | `🔍` | Open search/filter bar | "Search events (Ctrl+F)" |
| Filter | `⚙` | Open filter popover | "Filter events (F)" |
| Zoom Fit | `⊞` | Fit all events in viewport | "Fit all (Ctrl+0)" |

### Zone B: Timeline Viewport (Center — scrollable)

This is the main interactive area. It scrolls horizontally and contains three sub-zones stacked vertically.

### Zone B1: Time Ruler

**Height:** 20px (fixed)  
**Content:** Time markers showing when events occurred.

```
|09:45    |09:50    |09:55    |10:00    |10:05    |10:10    |10:15
  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·
```

**Behavior:**
- Major ticks every 5 minutes at session zoom, every 1 hour at day zoom, every 1 event at event zoom
- Minor ticks subdivide based on zoom level
- Shows wall-clock time (when events actually occurred)
- Session boundaries marked with vertical dashed lines and session label
- Click on ruler → jump playhead to that time
- Drag on ruler → scrub playhead continuously
- Right-click on ruler → "Set range start" / "Set range end" for export/replay
- Current day/date appears at session boundaries

### Zone B2: Branch Tracks (Multi-Lane Rail System)

**Height per track:** 28px (default), 20–40px (user-adjustable)  
**This is the core of the timeline — GitKraken-style branch rails with Fusion 360-style event nodes.**

```
Track Layout (conceptual):
┌──────────────────────────────────────────────────────────────────┐
│ main:  ●──●──●──●──◆──●──●──▼──●──●──●──●──⬟──●──●──●──●──●   │
│              ╲                                                    │
│ auth:         ●──●──◆──●──●──●                                   │
│                        ╲                                         │
│ cache:                  ●──●──●──●                               │
│                                                                  │
│ replay:  ○··○··○··○··○  (ghost track — replayed events)          │
└──────────────────────────────────────────────────────────────────┘
```

**Track elements:**

| Element | Visual | Meaning |
|---|---|---|
| Track rail | Colored horizontal line | Branch continuity |
| Event node | Circle/shape on the rail | Single recorded event |
| Fork connector | Diagonal line descending from parent to child track | Branch creation point |
| Merge connector | Diagonal line ascending from child to parent track | Merge point |
| Playhead | Bright vertical line spanning all tracks | Current position |
| Selection highlight | Brighter background behind selected event | Active selection |
| Range selection | Semi-transparent overlay | Selected range for replay/export |
| Ghost track | Dotted rail with hollow nodes | Replay/simulation branch |

**Track behaviors:**
- Tracks auto-appear when a new branch is created
- Tracks auto-hide when all their events are off-screen (or user can pin them)
- Track order: main always on top, then by creation time (newest at bottom)
- Drag track label to reorder
- Right-click track label → rename, hide, delete, set color, compare with...
- Each track has a 10px left margin showing a colored indicator dot matching the branch color
- Collapse arrow on track label: collapse to show only fork/merge points

### Zone B3: Detail Lane (Activity Heatmap / File Change Visualization)

**Height:** 24px (fixed, collapsible to 0)  
**This lane shows a "waveform" or heatmap of change intensity below the tracks.**

```
Detail Lane:
┌──────────────────────────────────────────────────────────────────┐
│ ▁▂▃▅▇█▇▅▃▁▁▁▂▃▅▇▇▅▃▁▁▁▁▁▂▅▇█████▇▅▃▂▁▁▁▁▁▂▃▅▇▅▃▂▁▁▁▁▁▁▁▁▁ │
└──────────────────────────────────────────────────────────────────┘
```

**What it represents:**
- Bar height = number of files changed by the event at that position
- Bar color = event type (blue=file ops, green=commands, purple=LLM calls, orange=git)
- Useful for spotting "hot zones" of heavy agent activity
- Click on a peak → select the event with the most file changes
- Hover → tooltip showing "E47: 12 files changed, 340 lines"

### Zone C: Minimap (Right Panel)

**Width:** 120–200px (resizable)  
**Content:** Compressed overview of the entire timeline.

```
Minimap:
┌────────────┐
│ ████████   │  ← full session compressed
│ ███████    │
│   ████     │
│  ███       │
│            │
│   [═══]    │  ← viewport bracket (draggable)
│            │
│ ████       │
│ ██████     │
└────────────┘
```

**Behaviors:**
- Shows full timeline compressed to fit the panel width
- Track rails shown as thin colored lines
- Event density shown as opacity/brightness
- **Viewport bracket** (rectangle outline) shows what part of the timeline is currently visible in Zone B
- Drag the bracket → scroll the main timeline
- Click outside bracket → center viewport on that position
- Branch labels shown as tiny colored dots
- Fork/merge points shown as line intersections

### Zone D: Status Bar (Bottom Strip)

**Height:** 24px (fixed)  
**Content:** Contextual status information.

```
🌿 main │ E47/312 │ 📊 3 branches │ 💾 12.4 MB │ ⏱ 3h 22m │ 🔒 Verified │ ◉ REC
```

| Segment | Content | Click Action | Tooltip |
|---|---|---|---|
| Branch indicator | `🌿 main` | Open branch switcher | "Current branch: main (click to switch)" |
| Event position | `E47/312` | Open jump-to-event dialog | "Event 47 of 312 (click to jump)" |
| Branch count | `📊 3 branches` | Open branch list | "3 active branches (click to manage)" |
| Storage | `💾 12.4 MB` | Open storage details | "Event store: 12.4 MB (312 events, 847 blobs)" |
| Session duration | `⏱ 3h 22m` | Open session info | "Session started: 10:01 AM" |
| Integrity | `🔒 Verified` / `⚠️ Broken` | Run verification | "Hash chain integrity: all 312 events verified" |
| Recording | `◉ REC` (pulsing red) | Pause/resume recording | "Recording active (click to pause)" |

---

## 3. Track System — Multi-Lane Branch Rails

### Track Anatomy

```
 Track Label          Rail with Events                                    Track Controls
┌──────────┐ ┌──────────────────────────────────────────────────────┐ ┌──────────┐
│ 🟢 main  │ │ ●──●──◆──●──●──●──▼──●──●──●──●──⬟──●──●──●──●──● │ │ 👁 ⚙ ✕  │
│    ▾      │ │                                                      │ │          │
└──────────┘ └──────────────────────────────────────────────────────┘ └──────────┘
```

**Track Label (left, 80px):**
- Color dot matching branch color
- Branch name (truncated with ellipsis if > 10 chars)
- Collapse arrow (`▾` / `▸`) to collapse track
- Click label → select all events on this branch
- Double-click label → rename branch
- Drag label → reorder track position

**Rail (center, scrollable):**
- Continuous colored line connecting events
- Line thickness: 2px default, 3px for active branch
- Events rendered as nodes on the rail (see Section 4)
- Fork/merge connectors as Bézier curves between tracks

**Track Controls (right, 48px):**
- `👁` Eye icon → toggle track visibility
- `⚙` Gear → track settings (color, height, pin)
- `✕` Close → hide track (doesn't delete branch)

### Track Types

| Track Type | Visual Style | When Used |
|---|---|---|
| **Active branch** | Solid rail, 3px, full brightness, white event nodes | Currently checked-out branch |
| **Inactive branch** | Solid rail, 2px, 60% opacity | Other branches |
| **Replay track** | Dotted rail, hollow event nodes | During replay operation |
| **Ghost track** | Faded rail, 30% opacity, dashed | "What-if" forward projection |
| **Conflict track** | Rail with red warning segments | Branch with detected conflicts |
| **Archived track** | Gray rail, 1px, very faded | Completed/merged branches |

### Fork/Merge Connectors

```
Fork:                          Merge:
  main: ●──●──●──●──●            main: ●──●──●──●──●
              ╲                                ╱
  auth:        ●──●──●            auth: ●──●──●

Connector style:
  - Bézier curve, same color as child branch
  - Fork: 45° departure angle from parent
  - Merge: 45° arrival angle into parent
  - Animated pulse on hover to highlight the relationship
  - Fork point: small diamond ◇ on parent rail
  - Merge point: small diamond ◆ on parent rail (filled)
```

### Conflict Indicators on Tracks

```
main:  ●──●──●──●──●──⚠──●──●    ← ⚠ = merge conflict point
                        │
auth:  ●──●──●──●──●──⚠──●      ← both tracks show warning

When hovering ⚠:
  - Red dashed lines connect the conflicting event pair
  - Tooltip: "Structural conflict: src/auth.rs modified in both branches"
  - Click → open conflict resolution panel in inspector
```

---

## 4. Event Nodes — Visual Language

Every event on the timeline is rendered as a **node** on the branch rail. The shape, color, size, and decoration of each node encodes information about the event type, status, and importance.

### Node Shape by Event Type

| Event Type | Shape | Size | Color | Example |
|---|---|---|---|---|
| `file_write` | Circle `●` | 8px | Blue `#4A9EFF` | Agent wrote/modified a file |
| `file_read` | Small circle `·` | 4px | Light blue `#8EC5FF` | Agent read a file (low prominence) |
| `file_delete` | Circle with X `⊗` | 8px | Red `#FF4A4A` | Agent deleted a file |
| `cmd_exec` | Square `■` | 8px | Green `#4AFF8E` | Shell command executed |
| `cmd_exec` (failed) | Square with X `☒` | 8px | Red `#FF4A4A` | Shell command failed |
| `llm_call` | Diamond `◆` | 10px | Purple `#B44AFF` | LLM completion request |
| `git_op` | Hexagon `⬡` | 10px | Orange `#FFB44A` | Git commit/push/pull |
| `mcp_tool_call` | Pentagon `⬠` | 8px | Teal `#4AFFDA` | Other MCP tool usage |
| `branch_fork` | Fork icon `⑂` | 12px | White `#FFFFFF` | Branch created |
| `branch_merge` | Merge icon `⑃` | 12px | White `#FFFFFF` | Branch merged |
| `milestone` | Star `★` | 14px | Gold `#FFD700` | User-marked milestone |
| `snapshot_full` | Double circle `◎` | 10px | Cyan `#00FFFF` | Full workspace snapshot |
| `coach_review` | Shield `🛡` | 10px | Yellow `#FFE44A` | Coach/Player review event |
| `role_transition` | Arrow circle `↻` | 10px | Pink `#FF4AB4` | ALMAS role handoff |
| `error` | Triangle `▲` | 10px | Red `#FF0000` | Error/exception occurred |

### Node Size Modifiers

| Modifier | Effect | When |
|---|---|---|
| **High file count** | Node scales up to 1.5x | > 5 files changed |
| **Critical event** | Node scales up to 2x + glow | Error, conflict, or milestone |
| **Low significance** | Node shrinks to 0.5x | Read-only, single small file |
| **Selected** | Bright ring around node + scale to 1.3x | Currently selected |
| **Hovered** | Subtle scale to 1.1x + brightness boost | Mouse hovering |
| **Replayed** | Hollow center (ring only) | Event from replay track |

### Node Decorators (Badges)

Small indicators attached to the upper-right of a node:

| Badge | Icon | Meaning |
|---|---|---|
| Files changed count | Tiny number `³` | 3 files changed by this event |
| Duration | Tiny clock | Event took > 30 seconds |
| Reproducibility | Green/yellow/red dot | Replay score: green ≥ 0.9, yellow ≥ 0.7, red < 0.7 |
| Annotation | Tiny speech bubble | User added a note to this event |
| Bookmark | Tiny flag | User bookmarked this event |
| LLM tokens | Tiny `T` | Token count for LLM events |

### Node Interaction States

| State | Visual | Trigger |
|---|---|---|
| **Default** | Normal shape, branch color | — |
| **Hover** | 1.1x scale, brighten 20%, shadow glow | Mouse enter |
| **Selected** | 1.3x scale, bright ring, pulse animation | Click |
| **Multi-selected** | Ring + blue background span | Shift+Click range or Ctrl+Click individual |
| **Playhead** | Vertical bright line through node | Current position |
| **Playing** | Node pulses rhythmically | During auto-play/replay |
| **Conflict** | Red pulsing ring | Part of a merge conflict |
| **Dragging** | Semi-transparent, follows cursor | Drag to reorder (if allowed) |
| **Drop target** | Bright dashed outline | Valid drop zone for operations |

---

## 5. Playhead & Scrubber

### Playhead Visual

```
         ▼  ← Playhead handle (draggable triangle, 12px wide)
         │
         │  ← Playhead line (2px, bright white/accent color)
         │     Spans from time ruler through all tracks to detail lane
         │
         │
         ▲  ← Bottom anchor (optional, for visual symmetry)
```

**Playhead properties:**
- Color: White with colored glow matching active branch
- Width: 2px line + 4px glow on each side
- Handle: Inverted triangle at top (in time ruler zone), 12px wide, 8px tall
- Handle is the primary drag target
- Snaps to event positions when within 8px proximity
- Shows timestamp tooltip while dragging: "10:03:47 — E47"

### Scrubbing Behavior

| Input | Behavior |
|---|---|
| Click on time ruler | Jump playhead to that position, select nearest event |
| Drag playhead handle | Smooth scrub, snap to events, update inspector |
| Drag on empty rail area | Scroll viewport horizontally |
| Scroll wheel (no modifier) | Scroll viewport horizontally |
| Scroll wheel + Ctrl | Zoom in/out centered on cursor |
| Click on event node | Jump playhead to that event, select it |
| Arrow keys ← → | Step to previous/next event |
| Shift + Arrow keys | Select range (extend selection) |
| Home / End | Jump to first / last event |
| Ctrl + Left/Right | Jump to previous/next branch fork or merge point |

### Auto-Play Mode (Replay Visualization)

When the user presses Play (`▶` / `Space`):
- Playhead auto-advances through events
- Speed control: 1x (one event per second), 2x, 5x, 10x, 0.5x
- Speed selector appears in transport controls during playback
- Inspector updates in real-time as playhead moves
- Events "light up" as the playhead passes through them (brief flash animation)
- Pause → playhead stops, resume continues
- Playing past a fork → follow the active branch by default
- **Play range**: user can set in/out markers (like video editor) and loop playback within range

### Position Indicators

```
Time Ruler with Playhead:
│09:45    │09:50    │09:55    ▼10:03:47  │10:10    │10:15
  ·  ·  ·  ·  ·  ·  ·  ·  ·  ║  ·  ·  ·  ·  ·  ·  ·  ·

Status bar updates: E47/312

Tooltip while scrubbing:
┌─────────────────────┐
│ 10:03:47             │
│ Event 47: cmd_exec   │
│ cargo test --release │
│ Branch: main         │
└─────────────────────┘
```

---

## 6. Time Ruler

### Ruler Zones (Adaptive)

The time ruler adapts its tick density and labels based on zoom level:

| Zoom Level | Major Ticks | Minor Ticks | Labels |
|---|---|---|---|
| Session (fit all) | Every 30 min | Every 5 min | "09:00", "09:30", "10:00" |
| Hour view | Every 10 min | Every 1 min | "09:40", "09:50", "10:00" |
| 10-minute view | Every 1 min | Every 10 sec | "09:55:00", "09:55:10" |
| Minute view | Every 10 sec | Every 1 sec | "09:55:30", "09:55:31" |
| Event view | Every event | — | Event IDs: "E45", "E46", "E47" |

### Session Boundary Markers

```
│09:45    │09:50    ┃ Session 2 Start: 10:01 AM    │10:05    │10:10
  ·  ·  ·  ·  ·  · ┃  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·

Session boundary: vertical dashed line with label above
```

### In/Out Range Markers

```
│09:45    │09:50  [IN]09:55    │10:00    │10:05[OUT]│10:10
  ·  ·  ·  ·  ·  ▏█████████████████████████████████▕  ·  ·
                  ← shaded range for replay/export →
```

- `[IN]` marker: green triangle, draggable
- `[OUT]` marker: red triangle, draggable
- Shaded area between them: semi-transparent blue overlay
- Right-click range → "Replay this range" / "Export range" / "Compare range"

---

## 7. Branch Visualization

### Branch Color System

Each branch gets a unique color from a predefined palette. Colors are assigned in order of creation:

| Branch Index | Color Name | Hex | Used For |
|---|---|---|---|
| 0 (main) | Electric Blue | `#4A9EFF` | Always main/trunk |
| 1 | Emerald Green | `#4AFF8E` | First child branch |
| 2 | Vivid Purple | `#B44AFF` | Second child |
| 3 | Hot Orange | `#FF8E4A` | Third child |
| 4 | Neon Pink | `#FF4AB4` | Fourth child |
| 5 | Cyan | `#4AFFDA` | Fifth child |
| 6 | Gold | `#FFD74A` | Sixth child |
| 7 | Lime | `#8EFF4A` | Seventh child |
| 8+ | Auto-generated | HSL rotation | Additional branches |

User can override any branch color via right-click → "Set branch color".

### Branch Selector Dropdown

Triggered by clicking the branch indicator in Zone A or Zone D:

```
┌─────────────────────────────────────┐
│ Switch Branch                    🔍 │
├─────────────────────────────────────┤
│ 🔵 ● main            HEAD E312   ▸ │
│ 🟢   auth/jwt        HEAD E189   ▸ │
│ 🟣   cache/redis     HEAD E95    ▸ │
├─────────────────────────────────────┤
│ ╌╌╌ Archived ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ │
│ ⚪   old/experiment   Merged      ▸ │
├─────────────────────────────────────┤
│ + Create new branch...              │
│ ⑂ Branch from current event...     │
└─────────────────────────────────────┘

● = active branch (radio button)
▸ = expand for branch details submenu
```

**Branch details submenu (▸):**
```
┌──────────────────────────────────┐
│ auth/jwt                         │
├──────────────────────────────────┤
│ Created: Feb 10, 10:23 AM        │
│ Fork point: E45 on main          │
│ Events: 144                      │
│ Files changed: 23                │
│ Status: Active                   │
├──────────────────────────────────┤
│ 🔀 Switch to this branch         │
│ 📊 Compare with main             │
│ 🔀 Merge into main               │
│ ✏️ Rename                        │
│ 🎨 Set color                     │
│ 📌 Pin track                     │
│ 🗑️ Delete branch                │
└──────────────────────────────────┘
```

### Branch Comparison View

When the user selects "Compare with..." for two branches, the timeline enters **comparison mode**:

```
┌──────────────────────────────────────────────────────────────┐
│ COMPARISON: main vs auth/jwt                          ✕ Exit │
├──────────────────────────────────────────────────────────────┤
│ main:  ●──●──●──●──◆──●──●──●──●──●──●──●──●──●            │
│              ╲                                               │
│ auth:         ●──●──◆──●──●──●                              │
│                                                              │
│ Diverged at: E12 │ Events since fork: main +18, auth +6     │
│ Files only in main: 4 │ Files only in auth: 2 │ Both: 8     │
│ Conflicts: 2 (src/auth.rs, src/config.rs)                   │
├──────────────────────────────────────────────────────────────┤
│ [View Conflicts] [Merge Preview] [Side-by-Side Diff] [Exit] │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. Event Inspector Panel

The Inspector is the **detail panel** above the timeline bar. It shows full information about the selected event(s).

### Inspector Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ EVENT INSPECTOR                                          _ □ ✕      │
├───────┬─────────────────────────────────────────────────────────────┤
│       │                                                             │
│ TABS  │  CONTENT AREA                                               │
│       │                                                             │
│ 📋    │  (varies by tab)                                            │
│ Summary│                                                            │
│       │                                                             │
│ 📄    │                                                             │
│ Diff  │                                                             │
│       │                                                             │
│ 💬    │                                                             │
│ LLM   │                                                             │
│       │                                                             │
│ 📊    │                                                             │
│ Meta  │                                                             │
│       │                                                             │
│ 🔧    │                                                             │
│Actions│                                                             │
│       │                                                             │
└───────┴─────────────────────────────────────────────────────────────┘
```

### Tab 1: Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│ E47: cmd_exec                                        🏷 Bookmark ⭐ │
│                                                                     │
│ Command:  cargo test --release                                      │
│ Branch:   main                                                      │
│ Time:     10:03:47 AM (2.3s duration)                               │
│ Status:   ✅ Success (exit code 0)                                   │
│ Files:    3 modified (src/auth.rs, src/config.rs, tests/auth.rs)    │
│ Snapshot: S47 (delta from S46, +1.2 KB)                             │
│ Hash:     e4a7f2...c3b1 (chain: ✅ verified)                        │
│ Score:    Reproducibility: 0.95 🟢                                  │
│                                                                     │
│ User Note: "Tests pass after auth refactor"              [Edit] ✏️  │
│                                                                     │
│ Previous: E46 (file_write: src/auth.rs)                   [Jump] ◀  │
│ Next:     E48 (llm_call: analyze test results)            [Jump] ▶  │
└─────────────────────────────────────────────────────────────────────┘
```

### Tab 2: Diff

```
┌─────────────────────────────────────────────────────────────────────┐
│ Files Changed (3)                               [Unified] [Split]   │
├─────────────────────────────────────────────────────────────────────┤
│ 📄 src/auth.rs                                    +12 -4 lines      │
│ ┌───────────────────────────────────────────────────────────────┐   │
│ │  45│  fn validate_token(token: &str) -> Result<Claims> {     │   │
│ │  46│-     let key = get_secret_key();                        │   │
│ │  46│+     let key = get_secret_key()?;                       │   │
│ │  47│+     if key.is_expired() {                              │   │
│ │  48│+         return Err(AuthError::ExpiredKey);             │   │
│ │  49│+     }                                                  │   │
│ │  50│      decode::<Claims>(token, &key, &Validation::new())  │   │
│ └───────────────────────────────────────────────────────────────┘   │
│                                                                     │
│ 📄 src/config.rs                                   +3 -1 lines      │
│ ▸ (collapsed — click to expand)                                     │
│                                                                     │
│ 📄 tests/auth.rs                                   +8 -0 lines      │
│ ▸ (collapsed — click to expand)                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Tab 3: LLM (for `llm_call` events)

```
┌─────────────────────────────────────────────────────────────────────┐
│ LLM Interaction                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Model:    claude-sonnet-4-20250514                                │
│ Tokens:   Prompt: 2,847 │ Completion: 1,203 │ Total: 4,050         │
│ Latency:  1.8s                                                      │
│ Cost:     ~$0.012                                                   │
│                                                                     │
│ ┌─ Prompt (collapsed) ─────────────────────────────────────────┐   │
│ │ ▸ System prompt (847 tokens)                                  │   │
│ │ ▸ Context messages (4)                                        │   │
│ │ ▾ User message:                                               │   │
│ │   "Fix the auth validation to handle expired keys properly"   │   │
│ └───────────────────────────────────────────────────────────────┘   │
│                                                                     │
│ ┌─ Response ────────────────────────────────────────────────────┐   │
│ │ I'll update the validate_token function to check for expired  │   │
│ │ keys before attempting to decode the JWT token...             │   │
│ │ (1,203 tokens)                                                │   │
│ └───────────────────────────────────────────────────────────────┘   │
│                                                                     │
│ [Copy Prompt] [Copy Response] [Replay with Different Model ▾]      │
└─────────────────────────────────────────────────────────────────────┘
```

### Tab 4: Metadata

```
┌─────────────────────────────────────────────────────────────────────┐
│ Event Metadata                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ Event ID:        tw-evt-047                                         │
│ Parent Event:    tw-evt-046                                         │
│ Branch:          main (tw-br-001)                                   │
│ Event Type:      cmd_exec                                           │
│ Created:         2026-02-10T10:03:47.123Z                           │
│ Duration:        2,341ms                                            │
│                                                                     │
│ Snapshot Before: S46 (sha256: a3f7e2...)                            │
│ Snapshot After:  S47 (sha256: b8c4d1...)                            │
│ Event Hash:      e4a7f2c3b1... (chain verified ✅)                  │
│ Previous Hash:   d2e5f8a9c0...                                      │
│                                                                     │
│ ALMAS Role:      Developer                                          │
│ Coach Score:     N/A (not reviewed yet)                              │
│ Evo Memory:      Context layer 2 active                             │
│                                                                     │
│ ┌─ Raw Event JSON ──────────────────────────────────────────────┐   │
│ │ {                                                              │   │
│ │   "event_id": "tw-evt-047",                                   │   │
│ │   "type": "cmd_exec",                                         │   │
│ │   "inputs": {"cmd": "cargo test --release"},                  │   │
│ │   "outputs": {"exit_code": 0, "stdout": "..."},               │   │
│ │   ...                                                          │   │
│ │ }                                                              │   │
│ └───────────────────────────────────────────────────────────────┘   │
│ [Copy JSON] [Export Event]                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Tab 5: Actions

```
┌─────────────────────────────────────────────────────────────────────┐
│ Actions for E47                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ⏮ Jump Here                                                       │
│     Restore workspace to the state after this event                 │
│                                                                     │
│  ⑂ Branch from Here                                                │
│     Create a new branch starting from this event                    │
│                                                                     │
│  🔄 Replay from Here                                                │
│     Re-execute all events from this point to HEAD                   │
│                                                                     │
│  📊 Compare with Current                                            │
│     Show diff between this event's state and current HEAD           │
│                                                                     │
│  📤 Export Snapshot                                                  │
│     Export workspace state at this event as a zip/tar               │
│                                                                     │
│  🔗 Copy Event Link                                                 │
│     Copy shareable reference to this event                          │
│                                                                     │
│  📌 Set as Milestone                                                │
│     Mark this event as a named milestone                            │
│                                                                     │
│  🗑️ Revert to Before This                                          │
│     Create a new event that undoes this event's changes             │
│                                                                     │
│  ⚠️ Verify Chain from Here                                         │
│     Verify hash chain integrity from this event to HEAD             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Minimap / Overview Strip

### Minimap Rendering

The minimap renders the full timeline compressed into the panel width. It uses a simplified rendering:

```
Minimap (120px wide × full timeline height):
┌────────────────┐
│ ━━━━━━━━━━━━━━ │  ← main track (blue line)
│     ╲━━━━━     │  ← auth branch (green)
│         ╲━━    │  ← cache branch (purple)
│                │
│      [══════]  │  ← Viewport bracket
│                │
│ ━━━━━━━━━━━━━━ │  ← main continues
│ Dense zone: ██ │  ← High event density shown as filled
└────────────────┘
```

**Minimap interactions:**

| Input | Behavior |
|---|---|
| Click | Center viewport on clicked position |
| Drag viewport bracket | Scroll main timeline |
| Scroll wheel | Zoom main timeline (bracket gets wider/narrower) |
| Drag bracket edges | Resize viewport (zoom) |
| Right-click | "Fit all" / "Zoom to selection" / "Zoom to branch" |

---

## 10. Transport Controls

### Full Transport Bar (Zone A expanded view)

```
┌──────────┐
│  ⏮  │  Jump to start
│  ◀  │  Previous event
│  ▶  │  Play / Pause
│  ▶│ │  Next event
│  ⏭  │  Jump to end
│─────────│
│ 1x ▾   │  Speed selector (0.25x, 0.5x, 1x, 2x, 5x, 10x)
│─────────│
│ 🌿 main│  Branch selector
│ 🔍     │  Search
│ ⚙      │  Filter
│ ⊞      │  Zoom fit
│ 📸     │  Snapshot now (manual)
│ ★      │  Mark milestone
└──────────┘
```

### Recording Controls

The TimeWarp bar shows recording state prominently:

| State | Visual | Meaning |
|---|---|---|
| **Recording** | `◉ REC` pulsing red dot in status bar | Agent session active, events being captured |
| **Paused** | `⏸ PAUSED` yellow dot | Recording temporarily paused (user choice) |
| **Idle** | `○ IDLE` dim gray dot | No active session |
| **Replaying** | `🔄 REPLAY` blue spinning icon | Replay engine running |
| **Error** | `⚠ ERROR` red flash | Event capture failed |

---

## 11. Context Menus — Every Right-Click

### Right-Click on Event Node

```
┌──────────────────────────────────────┐
│ Event E47: cmd_exec                  │
├──────────────────────────────────────┤
│ ⏮ Jump to this event           J    │
│ ⑂ Branch from here             B    │
│ 🔄 Replay from here            R    │
│ ───────────────────────────────────  │
│ 📊 Compare with HEAD                │
│ 📊 Compare with...              ▸   │
│ 📄 View diff                    D    │
│ 📄 View snapshot                     │
│ ───────────────────────────────────  │
│ ★ Set as milestone                   │
│ 📌 Bookmark                     M    │
│ ✏️ Add note                     N    │
│ 🏷 Add tag                     T    │
│ ───────────────────────────────────  │
│ 📋 Copy event ID                     │
│ 📋 Copy event JSON                   │
│ 📤 Export snapshot as zip             │
│ ───────────────────────────────────  │
│ 🗑️ Revert this event                │
│ ⚠️ Verify chain from here            │
└──────────────────────────────────────┘
```

### Right-Click on Branch Track (Rail)

```
┌──────────────────────────────────────┐
│ Branch: auth/jwt                     │
├──────────────────────────────────────┤
│ 🔀 Switch to this branch             │
│ 📊 Compare with main                 │
│ 📊 Compare with...              ▸   │
│ 🔀 Merge into current branch         │
│ ───────────────────────────────────  │
│ ✏️ Rename branch                     │
│ 🎨 Set track color              ▸   │
│ ↕️ Set track height              ▸   │
│ 📌 Pin track (always visible)        │
│ ───────────────────────────────────  │
│ 👁 Hide track                        │
│ 📦 Archive branch                    │
│ 🗑️ Delete branch                    │
│ ───────────────────────────────────  │
│ 📤 Export branch as git              │
│ 📋 Copy branch info                  │
└──────────────────────────────────────┘
```

### Right-Click on Empty Space

```
┌──────────────────────────────────────┐
│ Timeline                             │
├──────────────────────────────────────┤
│ ⊞ Zoom to fit all                    │
│ 🔍 Zoom to selection                 │
│ 📊 Zoom to active branch             │
│ ───────────────────────────────────  │
│ 📸 Take snapshot now                 │
│ ★ Mark milestone at HEAD             │
│ ───────────────────────────────────  │
│ 🔧 Timeline settings            ▸   │
│   │ Show detail lane                 │
│   │ Show minimap                     │
│   │ Show file_read events            │
│   │ Auto-scroll to new events        │
│   │ Track height: [slider]           │
│   │ Node size: [slider]              │
│ ───────────────────────────────────  │
│ 📤 Export full timeline              │
│ 🔒 Verify integrity                  │
│ 📋 Copy timeline stats               │
└──────────────────────────────────────┘
```

### Right-Click on Time Ruler

```
┌──────────────────────────────────────┐
│ ▶ Set range start (IN marker)       │
│ ◀ Set range end (OUT marker)        │
│ ✕ Clear range markers                │
│ ───────────────────────────────────  │
│ 🔄 Replay this range                 │
│ 📤 Export this range                  │
│ 📊 Compare range with...        ▸   │
│ ───────────────────────────────────  │
│ Zoom to: this minute                 │
│ Zoom to: this 5-minute window        │
│ Zoom to: this hour                   │
│ Zoom to: full session                │
└──────────────────────────────────────┘
```

### Right-Click on Minimap

```
┌──────────────────────────────────────┐
│ ⊞ Fit all in viewport               │
│ 🔍 Zoom to selection                 │
│ ───────────────────────────────────  │
│ 👁 Show/hide minimap                 │
│ ↔️ Resize minimap                ▸   │
│   │ Small (80px)                     │
│   │ Medium (120px)                   │
│   │ Large (200px)                    │
└──────────────────────────────────────┘
```

---

## 12. Keyboard Shortcuts — Complete Map

### Navigation

| Shortcut | Action |
|---|---|
| `←` | Previous event |
| `→` | Next event |
| `Shift+←` | Extend selection left |
| `Shift+→` | Extend selection right |
| `Home` | Jump to first event |
| `End` | Jump to latest event (HEAD) |
| `Ctrl+←` | Previous fork/merge point |
| `Ctrl+→` | Next fork/merge point |
| `Ctrl+G` | Go to event by ID (opens dialog) |
| `Space` | Play / Pause |
| `Shift+Space` | Play in reverse |

### Branching & Time Travel

| Shortcut | Action |
|---|---|
| `J` | Jump to selected event (restore workspace) |
| `B` | Branch from selected event (opens name dialog) |
| `Ctrl+B` | Open branch switcher dropdown |
| `R` | Replay from selected event |
| `Ctrl+M` | Merge selected branch into current |

### Selection & Editing

| Shortcut | Action |
|---|---|
| `Click` | Select single event |
| `Shift+Click` | Select range from last selected to clicked |
| `Ctrl+Click` | Toggle individual event in multi-selection |
| `Ctrl+A` | Select all events on active branch |
| `Escape` | Deselect all |
| `N` | Add note to selected event |
| `M` | Toggle bookmark on selected event |
| `T` | Add tag to selected event |
| `★` / `Ctrl+Shift+M` | Set milestone on selected event |

### View Controls

| Shortcut | Action |
|---|---|
| `Ctrl+0` | Zoom to fit all |
| `Ctrl+=` / `Ctrl+Scroll Up` | Zoom in |
| `Ctrl+-` / `Ctrl+Scroll Down` | Zoom out |
| `Ctrl+1` | Zoom to event level |
| `Ctrl+2` | Zoom to minute level |
| `Ctrl+3` | Zoom to session level |
| `Ctrl+Shift+T` | Cycle collapse states (Full → Compact → Minimal) |
| `Ctrl+Shift+H` | Hide/show TimeWarp bar completely |
| `Ctrl+I` | Toggle Inspector panel |
| `Ctrl+Shift+D` | Toggle detail lane |
| `Ctrl+Shift+M` | Toggle minimap |

### Search & Filter

| Shortcut | Action |
|---|---|
| `Ctrl+F` | Open search bar |
| `F` | Open filter popover |
| `Ctrl+Shift+F` | Advanced search (multi-criteria) |
| `/` | Quick search (same as Ctrl+F) |

### Data & Export

| Shortcut | Action |
|---|---|
| `Ctrl+E` | Export selected event(s) |
| `Ctrl+Shift+E` | Export full timeline |
| `Ctrl+Shift+V` | Verify hash chain integrity |
| `Ctrl+Shift+S` | Take manual snapshot now |
| `D` | Show diff for selected event |

---

## 13. Search & Filter System

### Search Bar (Ctrl+F)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔍 Search: [auth validation                        ] [✕] 3 results │
│     Type: All ▾ │ Branch: All ▾ │ Time: All ▾ │ ◀ 2/3 ▶           │
└─────────────────────────────────────────────────────────────────────┘
```

**Search targets:**
- Event descriptions / command text
- File paths
- LLM prompts and responses
- Event IDs
- Tags and notes
- Branch names

**Search results:** Matching events are highlighted on the timeline with a bright yellow ring. Non-matching events dim to 30% opacity. Navigation arrows step through results.

### Filter Popover (F key)

```
┌─────────────────────────────────┐
│ Filter Events                   │
├─────────────────────────────────┤
│ Event Type:                     │
│ ☑ file_write    ☑ cmd_exec     │
│ ☑ llm_call      ☑ git_op       │
│ ☐ file_read     ☑ mcp_tool     │
│ ☑ error         ☑ milestone    │
│ ☑ role_change   ☑ review       │
│                                 │
│ Branch:                         │
│ ☑ main  ☑ auth  ☑ cache        │
│                                 │
│ ALMAS Role:                     │
│ ☑ Architect  ☑ Developer        │
│ ☑ QA  ☑ Security  ☑ Deployer   │
│                                 │
│ Time Range:                     │
│ From: [          ] ← datepicker │
│ To:   [          ] ← datepicker │
│                                 │
│ Files Changed:                  │
│ Min: [0  ] Max: [999]           │
│                                 │
│ Status:                         │
│ ☑ Success  ☑ Failed  ☑ All     │
│                                 │
│ [Apply] [Reset] [Save Preset ▾]│
└─────────────────────────────────┘
```

**Filter presets (Save Preset ▾):**
- "Only errors" → type=error
- "Only LLM calls" → type=llm_call
- "Heavy changes" → files_changed > 5
- "Coach rejections" → type=review, status=rejected
- Custom saved presets

---

## 14. Zoom System

### Zoom Levels

| Level | Name | Pixels per Event | What's Visible |
|---|---|---|---|
| 1 | Extreme zoom | 60–120px | Individual events with full labels, decorators, badges |
| 2 | Event view | 20–60px | Event nodes with type shapes, hover for details |
| 3 | Minute view | 8–20px | Event nodes as small dots, clusters visible |
| 4 | Session view | 2–8px | Event density bars, branch rails, fork/merge points only |
| 5 | Overview | < 2px | Heatmap style, branches as colored lines, no individual events |

### Zoom Behavior

| Input | Action |
|---|---|
| `Ctrl+Scroll` | Zoom centered on cursor position |
| `Ctrl+=` / `Ctrl+-` | Zoom centered on playhead |
| `Ctrl+0` | Fit all events in viewport |
| Pinch gesture (trackpad) | Zoom centered on gesture center |
| Double-click empty space | Zoom in 2x centered on click |
| `Ctrl+1/2/3` | Jump to preset zoom levels |

### Semantic Zoom (LOD — Level of Detail)

As the user zooms out, events progressively simplify:

| Zoom Level | Event Rendering |
|---|---|
| **Close (60px+)** | Full shape + color + badge + label text + connector lines |
| **Medium (20-60px)** | Shape + color + badge. Labels hidden. |
| **Far (8-20px)** | Small colored dot only. Badges hidden. |
| **Very far (2-8px)** | Dots merge into density bars. Branch rails only. |
| **Overview (< 2px)** | Continuous heatmap. No individual events. |

Transition between LOD levels is **animated** (200ms fade).

---

## 15. Drag & Drop Interactions

| Drag Source | Drop Target | Action |
|---|---|---|
| Track label | Another track position | Reorder tracks |
| Event node | "Branch from" zone | Create branch from that event |
| Playhead handle | Any position on ruler | Move playhead (scrub) |
| IN marker | Ruler position | Set replay/export start |
| OUT marker | Ruler position | Set replay/export end |
| Minimap viewport bracket | Minimap area | Scroll main viewport |
| Minimap bracket edge | Minimap area | Resize viewport (zoom) |
| Inspector panel drag handle | Vertical position | Resize inspector height |
| TimeWarp bar top edge | Vertical position | Resize bar height |

**Drag visual feedback:**
- Ghost image of dragged element follows cursor
- Valid drop zones highlight with dashed border
- Invalid zones show "not-allowed" cursor
- Snap lines appear when nearing snap points

---

## 16. Tooltips — Every Hover

### Event Node Tooltip

```
┌─────────────────────────────────┐
│ E47: cmd_exec                   │
│ ─────────────────────────────── │
│ Command: cargo test --release   │
│ Time: 10:03:47 AM (2.3s)       │
│ Files: 3 changed               │
│ Status: ✅ Success               │
│ Branch: main                    │
│ Score: 0.95 🟢                  │
│                                 │
│ Click: select │ Dbl: inspect    │
│ Right-click: actions            │
└─────────────────────────────────┘
```

**Tooltip appears:** After 300ms hover delay  
**Tooltip position:** Above the node (flip to below if near top edge)  
**Tooltip disappears:** Immediately on mouse leave

### Track Label Tooltip

```
┌─────────────────────────────────┐
│ Branch: auth/jwt                │
│ Created: Feb 10, 10:23 AM      │
│ Events: 144 │ Files: 23        │
│ Fork point: E45 on main        │
│ Status: Active                  │
│                                 │
│ Drag to reorder │ Dbl: rename   │
└─────────────────────────────────┘
```

### Fork/Merge Connector Tooltip

```
┌─────────────────────────────────┐
│ Fork: main → auth/jwt           │
│ At event: E45                   │
│ Time: 10:23:01 AM              │
│ Events since fork: 144          │
└─────────────────────────────────┘
```

### Status Bar Segment Tooltips

Each segment of the status bar has its own tooltip (documented in Zone D section above).

### Detail Lane Tooltip

```
┌─────────────────────────────────┐
│ E47: 3 files, 56 lines changed │
│ Peak activity zone              │
└─────────────────────────────────┘
```

---

## 17. Status Indicators & Badges

### Timeline Health Indicators

| Indicator | Location | Visual | Meaning |
|---|---|---|---|
| Recording active | Status bar | `◉` pulsing red | Agent session being captured |
| Chain verified | Status bar | `🔒` green | Hash chain integrity OK |
| Chain broken | Status bar | `⚠️` red flash | Hash chain verification failed |
| Storage warning | Status bar | `💾` yellow | Event store > 100MB |
| Replay active | Status bar | `🔄` spinning blue | Replay engine running |
| Conflict detected | Track rail | `⚠` red on track | Merge conflict exists |
| Drift detected | Track rail | `🔄` orange on track | Environment drift detected |

### Event Quality Badges (on event nodes)

| Badge | Visual | Condition |
|---|---|---|
| High confidence replay | 🟢 green dot | Reproducibility ≥ 0.9 |
| Medium confidence | 🟡 yellow dot | Reproducibility 0.7–0.9 |
| Low confidence | 🔴 red dot | Reproducibility < 0.7 |
| Not replayed | No dot | No replay attempt yet |
| Milestone | ★ gold star | User-marked milestone |
| Bookmarked | 📌 pin | User bookmarked |
| Has note | 💬 bubble | User added annotation |
| Error | ❌ red X | Event resulted in error |
| Long duration | ⏱ clock | Took > 30 seconds |
| High token usage | `T` badge | LLM call > 10K tokens |

---

## 18. Animations & Transitions

| Animation | Duration | Easing | Trigger |
|---|---|---|---|
| Event node appear | 200ms | ease-out | New event recorded |
| Event node select | 150ms | ease-in-out | Click event |
| Event node deselect | 100ms | ease-out | Click elsewhere |
| Playhead move (step) | 200ms | ease-in-out | Arrow key / click |
| Playhead move (scrub) | 0ms (immediate) | — | Drag |
| Zoom in/out | 300ms | ease-in-out | Ctrl+scroll |
| Track expand/collapse | 200ms | ease-in-out | Toggle collapse |
| Inspector expand/collapse | 250ms | ease-in-out | Toggle inspector |
| Branch fork connector draw | 400ms | ease-out | New branch created |
| Merge connector draw | 400ms | ease-out | Branch merged |
| Recording pulse | 1000ms loop | sine | Recording active |
| Error flash | 300ms × 3 | flash | Error occurred |
| Filter apply (dim events) | 200ms | ease-out | Filter activated |
| Search highlight | 200ms | ease-in | Search result found |
| LOD transition | 200ms | fade | Zoom level change |
| Auto-scroll to new event | 300ms | ease-in-out | New event while auto-scroll enabled |
| Tooltip fade in | 150ms | ease-out | Hover 300ms |
| Tooltip fade out | 100ms | ease-in | Mouse leave |
| Conflict pulse | 1500ms loop | sine | Conflict detected |
| Replay progress | continuous | linear | During replay |

---

## 19. Responsive Sizing

### Window Width Breakpoints

| Width | Layout Changes |
|---|---|
| **< 800px** | Minimap hidden. Transport controls move to overlay. Status bar wraps to 2 lines. |
| **800–1200px** | Minimap reduced to 80px. Track labels truncated to 6 chars. |
| **1200–1600px** | Default layout. All elements visible. |
| **> 1600px** | Wider minimap (200px). Track labels full length. Event labels visible at lower zoom. |

### Multi-Monitor Support

- TimeWarp bar can be **detached** into its own window (`Ctrl+Shift+W` or right-click → "Pop out timeline")
- Detached window: resizable, can be placed on secondary monitor
- Still synchronized with the main Super-Goose window in real-time
- Inspector can also be detached separately

---

## 20. Accessibility

| Feature | Implementation |
|---|---|
| Keyboard navigation | Full keyboard control for all features (Tab, Enter, Arrow keys, shortcuts) |
| Screen reader | ARIA labels on all interactive elements. Events announced as "Event 47, command execution, success, 3 files changed" |
| High contrast mode | Uses system high-contrast colors. All branch colors have minimum 4.5:1 contrast ratio against background |
| Color blind mode | Event shapes encode type (not just color). Patterns (stripes, dots, crosshatch) supplement colors |
| Font scaling | All text respects system font size. Timeline scales proportionally. |
| Reduced motion | Honors `prefers-reduced-motion`. Animations replaced with instant transitions. |
| Focus indicators | Visible focus ring on all focusable elements (2px bright outline) |
| Zoom | UI scales to 200% without horizontal scrolling in non-timeline areas |
| Touch targets | Minimum 32px touch targets for trackpad/touch users |

---

## 21. Color System & Theming

### Dark Theme (Default)

| Element | Color | Hex |
|---|---|---|
| Bar background | Very dark blue-gray | `#0F1219` |
| Track background | Slightly lighter | `#141A24` |
| Track rail (inactive) | Dim | `#2A3444` |
| Playhead line | Bright white | `#FFFFFF` |
| Playhead glow | Accent blue | `#4A9EFF40` |
| Time ruler text | Medium gray | `#8899AA` |
| Time ruler ticks | Dim gray | `#3A4A5A` |
| Status bar bg | Darkest | `#0A0E14` |
| Status bar text | Light gray | `#AABBCC` |
| Selection highlight | Blue overlay | `#4A9EFF20` |
| Range overlay | Blue overlay | `#4A9EFF15` |
| Inspector bg | Dark panel | `#111820` |
| Tooltip bg | Dark with border | `#1A2230` + `#3A4A5A` border |
| Context menu bg | Dark with shadow | `#1A2230` |

### Light Theme

| Element | Color | Hex |
|---|---|---|
| Bar background | Off-white | `#F5F7FA` |
| Track background | White | `#FFFFFF` |
| Track rail (inactive) | Light gray | `#D0D8E0` |
| Playhead line | Dark | `#1A1A2E` |
| Event nodes | Same hues, 10% darker for contrast | — |

### Theme switching: Follows Super-Goose global theme setting.

---

## 22. Performance Requirements

| Metric | Target | Measurement |
|---|---|---|
| Event render (1000 events) | < 16ms (60fps) | Canvas repaint time |
| Event render (10000 events) | < 16ms (60fps) | Must use virtualization |
| Scrubbing latency | < 50ms | Playhead → inspector update |
| New event append | < 10ms | Event recorded → node visible |
| Zoom animation | 60fps | No frame drops during zoom |
| Scroll animation | 60fps | No jank during horizontal scroll |
| Search results | < 100ms | Query → highlights rendered |
| Inspector tab switch | < 50ms | Tab click → content visible |
| Branch switch | < 200ms | Branch select → tracks redrawn |
| Memory (1000 events) | < 50MB | Total timeline component memory |
| Memory (10000 events) | < 200MB | With virtualization active |

### Rendering Strategy

- **Canvas rendering** for tracks, events, rails, connectors (not DOM elements)
- **DOM** only for: tooltips, context menus, inspector panel, status bar
- **Virtualization**: Only render events visible in the viewport + 50% buffer on each side
- **Batched updates**: Event appends batched at 60fps, not per-event
- **Web Workers**: Hash verification, search indexing, and filter operations run off-main-thread

---

## 23. Integration Points with Super-Goose

### Where TimeWarp Bar Fits in the Desktop App

```
Super-Goose Desktop Window
┌─────────────────────────────────────────────────┐
│ Menu Bar: File │ Edit │ View │ Agent │ TimeWarp │ │
├─────────┬───────────────────────────────────────┤
│ Sidebar │                                       │
│ ┌─────┐ │    MAIN CONTENT                       │
│ │Chat │ │    (Agent chat / Code editor /         │
│ │     │ │     Browser / Terminal)                │
│ │     │ │                                       │
│ │     │ │                                       │
│ │     │ │                                       │
│ └─────┘ │                                       │
│ ┌─────┐ ├───────────────────────────────────────┤
│ │Files│ │    EVENT INSPECTOR (collapsible)       │
│ │     │ ├───────────────────────────────────────┤
│ │     │ │    ⚡ TIMEWARP BAR ⚡                   │
│ └─────┘ │    (always visible during sessions)   │
└─────────┴───────────────────────────────────────┘
```

### TimeWarp Menu

```
TimeWarp
├── ⏮ Jump to Event...              Ctrl+G
├── ⑂ Branch from Current...        B
├── 🔀 Merge Branch...               Ctrl+M
├── 🔄 Replay...                     R
├── ───────────────────
├── 📸 Take Snapshot Now             Ctrl+Shift+S
├── ★ Mark Milestone                 Ctrl+Shift+M
├── 🔒 Verify Integrity              Ctrl+Shift+V
├── ───────────────────
├── 📊 Branch Manager...
├── 🔍 Search Timeline...            Ctrl+F
├── 📤 Export Timeline...            Ctrl+Shift+E
├── ───────────────────
├── ⚙ Timeline Settings...
├── 👁 Show/Hide Timeline Bar        Ctrl+Shift+T
└── 👁 Show/Hide Inspector           Ctrl+I
```

### Cross-Component Communication

| Source | Event | TimeWarp Response |
|---|---|---|
| Agent chat sends message | `agent:message_sent` | No action (read-only chat) |
| Agent executes tool call | `mcp:tool_call` | Create event, optional snapshot |
| Agent receives LLM response | `llm:response` | Create `llm_call` event |
| User clicks file in editor | `editor:file_opened` | Highlight events that touched this file |
| User runs terminal command | `terminal:command` | Create `cmd_exec` event if within session |
| ALMAS role transition | `almas:role_change` | Create `role_transition` event with role info |
| Coach/Player review | `coach:review` | Create `coach_review` event with score |
| EvoAgentX A/B test | `evo:ab_test` | Create branch fork for each variant |
| Conscious voice command | `conscious:intent` | Execute TimeWarp command (jump, branch, etc.) |

### Voice Commands via Conscious

| Voice Command | TimeWarp Action |
|---|---|
| "Go back to before the auth changes" | Search for "auth" → jump to event before first match |
| "Show me what happened in the last 10 minutes" | Zoom timeline to last 10 minutes |
| "Create a branch called experiment" | `tw branch "experiment"` from current HEAD |
| "Compare this with the main branch" | Open branch comparison view |
| "Replay the last 5 events" | Set range to last 5 events, start replay |
| "What did the agent do to this file?" | Filter timeline to events touching current file |
| "Undo the last change" | Revert most recent event |
| "Mark this as a checkpoint" | Create milestone at HEAD |

---

## 24. Edge Cases & Empty States

### Empty Timeline (No Events Yet)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│              ⏱ Waiting for agent session...                         │
│                                                                     │
│     TimeWarp will start recording when the agent begins working.    │
│     Every file change, command, and LLM call will appear here.      │
│                                                                     │
│     [Start Agent Session]    [Open Previous Timeline ▾]             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Very Long Session (10,000+ Events)

- Automatic LOD reduction at far zoom levels
- Event clustering: adjacent same-type events grouped into a single wider bar with count badge
- "Jump to time" dialog for precise navigation
- Session bookmarks appear as tall markers for quick navigation

### Single Event

- Timeline shows single node centered
- Zoom controls disabled (nothing to zoom)
- "Awaiting more events..." message next to node

### Disconnected / Offline

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠️ TimeWarp is recording locally. LLM response caching unavailable. │
│ Replay accuracy may be reduced for events recorded while offline.   │
│ [Dismiss]                                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Hash Chain Integrity Failure

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠️ INTEGRITY WARNING                                   [Dismiss] ✕  │
│ Hash chain verification failed at E203.                             │
│ Events E203–E312 may have been modified outside TimeWarp.           │
│                                                                     │
│ Affected events are marked with ⚠️ on the timeline.                │
│ [View Details] [Re-verify] [Ignore and Continue]                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Storage Full

```
┌─────────────────────────────────────────────────────────────────────┐
│ 💾 Storage limit approaching (950MB / 1GB)              [Dismiss] ✕ │
│ Consider archiving old sessions or increasing the limit.            │
│ [Archive Old Sessions] [Increase Limit] [Settings]                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 25. Complete Wireframes

### Wireframe 1: Full TimeWarp Bar During Active Session

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ SUPER-GOOSE: Agent Chat                                                          ─ □ ✕  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  Agent: I've updated the authentication module to handle expired JWT tokens.             │
│  The changes include a new validation step in validate_token() and updated               │
│  error types in auth_errors.rs. Running tests now...                                     │
│                                                                                          │
│  ✅ All 47 tests passed.                                                                 │
│                                                                                          │
├════════════════════════════════ DRAG HANDLE ═════════════════════════════════════════════┤
│ EVENT INSPECTOR: E47 cmd_exec                                           [📋 📄 💬 📊 🔧]│
│ ──────────────────────────────────────────────────────────────────────────────────────── │
│ Command: cargo test --release │ ✅ 0 exit │ 2.3s │ Branch: main │ Score: 0.95 🟢       │
│ Files: src/auth.rs (+12-4) │ src/config.rs (+3-1) │ tests/auth.rs (+8-0)               │
├════════════════════════════════════════════════════════════════════════════════════════════┤
│┌──────┐┌────────────────────────────────────────────────────────────────────┐┌──────────┐│
││ ⏮    ││ |09:50    |09:55    |10:00    ▼10:03    |10:10    |10:15         ││ Minimap  ││
││ ◀    ││ ─·──·──·──·──·──·──·──·──·──║──·──·──·──·──·──·──·──·──·──·──  ││ ┌──────┐ ││
││ ▶    ││                              ║                                    ││ │━━━━━━│ ││
││ ▶|   ││ 🔵 main: ●─●─●─◆─●─●─■─●─●─▼─●─●─●─●─●─●─●─●─●─●─●─●─●─●─●  ││ │  ╲━━ │ ││
││ ⏭    ││                ╲             ║                                    ││ │    ╲ │ ││
││──────││ 🟢 auth:        ●─●─◆─●─●─● ║                                    ││ │[═══]│ ││
││ 1x ▾ ││                      ╲       ║                                    ││ │━━━━━━│ ││
││──────││ 🟣 cache:              ●─●─●─●                                    ││ └──────┘ ││
││🌿main││                              ║                                    ││          ││
││ 🔍   ││ ▁▂▃▅▇█▇▅▃▁▁▁▂▃▅▇▇▅▃▁▁▁▁▁▂▅▇█████▇▅▃▂▁▁▁▁▁▂▃▅▇▅▃▂▁▁▁▁▁▁▁▁▁  ││          ││
││ ⚙    ││                              ║                                    ││          ││
│└──────┘└────────────────────────────────────────────────────────────────────┘└──────────┘│
│ 🌿 main │ E47/312 │ 📊 3 branches │ 💾 12.4 MB │ ⏱ 3h22m │ 🔒 Verified │ ◉ REC       │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 2: Branch Comparison Mode

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ COMPARISON MODE: main vs auth/jwt                                    [Exit Comparison] ✕ │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Diverged at: E45 │ Since fork: main +18 events, auth +6 events                          │
│ Files unique to main: 4 │ Files unique to auth: 2 │ Overlap: 8 files                    │
│ Conflicts: ⚠️ 2 (src/auth.rs, src/config.rs)                                           │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│┌──────┐┌────────────────────────────────────────────────────────────────────┐┌──────────┐│
││CTRLS ││ |E45(fork)  |E50       |E55       |E60       |E65                ││ Minimap  ││
││      ││                                                                   ││          ││
││      ││ 🔵 main: ◇─●─●─◆─●─●─■─●─●─●─●─●─●─●─●─●─●─●                  ││ ━━━◇━━━  ││
││      ││          ╲                                                        ││   ╲━━━   ││
││      ││ 🟢 auth:  ●─●─◆─●─●─●                                           ││          ││
││      ││                                                                   ││          ││
││      ││ ⚠ Conflict zones:                                                ││          ││
││      ││ main E52 ←──⚠──→ auth E48  (src/auth.rs)                        ││          ││
││      ││ main E58 ←──⚠──→ auth E50  (src/config.rs)                      ││          ││
│└──────┘└────────────────────────────────────────────────────────────────────┘└──────────┘│
│ [View Conflicts] [Merge Preview] [Side-by-Side Diff] [3-Way Merge] [Cancel]             │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 3: Compact Mode

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ MAIN CONTENT (expanded — more vertical space)                                            │
│                                                                                          │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ⏮◀▶▶|⏭ │ 🔵main: ●●●●◆●●■●●▼●●●●●⬟●●●● │ E47/312 │ 🔒 │ ◉ │ [▲ Expand]           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 4: Minimal Mode

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ MAIN CONTENT (maximum vertical space)                                                    │
│                                                                                          │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 🌿 main │ E47/312 │ ◉ REC │ ████████████████▓░░░░░░░░░ │ [▲]                            │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 5: Replay In Progress

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 🔄 REPLAY MODE — Replaying E20 → E47 (28 events) — Event 15/28                         │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ REPLAY INSPECTOR: E35 file_write                                                         │
│ Original: src/auth.rs +12 lines │ Replayed: src/auth.rs +12 lines │ Match: ✅ Identical  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│┌──────┐┌────────────────────────────────────────────────────────────────────┐┌──────────┐│
││ ⏸    ││ [IN]E20════════════════════════▼E35═══════════════E47[OUT]        ││ Minimap  ││
││      ││                                ║                                  ││          ││
││ 2x ▾ ││ 🔵 main: ●─●─●─●─●─●─●─●─●─●─▼─●─●─●─●─●─●─●─●─●─●─●─●─●     ││          ││
││      ││ 🔵 replay:○··○··○··○··○··○··○··▼·○··○··○··○··○··○··○··○·         ││          ││
││      ││          ✅  ✅  ✅  ✅  ✅  ✅  ✅ 🔄                              ││          ││
││      ││                                ║                                  ││          ││
││ 53%  ││ Progress: ████████████████░░░░░░░░░░░░░░░  15/28 events          ││          ││
││      ││ Reproducibility so far: 0.97 🟢                                  ││          ││
│└──────┘└────────────────────────────────────────────────────────────────────┘└──────────┘│
│ 🔄 REPLAYING │ E35/E47 │ Speed: 2x │ Score: 0.97 🟢 │ [Stop] [Pause] [Skip to End]    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 6: Filter Active — Only Errors Visible

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ FILTER ACTIVE: type=error (5 results)                                    [Clear Filter]  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│┌──────┐┌────────────────────────────────────────────────────────────────────┐┌──────────┐│
││      ││ |09:50    |09:55    |10:00    |10:05    |10:10    |10:15         ││          ││
││      ││                                                                   ││          ││
││      ││ 🔵 main: ·─·─·─·─▲─·─·─·─·─·─·─▲─·─·─·─▲─·─·─·─·─·─·─·─·    ││          ││
││      ││              (dim)  ERROR    (dim)  ERROR     ERROR   (dim)       ││          ││
││      ││                                                                   ││          ││
││ 🔍   ││ Non-error events shown at 30% opacity                            ││          ││
││ ⚙ ✕  ││ Error events highlighted with red glow + full opacity            ││          ││
│└──────┘└────────────────────────────────────────────────────────────────────┘└──────────┘│
│ 🌿 main │ 5 errors / 312 total │ FILTER: type=error │ ◉ REC                             │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary of Feature Density

The TimeWarp Bar is not a simple widget — it is a **full-featured temporal IDE panel** with:

| Category | Count |
|---|---|
| Interactive zones | 15+ distinct zones |
| Event node types | 16 distinct shapes/types |
| Context menus | 5 different menus (60+ total items) |
| Keyboard shortcuts | 45+ bindings |
| Inspector tabs | 5 tabs with full content |
| Animation types | 20+ distinct animations |
| Filter criteria | 8 dimensions |
| Zoom levels | 5 semantic levels with LOD |
| Tooltip types | 6 distinct tooltip formats |
| Status indicators | 12+ real-time indicators |
| Collapse states | 4 levels (Full → Compact → Minimal → Hidden) |
| Drag interactions | 10+ drag/drop operations |
| Branch operations | 10+ branch management actions |
| Voice commands | 8+ natural language triggers |
| Accessibility features | 10+ a11y considerations |
| Performance targets | 10+ measurable metrics |

---

*This specification is designed to be implementable by a frontend engineer using React + HTML Canvas. All interactions have been designed to feel as responsive and intuitive as professional video editors (Premiere, DaVinci Resolve) and version control GUIs (GitKraken, SourceTree) while serving the unique needs of AI agent time-travel.*
