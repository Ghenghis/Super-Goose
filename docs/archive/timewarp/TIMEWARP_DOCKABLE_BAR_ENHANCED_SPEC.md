# TimeWarp Dockable Bar: Enhanced UI/UX Specification

**Document Type:** Complete Dockable Bar Engineering Specification
**Component:** TimeWarp Dockable Bar -- multi-position dockable timeline control for Super-Goose Desktop
**Extends:** `TIMEWARP_BAR_UI_UX_SPEC.md` (original bottom-docked specification)
**Target Stack:** React 18 + TypeScript + Tailwind CSS + Electron IPC + HTML Canvas
**Design Lineage:** VS Code Panel System x macOS Dock x Fusion 360 Timeline x Chrome DevTools

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Dock Position System](#2-dock-position-system)
3. [Slim/Compact View -- Horizontal](#3-slimcompact-view--horizontal)
4. [Slim/Compact View -- Vertical](#4-slimcompact-view--vertical)
5. [Expanded View -- Horizontal](#5-expanded-view--horizontal)
6. [Expanded View -- Vertical](#6-expanded-view--vertical)
7. [Floating/Detached Mode](#7-floatingdetached-mode)
8. [Dock Transition System](#8-dock-transition-system)
9. [Integration with Super-Goose Layout](#9-integration-with-super-goose-layout)
10. [Slim View Indicators -- Complete Reference](#10-slim-view-indicators--complete-reference)
11. [Expanded View Panels -- Complete Reference](#11-expanded-view-panels--complete-reference)
12. [State Machine](#12-state-machine)
13. [Keyboard Shortcuts -- Docking](#13-keyboard-shortcuts--docking)
14. [IPC Communication Protocol](#14-ipc-communication-protocol)
15. [React Component Architecture](#15-react-component-architecture)
16. [Theme System](#16-theme-system)
17. [Accessibility](#17-accessibility)
18. [Performance Budget](#18-performance-budget)
19. [Multi-Monitor Support](#19-multi-monitor-support)
20. [Auto-Hide Behavior](#20-auto-hide-behavior)
21. [Responsive Breakpoints](#21-responsive-breakpoints)
22. [Complete ASCII Wireframes](#22-complete-ascii-wireframes)

---

## 1. Design Philosophy

The TimeWarp Bar is the persistent temporal control surface for Super-Goose. It must feel as natural as a taskbar while providing deep access to the full timeline engine. The bar occupies the space **between the main chat/editor content and the window edge**, never overlapping content.

### Core Principles

| Principle | Implementation |
|-----------|---------------|
| **Non-intrusive** | Slim mode consumes minimal space (24-40px horizontal, 40-60px vertical) |
| **Always accessible** | One click or shortcut from any dock position to full timeline features |
| **Spatially aware** | Adapts layout, orientation, and information density to dock position |
| **Seamless transitions** | Smooth 200ms spring animations when docking, expanding, or collapsing |
| **Context-preserving** | Remembers dock position, view mode, and scroll position per session |
| **Theme-coherent** | Inherits Super-Goose dark/light theme; never introduces its own chrome |

### Mental Model

```
                         ┌─ TOP DOCK ─────────────────────┐
                         │  Slim: status bar feel          │
                         │  Expanded: drops down like      │
                         │  Chrome DevTools at top         │
                         └────────────────────────────────┘

┌─ LEFT DOCK ──────┐                                 ┌─ RIGHT DOCK ─────┐
│  Slim: vertical   │     MAIN CONTENT AREA          │  Slim: vertical   │
│  sidebar strip    │     (Chat / Editor / Agent)     │  sidebar strip    │
│                   │                                 │                   │
│  Expanded: slides │                                 │  Expanded: slides │
│  out like VS Code │                                 │  out like VS Code │
│  panel            │                                 │  panel            │
└───────────────────┘                                 └───────────────────┘

                         ┌─ BOTTOM DOCK ──────────────────┐
                         │  Slim: macOS-style thin bar     │
                         │  Expanded: rises up like        │
                         │  video editor timeline          │
                         │  (DEFAULT -- matches original   │
                         │   spec behavior)                │
                         └────────────────────────────────┘
```

---

## 2. Dock Position System

### Supported Positions

| Position | Orientation | Slim Size | Expanded Size | Default |
|----------|------------|-----------|---------------|---------|
| `bottom` | Horizontal | 32px height | 80-200px height | YES |
| `top` | Horizontal | 32px height | 80-200px height | No |
| `left` | Vertical | 48px width | 240-400px width | No |
| `right` | Vertical | 48px width | 240-400px width | No |
| `float` | Either | 32px or 48px | 300x200 to 800x500 | No |

### Position Memory

```typescript
interface DockState {
  position: 'top' | 'bottom' | 'left' | 'right' | 'float';
  viewMode: 'slim' | 'expanded' | 'hidden';
  expandedSize: number;          // px -- height for horizontal, width for vertical
  floatBounds?: {                // only for float mode
    x: number;
    y: number;
    width: number;
    height: number;
  };
  autoHide: boolean;
  lastPosition: string;          // fallback on float close
  monitor: number;               // multi-monitor index
}
```

State is persisted to `localStorage` under key `timewarp-dock-state` and restored on app launch.

### Dock Zones (Snap Targets)

When the user drags the TimeWarp bar via its drag handle, semi-transparent dock zones appear at the window edges:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌─── TOP ZONE (full width, 40px tall) ─────────────────────────┐   │
│ │                    Drop here for TOP dock                     │   │
│ └───────────────────────────────────────────────────────────────┘   │
│                                                                     │
│ ┌──────┐                                              ┌──────┐     │
│ │ LEFT │            NO ZONE                           │RIGHT │     │
│ │ ZONE │            (main content)                    │ ZONE │     │
│ │40px  │                                              │40px  │     │
│ │wide  │                                              │wide  │     │
│ └──────┘                                              └──────┘     │
│                                                                     │
│ ┌─── BOTTOM ZONE (full width, 40px tall) ──────────────────────┐   │
│ │                    Drop here for BOTTOM dock                  │   │
│ └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Zone activation:**
- Zones appear with a 150ms fade-in when a drag enters the window area
- Active zone (cursor within 40px of edge) highlights with accent color at 30% opacity
- Zones show a dashed border and label: "Dock Top", "Dock Bottom", "Dock Left", "Dock Right"
- Dropping outside all zones enters **float mode**
- Zones disappear with 100ms fade-out when drag ends

---

## 3. Slim/Compact View -- Horizontal

**Applies to:** `top` and `bottom` dock positions
**Height:** 24-40px (default 32px)
**Layout direction:** Left to right, single row

### Layout

```
BOTTOM DOCK -- SLIM MODE (32px height)
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ⠿ │ ◉│ main │ 47/312 │ ◀ ▶ │ ✓3 ✗0 │ ↑2 ↓0 │ $0.42 │ ⏱ 3:22 │ ● idle │ ▲      │
└─────────────────────────────────────────────────────────────────────────────────────┘
 ^    ^   ^       ^       ^      ^        ^       ^        ^        ^        ^
 │    │   │       │       │      │        │       │        │        │        └─ Expand toggle
 │    │   │       │       │      │        │       │        │        └─ Agent activity
 │    │   │       │       │      │        │       │        └─ Session duration
 │    │   │       │       │      │        │       └─ Budget/cost indicator
 │    │   │       │       │      │        └─ Git sync (ahead/behind)
 │    │   │       │       │      └─ Test status (pass/fail)
 │    │   │       │       └─ Quick-jump (prev/next event)
 │    │   │       └─ Event counter
 │    │   └─ Branch name
 │    └─ Recording indicator (pulsing red dot)
 └─ Drag handle (for repositioning)

TOP DOCK -- SLIM MODE (32px height)
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ⠿ │ ◉│ main │ 47/312 │ ◀ ▶ │ ✓3 ✗0 │ ↑2 ↓0 │ $0.42 │ ⏱ 3:22 │ ● idle │ ▼      │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                                                              ^
                                                                              └─ Down arrow
                                                                                 (expand drops
                                                                                  downward)
```

### Segment Specifications (Horizontal Slim)

| Segment | Width | Content | Click Action | Tooltip | Priority |
|---------|-------|---------|-------------|---------|----------|
| **Drag Handle** | 16px | `⠿` grip dots | Begin dock drag | "Drag to reposition (or double-click to undock)" | Always |
| **Recording** | 12px | `◉` pulsing red / `○` gray / `⏸` yellow | Toggle recording | "Recording active (click to pause)" | Always |
| **Branch** | 40-80px | Truncated branch name | Open branch switcher | "Branch: main (click to switch)" | Always |
| **Event Counter** | 48px | `47/312` | Open jump-to dialog | "Event 47 of 312 (click to jump)" | Always |
| **Nav Buttons** | 48px | `◀ ▶` | Previous/Next event | "Previous event (Left) / Next event (Right)" | Always |
| **Test Status** | 48px | `✓3 ✗0` green/red | Open test runner | "Tests: 3 passed, 0 failed (click for details)" | >= 900px |
| **Git Sync** | 48px | `↑2 ↓0` / `✓ clean` | Open git panel | "Git: 2 ahead, 0 behind (click to sync)" | >= 1000px |
| **Cost** | 48px | `$0.42` | Open cost breakdown | "Session cost: $0.42 (click for breakdown)" | >= 1100px |
| **Duration** | 56px | `⏱ 3:22` | Open session info | "Session: 3h 22m (started 10:01 AM)" | >= 800px |
| **Agent Status** | 48px | `● idle` / `◉ working` / `⏸ paused` | No action | "Agent: idle" | >= 1200px |
| **Auto-backup** | 32px | `💾 2m` green / `💾 --` gray | Trigger backup | "Last backup: 2 minutes ago" | >= 1300px |
| **Expand Toggle** | 24px | `▲` (bottom) / `▼` (top) | Toggle expanded view | "Expand timeline (Ctrl+Shift+T)" | Always |

**Overflow behavior:** When window width is insufficient, segments hide right-to-left based on priority. The four "Always" segments (drag handle, recording, branch, event counter, expand toggle) never hide.

### Color Coding in Slim Mode

| Indicator | States & Colors |
|-----------|----------------|
| Recording dot | Red pulsing = recording, Yellow solid = paused, Gray = idle |
| Test status | Green text = all pass, Red text = failures exist, Gray = no tests |
| Git sync | Green = clean, Yellow = ahead only, Red = behind or conflict |
| Cost | White = under budget, Yellow = 75%+ budget, Red = over budget |
| Agent status | Green = idle/ready, Blue pulsing = working, Yellow = paused |
| Auto-backup | Green = recent (<5m), Yellow = stale (5-30m), Red = failed |

---

## 4. Slim/Compact View -- Vertical

**Applies to:** `left` and `right` dock positions
**Width:** 40-60px (default 48px)
**Layout direction:** Top to bottom, single column

### Layout

```
LEFT DOCK -- SLIM MODE (48px wide)        RIGHT DOCK -- SLIM MODE (48px wide)
┌──────┐                                   ┌──────┐
│  ⠿   │  ← Drag handle (horizontal)      │  ⠿   │
├──────┤                                   ├──────┤
│  ◉   │  ← Recording indicator            │  ◉   │
├──────┤                                   ├──────┤
│ main │  ← Branch (rotated -90deg)        │ main │
│      │     or abbreviated to icon         │      │
├──────┤                                   ├──────┤
│  47  │  ← Event count (current)          │  47  │
│ ───  │                                   │ ───  │
│ 312  │  ← Event count (total)            │ 312  │
├──────┤                                   ├──────┤
│  ▲   │  ← Previous event                 │  ▲   │
│  ▼   │  ← Next event                     │  ▼   │
├──────┤                                   ├──────┤
│ ✓ 3  │  ← Test pass count                │ ✓ 3  │
│ ✗ 0  │  ← Test fail count                │ ✗ 0  │
├──────┤                                   ├──────┤
│  ↑2  │  ← Git ahead                      │  ↑2  │
│  ↓0  │  ← Git behind                     │  ↓0  │
├──────┤                                   ├──────┤
│$0.42 │  ← Cost                            │$0.42 │
├──────┤                                   ├──────┤
│ 3:22 │  ← Duration                        │ 3:22 │
├──────┤                                   ├──────┤
│  ●   │  ← Agent status dot               │  ●   │
├──────┤                                   ├──────┤
│  💾  │  ← Backup status                   │  💾  │
├──────┤                                   ├──────┤
│  ▶   │  ← Expand (right, for left dock)  │  ◀   │  ← Expand (left, for right dock)
└──────┘                                   └──────┘
```

### Vertical Segment Specifications

| Segment | Height | Icon | Tooltip | Priority |
|---------|--------|------|---------|----------|
| **Drag Handle** | 20px | `⠿` horizontal grip | "Drag to reposition" | Always |
| **Recording** | 20px | `◉` / `○` / `⏸` | "Recording: active" | Always |
| **Branch** | 32px | Branch icon + 4-char abbrev | "Branch: main" | Always |
| **Event Count** | 40px | Stacked `47` / `312` | "Event 47 of 312" | Always |
| **Nav Prev** | 24px | `▲` | "Previous event (Up)" | Always |
| **Nav Next** | 24px | `▼` | "Next event (Down)" | Always |
| **Test Pass** | 20px | `✓ N` green | "N tests passed" | >= 600px tall |
| **Test Fail** | 20px | `✗ N` red | "N tests failed" | >= 600px tall |
| **Git Ahead** | 20px | `↑N` | "N commits ahead" | >= 700px tall |
| **Git Behind** | 20px | `↓N` | "N commits behind" | >= 700px tall |
| **Cost** | 24px | `$X.XX` | "Session cost" | >= 800px tall |
| **Duration** | 24px | `H:MM` | "Session duration" | >= 500px tall |
| **Agent Dot** | 20px | Colored dot | "Agent: idle/working/paused" | >= 400px tall |
| **Backup** | 20px | `💾` colored | "Last backup: Xm ago" | >= 900px tall |
| **Expand** | 24px | `▶` (left dock) / `◀` (right dock) | "Expand timeline" | Always |

**Overflow:** When window height is insufficient, segments hide bottom-to-top (from backup upward), keeping the six "Always" segments visible.

---

## 5. Expanded View -- Horizontal

**Applies to:** `top` and `bottom` dock positions
**Height:** 80-200px (default 140px, user-resizable via drag handle)
**This matches the original spec layout but adds the dock-position awareness.**

### Full Layout (Bottom Dock, Expanded)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ═══════════════════════════════ RESIZE HANDLE ═══════════════════════════════════════│
│                                                                                     │
│ ┌────────┐ ┌──────────────────────────────────────────────────────────┐ ┌─────────┐ │
│ │ZONE A  │ │                    ZONE B: TIMELINE                      │ │ ZONE C  │ │
│ │        │ │                                                          │ │         │ │
│ │CONTROL │ │ ┌─ TIME RULER ────────────────────────────────────────┐  │ │MINIMAP  │ │
│ │PANEL   │ │ │ |10:01|  |10:02|  |10:03|  ▼10:04  |10:05|        │  │ │         │ │
│ │        │ │ └────────────────────────────────────────────────────┘  │ │ ████    │ │
│ │ ⏮ ◀   │ │ ┌─ BRANCH TRACKS ─────────────────────────────────────┐ │ │ ███     │ │
│ │ ▶ ▶⏭  │ │ │ main:  ●──●──●──●──●──▼──●──●──●──●──●──●         │ │ │  ██     │ │
│ │        │ │ │ auth:       ╲──●──●──●                              │ │ │         │ │
│ │ 1x  ▾  │ │ │ cache:                  ╲──●──●                     │ │ │ [══]    │ │
│ │ Branch │ │ └─────────────────────────────────────────────────────┘ │ │         │ │
│ │ Search │ │ ┌─ DETAIL LANE ───────────────────────────────────────┐ │ │         │ │
│ │ Filter │ │ │ ▁▂▃▅▇█▇▅▃▁▁▁▂▃▅▇▇▅▃▁▁▁▁▁▂▅▇█████▇▅▃▂▁           │ │ │         │ │
│ │ ⊞ 📸 ★ │ │ └─────────────────────────────────────────────────────┘ │ │         │ │
│ └────────┘ └──────────────────────────────────────────────────────────┘ └─────────┘ │
│                                                                                     │
│ ┌─ ZONE D: STATUS / SLIM BAR ──────────────────────────────────────────────────┐    │
│ │ ⠿ │ ◉│ main │ E47/312 │ ✓3 ✗0 │ ↑2 ↓0 │ $0.42 │ ⏱ 3:22 │ ● idle │ ▼     │    │
│ └───────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Full Layout (Top Dock, Expanded)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ┌─ ZONE D: STATUS / SLIM BAR ──────────────────────────────────────────────────┐    │
│ │ ⠿ │ ◉│ main │ E47/312 │ ✓3 ✗0 │ ↑2 ↓0 │ $0.42 │ ⏱ 3:22 │ ● idle │ ▲     │    │
│ └───────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                     │
│ ┌────────┐ ┌──────────────────────────────────────────────────────────┐ ┌─────────┐ │
│ │ZONE A  │ │                    ZONE B: TIMELINE                      │ │ ZONE C  │ │
│ │CONTROL │ │  (Same layout as bottom dock expanded, mirrored)         │ │MINIMAP  │ │
│ │PANEL   │ │                                                          │ │         │ │
│ └────────┘ └──────────────────────────────────────────────────────────┘ └─────────┘ │
│                                                                                     │
│ ═══════════════════════════════ RESIZE HANDLE ═══════════════════════════════════════│
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Key difference:** When docked at top, the resize handle is at the BOTTOM edge and the slim bar is at the TOP. This ensures the content pushes downward naturally.

### Expanded Panel Contents (All Features)

The expanded horizontal view includes ALL features from the original spec:

| Zone | Content | Reference |
|------|---------|-----------|
| Zone A | Transport controls, branch selector, search, filter, zoom, snapshot, milestone | Original spec Section 2: Zone A |
| Zone B1 | Time ruler with adaptive ticks | Original spec Section 6 |
| Zone B2 | Multi-lane branch tracks with fork/merge connectors | Original spec Section 3 |
| Zone B3 | Detail lane (activity heatmap) | Original spec Section 2: Zone B3 |
| Zone C | Minimap with viewport bracket | Original spec Section 9 |
| Zone D | Status bar (slim mode content) -- always visible as bottom strip | Section 3 of this doc |

**Additional panels accessible from expanded view (fly-out overlays):**

| Panel | Trigger | Size | Position |
|-------|---------|------|----------|
| Event Inspector | Click event node or `Ctrl+I` | 300px tall | Above timeline (bottom dock) or below (top dock) |
| Snapshot Manager | Right-click > Snapshots or `Ctrl+Shift+S` | 250x400px | Popover near trigger |
| Auto-backup Controls | Click backup indicator | 200x300px | Popover near indicator |
| Git Integration | Click git sync indicator | 300x400px | Popover near indicator |
| Test Runner | Click test status | 300x400px | Popover near indicator |
| Build Status | Via expanded menu | 200x300px | Popover |
| Dependency Health | Via expanded menu | 300x400px | Popover |
| Security Scan | Via expanded menu | 300x400px | Popover |
| Cost Breakdown | Click cost indicator | 250x350px | Popover near indicator |
| Performance Metrics | Via expanded menu | 300x400px | Popover |
| Search/Filter | `Ctrl+F` or search icon | 400x48px | Overlay at top of timeline |
| Keyboard Shortcuts | `?` key | 500x600px | Modal overlay |

---

## 6. Expanded View -- Vertical

**Applies to:** `left` and `right` dock positions
**Width:** 240-400px (default 320px, user-resizable via drag handle on inner edge)

### Full Layout (Left Dock, Expanded)

```
┌──────────────────────────────────────────┐
│ ┌──────────────────────────────────────┐ │
│ │ ⠿ TIMEWARP       [slim] [x] [float] │ │  ← Header with controls
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ ◉ REC │ main │ E47/312              │ │  ← Status strip
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │         TRANSPORT CONTROLS            │ │
│ │     ⏮  ◀  ▶/⏸  ▶|  ⏭              │ │
│ │         Speed: 1x ▾                   │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │         VERTICAL TIMELINE             │ │
│ │                                       │ │
│ │  10:01  ●  main: file_write           │ │
│ │         │                              │ │
│ │  10:02  ◆  main: llm_call             │ │
│ │         │                              │ │
│ │  10:03  ■  main: cmd_exec             │ │
│ │         │╲                             │ │
│ │  10:03  │ ●  auth: file_write         │ │
│ │         │ │                            │ │
│ │  10:04  ▼ ●  auth: llm_call           │ │  ← Playhead position
│ │         │ │                            │ │
│ │  10:05  │ ●  auth: cmd_exec           │ │
│ │         │╱                             │ │
│ │  10:06  ⬡  main: git_op               │ │
│ │         │                              │ │
│ │  10:07  ●  main: file_write           │ │
│ │                                       │ │
│ │       [Load more...]                  │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ QUICK ACTIONS                         │ │
│ │ [Branch] [Merge] [Replay] [Snapshot] │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ INDICATORS                            │ │
│ │ Tests:  ✓ 3 passed  ✗ 0 failed       │ │
│ │ Git:    ↑ 2 ahead   ✓ clean          │ │
│ │ Cost:   $0.42 / $5.00 budget          │ │
│ │ Build:  ✓ passing                     │ │
│ │ Agent:  ● idle                        │ │
│ │ Backup: 💾 2m ago                     │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ SEARCH  [                    ] [Go]  │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ═ RESIZE HANDLE (drag left/right) ══════ │
└──────────────────────────────────────────┘
```

### Vertical Timeline Rendering

In vertical mode, the timeline rotates 90 degrees conceptually. Instead of horizontal branch tracks, events stack vertically in a scrollable list with the branch rail running down the left side.

```
Vertical timeline structure:

  TIME    RAIL     EVENT INFO
 ┌──────┬───────┬──────────────────────────────┐
 │10:01 │  ●────│  file_write: src/auth.rs     │
 │      │  │    │  +12 -4 lines                │
 │10:02 │  ◆────│  llm_call: claude-sonnet     │
 │      │  │    │  4,050 tokens, $0.012         │
 │10:03 │  ■────│  cmd_exec: cargo test        │
 │      │  │╲   │  ✓ exit 0 (2.3s)             │
 │      │  │ ●──│  [auth] file_write           │
 │      │  │ │  │  src/jwt.rs +23 lines        │
 │10:04 │  ▼ ●──│  [auth] llm_call              │  ← Playhead
 │      │  │ │  │  1,200 tokens                │
 │10:05 │  │ ●──│  [auth] cmd_exec             │
 │      │  │╱   │  ✓ exit 0                    │
 │10:06 │  ⬡────│  git_op: commit              │
 │      │  │    │  "feat: add JWT validation"  │
 └──────┴───────┴──────────────────────────────┘

Rail legend:
  │  = main branch (blue)
  │  = child branch (colored, indented)
  ╲  = fork from parent
  ╱  = merge to parent
  ▼  = playhead position
```

**Branch visualization in vertical mode:**
- Main branch rail: solid 2px line, left-aligned
- Child branches: indented 16px right per depth level, colored lines
- Fork: diagonal line from parent rail to child rail
- Merge: diagonal line from child rail back to parent rail
- Playhead: horizontal highlight bar spanning full width at current event

---

## 7. Floating/Detached Mode

When the user drags the bar outside all snap zones, or clicks the "float" button in expanded mode, the TimeWarp Bar becomes a floating window.

### Float Mode Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ⠿ TimeWarp                          [Dock ▾] [─] [□] [✕]      │  ← Title bar with dock menu
├─────────────────────────────────────────────────────────────────┤
│ ◉ REC │ main │ E47/312 │ ✓3 ✗0 │ ↑2 ↓0 │ $0.42 │ ⏱ 3:22    │  ← Status strip
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌──────┐ ┌─────────────────────────────────────┐ ┌───────────┐ │
│ │CTRL  │ │  TIMELINE (same as horizontal exp.) │ │  MINIMAP  │ │
│ │PANEL │ │  Tracks, events, ruler, playhead     │ │           │ │
│ └──────┘ └─────────────────────────────────────┘ └───────────┘ │
│                                                                 │
│ ▁▂▃▅▇█▇▅▃▁▁▁▂▃▅▇▇▅▃▁▁▁▁▁  Detail lane                       │
├─────────────────────────────────────────────────────────────────┤
│ ◀ E46 │ [Jump] [Branch] [Merge] [Replay] │ E48 ▶               │  ← Quick actions bar
└─────────────────────────────────────────────────────────────────┘
```

### Float Mode Properties

| Property | Value |
|----------|-------|
| Min size | 400 x 200px |
| Max size | Window width x Window height / 2 |
| Default size | 700 x 300px |
| Always on top | Optional (toggle in title bar) |
| Opacity | 100% default, 70% when not focused (optional) |
| Resizable | All edges and corners |
| Position memory | Saved per session |
| Title bar | Custom: drag handle + title + dock menu + window controls |

### Dock Menu in Float Mode

```
┌──────────────────────────┐
│ Dock To:                 │
│   ● Bottom (default)     │
│   ○ Top                  │
│   ○ Left                 │
│   ○ Right                │
│ ──────────────────────── │
│   Always on top    [ ]   │
│   Opacity: [████░] 70%   │
│ ──────────────────────── │
│   Close float            │
└──────────────────────────┘
```

---

## 8. Dock Transition System

### Animation Specifications

| Transition | Duration | Easing | Description |
|-----------|----------|--------|-------------|
| Dock to dock | 250ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring) | Moving between edge positions |
| Slim to expanded | 200ms | `ease-in-out` | Height/width growth animation |
| Expanded to slim | 150ms | `ease-in` | Height/width shrink animation |
| Dock to float | 300ms | `cubic-bezier(0.22, 1, 0.36, 1)` (decelerate) | Detach from edge, scale to float size |
| Float to dock | 250ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring) | Shrink and snap to edge |
| Horizontal to vertical | 300ms | `ease-in-out` | Full reflow (cross-fade content) |
| Auto-hide reveal | 150ms | `ease-out` | Slide in from edge |
| Auto-hide dismiss | 200ms | `ease-in` | Slide out to edge |

### Transition Sequence: Bottom Dock to Left Dock

```
Frame 0:     Bar is at bottom (horizontal, 32px tall)
Frame 1-5:   Bar detaches from bottom, shrinks to a 48x48 square
Frame 6-10:  Square slides to left edge
Frame 11-15: Square expands vertically to fill left edge height (48px wide)
Frame 16:    Content cross-fades from horizontal layout to vertical layout
Done:        Bar is docked left (vertical, 48px wide)

Total: 250ms
```

### Transition Sequence: Slim to Expanded (Bottom Dock)

```
Frame 0:     Slim bar at bottom (32px tall)
Frame 1-5:   Height animates from 32px to 140px (spring easing)
Frame 6-8:   Timeline content fades in (opacity 0 to 1)
Frame 9-10:  Track events render progressively (left to right reveal)
Done:        Full expanded view visible

Total: 200ms
```

---

## 9. Integration with Super-Goose Layout

### Electron Window Layout with Dockable TimeWarp

The TimeWarp Bar integrates into the Electron shell's flexbox layout. The Super-Goose desktop app uses a flex container, and the TimeWarp component occupies a flex-none position at the relevant edge.

```
BOTTOM DOCK (default):
┌─────────────────────────────────────────────────────────────────────┐
│ Title Bar                                                    ─ □ ✕ │
├─────────────────────────────────────────────────────────────────────┤
│ ┌───────────┬───────────────────────────────────────────────────┐   │
│ │           │                                                   │   │
│ │           │              MAIN CONTENT                         │   │
│ │  SIDEBAR  │              (flex: 1)                            │   │
│ │  (fixed   │              Chat / Editor / Agent                │   │
│ │   width)  │                                                   │   │
│ │           │                                                   │   │
│ │           │                                                   │   │
│ │           │                                                   │   │
│ │           │                                                   │   │
│ └───────────┴───────────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────────────────────┐   │
│ │            TIMEWARP BAR (flex: none, height: 32-200px)        │   │
│ └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

TOP DOCK:
┌─────────────────────────────────────────────────────────────────────┐
│ Title Bar                                                    ─ □ ✕ │
├─────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────────────┐   │
│ │            TIMEWARP BAR (flex: none, height: 32-200px)        │   │
│ └───────────────────────────────────────────────────────────────┘   │
│ ┌───────────┬───────────────────────────────────────────────────┐   │
│ │           │              MAIN CONTENT                         │   │
│ │  SIDEBAR  │              (flex: 1)                            │   │
│ │           │                                                   │   │
│ └───────────┴───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

LEFT DOCK:
┌─────────────────────────────────────────────────────────────────────┐
│ Title Bar                                                    ─ □ ✕ │
├─────────────────────────────────────────────────────────────────────┤
│ ┌──────┬──────────┬─────────────────────────────────────────────┐   │
│ │      │          │                                             │   │
│ │ TIME │          │           MAIN CONTENT                      │   │
│ │ WARP │ SIDEBAR  │           (flex: 1)                         │   │
│ │ BAR  │          │                                             │   │
│ │      │          │                                             │   │
│ │48-   │          │                                             │   │
│ │400px │          │                                             │   │
│ │      │          │                                             │   │
│ └──────┴──────────┴─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

RIGHT DOCK:
┌─────────────────────────────────────────────────────────────────────┐
│ Title Bar                                                    ─ □ ✕ │
├─────────────────────────────────────────────────────────────────────┤
│ ┌───────────┬─────────────────────────────────────────┬──────┐     │
│ │           │                                         │      │     │
│ │           │         MAIN CONTENT                    │ TIME │     │
│ │  SIDEBAR  │         (flex: 1)                       │ WARP │     │
│ │           │                                         │ BAR  │     │
│ │           │                                         │      │     │
│ │           │                                         │48-   │     │
│ │           │                                         │400px │     │
│ └───────────┴─────────────────────────────────────────┴──────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

### CSS Flexbox Strategy

```css
/* Main app container */
.app-container {
  display: flex;
  flex-direction: column;  /* default: top dock or bottom dock */
  height: 100vh;
  overflow: hidden;
}

/* When left/right dock */
.app-container.dock-left,
.app-container.dock-right {
  flex-direction: row;
}

/* Content area */
.content-area {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* TimeWarp Bar */
.timewarp-bar {
  flex: none;
  transition: all 200ms ease-in-out;
  z-index: 100;
}

/* Position-specific sizing */
.timewarp-bar.dock-bottom,
.timewarp-bar.dock-top {
  width: 100%;
  height: var(--tw-bar-height, 32px);
}

.timewarp-bar.dock-left,
.timewarp-bar.dock-right {
  height: 100%;
  width: var(--tw-bar-width, 48px);
}

/* Expanded states */
.timewarp-bar.expanded.dock-bottom,
.timewarp-bar.expanded.dock-top {
  height: var(--tw-expanded-height, 140px);
}

.timewarp-bar.expanded.dock-left,
.timewarp-bar.expanded.dock-right {
  width: var(--tw-expanded-width, 320px);
}
```

### Interaction with Chat Input Box

The TimeWarp bar must never overlap the chat input. The layout hierarchy ensures this:

```
BOTTOM DOCK:

  ┌─────────────────────────────────────────┐
  │                                         │
  │         CHAT MESSAGES                   │  ← Scrollable, flex: 1
  │         (scrolls up)                    │
  │                                         │
  ├─────────────────────────────────────────┤
  │  [Type your message...        ] [Send]  │  ← Chat input, flex: none
  ├═════════════════════════════════════════┤
  │  TIMEWARP BAR                           │  ← TimeWarp, flex: none
  └─────────────────────────────────────────┘

  The chat input box sits ABOVE the TimeWarp bar.
  Expanding TimeWarp pushes the chat input up,
  reducing the message scroll area but never
  overlapping the input.
```

---

## 10. Slim View Indicators -- Complete Reference

### Recording Indicator

```
States:
  ◉  Pulsing red       Recording active (agent session in progress)
  ⏸  Solid yellow      Recording paused (user-initiated pause)
  ○  Dim gray          Idle (no active session)
  🔄 Spinning blue     Replay mode active
  ⚠  Flashing red      Recording error (event capture failed)

Animation (recording):
  - 1000ms pulse cycle: opacity 1.0 → 0.4 → 1.0
  - CSS: animation: recording-pulse 1s ease-in-out infinite
```

### Branch Indicator

```
Display:
  Horizontal: "main" (truncated to fit, max ~80px)
  Vertical:   "main" (rotated text or abbreviation "M")

Color:
  - Text color matches branch rail color from palette
  - Electric Blue (#4A9EFF) for main
  - Branch colors follow original spec Section 7

Click action: Opens branch switcher dropdown (from original spec)
```

### Event Counter

```
Format:
  Horizontal: "47/312"
  Vertical:   "47" over "312" (stacked)

Colors:
  - Current event number: white/bright
  - Total: dimmed gray
  - Separator: dimmed

Click: Opens jump-to-event dialog (Ctrl+G)
```

### Quick-Jump Buttons

```
Horizontal: ◀ ▶  (inline, 24px each)
Vertical:   ▲ ▼  (stacked, 24px each)

Behavior:
  - Click ◀/▲: Move to previous event, update playhead
  - Click ▶/▼: Move to next event, update playhead
  - Hold (>500ms): Auto-advance at 2 events/second
  - Hold + Shift: Auto-advance at 10 events/second
  - Disabled state: dimmed when at first/last event

Shortcuts: Arrow Left/Right (horizontal), Arrow Up/Down (vertical)
```

### Test Status Indicator

```
Format:
  Horizontal: "✓3 ✗0" or "✓ Pass" or "✗ 2 fail"
  Vertical:   "✓3" over "✗0" (stacked)

States:
  All pass:    ✓ N  (green text, green dot)
  Has failures: ✗ N  (red text, red dot)
  Running:     ⟳    (blue spinning, text "running")
  No tests:    ─    (gray dash)

Click: Opens test runner panel (popover in expanded mode, modal in slim)
Data source: IPC event 'timewarp:test-status' from goosed backend
```

### Git Sync Status

```
Format:
  Horizontal: "↑2 ↓0" or "✓ clean" or "⚠ conflict"
  Vertical:   "↑2" over "↓0" (stacked)

States:
  Clean:       ✓ clean   (green)
  Ahead only:  ↑N        (yellow)
  Behind only: ↓N        (orange)
  Diverged:    ↑N ↓M     (red)
  Conflict:    ⚠ conflict (red flashing)
  Detached:    ⊘ detached (gray)
  Untracked:   ? dirty   (yellow)

Click: Opens git integration panel
Data source: IPC event 'timewarp:git-status' from goosed backend
```

### Budget/Cost Indicator

```
Format:
  Horizontal: "$0.42"
  Vertical:   "$0.42" (potentially truncated to "$0.4")

Color thresholds (configurable):
  < 50% of budget:  white/default
  50-75% of budget:  yellow
  75-100% of budget: orange
  > 100% of budget:  red
  No budget set:     white/default

Click: Opens cost breakdown popover showing per-model costs
Data source: IPC event 'timewarp:cost-update' from observability module
```

### Session Duration

```
Format:
  Horizontal: "⏱ 3:22" (hours:minutes) or "⏱ 45m" (under 1 hour)
  Vertical:   "3:22" (no icon, save width)

Updates: Every 60 seconds
Click: Opens session info popover (start time, event rate, etc.)
```

### Agent Activity Indicator

```
States:
  ● idle      Green solid dot    Agent ready, not executing
  ◉ working   Blue pulsing dot   Agent executing tool calls
  ⏸ paused    Yellow solid dot   Agent paused (user-initiated)
  ⚠ error     Red flashing dot   Agent encountered an error
  ○ offline   Gray hollow dot    Agent not connected

Animation (working):
  - 800ms pulse: scale 1.0 → 1.3 → 1.0 + opacity 1.0 → 0.6 → 1.0
```

### Auto-Backup Status

```
Format:
  Horizontal: "💾 2m" (time since last backup)
  Vertical:   "💾" with colored dot

States:
  Recent (<5m):    💾 green    "Last backup: 2 minutes ago"
  Stale (5-30m):   💾 yellow   "Last backup: 15 minutes ago"
  Old (>30m):      💾 red      "Last backup: 45 minutes ago -- backup may be needed"
  Failed:          💾 red ⚠    "Backup failed: disk full"
  Disabled:        💾 gray     "Auto-backup disabled"
  In progress:     💾 blue ⟳   "Backing up..."

Click: Triggers immediate backup, or opens backup settings if Shift held
Data source: IPC event 'timewarp:backup-status'
```

---

## 11. Expanded View Panels -- Complete Reference

### Full Timeline (Horizontal Expanded)

Inherits all features from the original `TIMEWARP_BAR_UI_UX_SPEC.md`:

- Zone A: Transport controls (Section 2)
- Zone B1: Time ruler (Section 6)
- Zone B2: Branch tracks (Section 3)
- Zone B3: Detail lane (Section 2)
- Zone C: Minimap (Section 9)
- Zone D: Status bar (Section 2)

### Event Inspector (Fly-out Panel)

```
Triggered: Click event node, or Ctrl+I
Position:  Above timeline (bottom dock) / Below (top dock) / Overlay (left/right dock)
Height:    120-300px (resizable)

┌─────────────────────────────────────────────────────────────────────┐
│ EVENT INSPECTOR: E47 cmd_exec                         [Tabs] [✕]    │
├─ [Summary] [Diff] [LLM] [Meta] [Actions] ──────────────────────────┤
│                                                                     │
│  Command:   cargo test --release                                    │
│  Branch:    main                                                    │
│  Time:      10:03:47 AM (2.3s duration)                             │
│  Status:    ✓ Success (exit code 0)                                 │
│  Files:     3 modified                                              │
│  Score:     Reproducibility: 0.95                                   │
│                                                                     │
│  [Jump Here] [Branch from Here] [Replay] [Compare] [Export]        │
└─────────────────────────────────────────────────────────────────────┘
```

### Snapshot Management Panel

```
Triggered: Ctrl+Shift+S or context menu
Type:      Popover (280x400px)

┌──────────────────────────────────┐
│ SNAPSHOT MANAGER              ✕  │
├──────────────────────────────────┤
│ Auto-backup: ● Enabled           │
│ Interval:    [5 min ▾]           │
│ Max storage: [1 GB ▾]            │
│ Current:     247 MB used          │
├──────────────────────────────────┤
│ Recent Snapshots:                 │
│ S47  10:03:47  12.4 MB  delta    │
│ S46  10:02:12  12.3 MB  delta    │
│ S40  09:58:00  45.2 MB  full     │
│ S30  09:45:00  44.1 MB  full     │
│ S1   09:00:00  38.7 MB  full     │
├──────────────────────────────────┤
│ [Take Snapshot Now]              │
│ [Export Latest] [Clean Old]      │
└──────────────────────────────────┘
```

### Git Integration Panel

```
Triggered: Click git status indicator
Type:      Popover (320x400px)

┌──────────────────────────────────────┐
│ GIT INTEGRATION                   ✕  │
├──────────────────────────────────────┤
│ Repository: goose                     │
│ Branch:     feature/auth-jwt          │
│ Remote:     origin/feature/auth-jwt   │
│ Status:     ↑ 2 ahead, ✓ clean       │
├──────────────────────────────────────┤
│ Uncommitted TimeWarp Events: 47       │
│ Last git commit: E30 (10:00 AM)      │
│ Events since commit: 17              │
├──────────────────────────────────────┤
│ TimeWarp → Git Sync:                 │
│ ○ Auto-commit on milestone           │
│ ● Manual commit only                 │
│ ○ Auto-commit every N events         │
├──────────────────────────────────────┤
│ [Commit Now] [Push] [Pull] [Stash]  │
└──────────────────────────────────────┘
```

### Test Runner Panel

```
Triggered: Click test status indicator
Type:      Popover (320x400px)

┌──────────────────────────────────────┐
│ TEST RUNNER                       ✕  │
├──────────────────────────────────────┤
│ Last Run: 10:03:47 AM (2.3s)        │
│ Result:   ✓ 47 passed  ✗ 0 failed   │
│                                      │
│ Test suites:                         │
│ ✓ auth_tests        (12 tests)      │
│ ✓ config_tests      (8 tests)       │
│ ✓ integration_tests (15 tests)      │
│ ✓ unit_tests        (12 tests)      │
├──────────────────────────────────────┤
│ Auto-run:                            │
│ ● After every file_write event       │
│ ○ After every N events               │
│ ○ Manual only                        │
├──────────────────────────────────────┤
│ [Run Now] [Run Failed Only] [Config] │
└──────────────────────────────────────┘
```

### Build Status Panel

```
Triggered: Expanded menu > Build Status
Type:      Popover (280x300px)

┌──────────────────────────────────────┐
│ BUILD STATUS                      ✕  │
├──────────────────────────────────────┤
│ Last Build: 10:01:00 AM             │
│ Result:     ✓ Passing                │
│ Duration:   42s                      │
│ Warnings:   3                        │
│                                      │
│ Targets:                             │
│ ✓ goose-cli    (release)             │
│ ✓ goose-server (release)             │
│ ⚠ goose-bench  (3 warnings)         │
├──────────────────────────────────────┤
│ [Build Now] [Clean Build] [Logs]    │
└──────────────────────────────────────┘
```

### Dependency Health Panel

```
Triggered: Expanded menu > Dependency Health
Type:      Popover (320x400px)

┌──────────────────────────────────────┐
│ DEPENDENCY HEALTH                 ✕  │
├──────────────────────────────────────┤
│ Total deps: 142                      │
│ Outdated:   8                        │
│ Vulnerable: 1 (low severity)        │
│ Audited:    10:00 AM today           │
│                                      │
│ ⚠ Vulnerable:                       │
│   regex 1.9.0 → 1.10.2 (CVE-...)   │
│                                      │
│ Outdated:                            │
│   tokio  1.35 → 1.36                │
│   serde  1.0.195 → 1.0.197          │
│   ...6 more                          │
├──────────────────────────────────────┤
│ [Audit Now] [Update All] [Details]  │
└──────────────────────────────────────┘
```

### Security Scan Panel

```
Triggered: Expanded menu > Security Scan
Type:      Popover (320x400px)

┌──────────────────────────────────────┐
│ SECURITY SCAN                     ✕  │
├──────────────────────────────────────┤
│ Last Scan: 09:55 AM                  │
│ Status:    ✓ No issues found         │
│                                      │
│ Checks:                              │
│ ✓ Dependency vulnerabilities (0)    │
│ ✓ Secret detection (0 secrets)      │
│ ✓ Code patterns (0 issues)          │
│ ✓ Permission audit (clean)          │
├──────────────────────────────────────┤
│ Guardrails:                          │
│ ✓ PII detection: active             │
│ ✓ Prompt injection: active          │
│ ✓ Jailbreak detection: active       │
├──────────────────────────────────────┤
│ [Scan Now] [Configure] [History]    │
└──────────────────────────────────────┘
```

### Cost Breakdown Panel

```
Triggered: Click cost indicator
Type:      Popover (280x350px)

┌──────────────────────────────────────┐
│ COST TRACKING                     ✕  │
├──────────────────────────────────────┤
│ Session Total: $0.42                 │
│ Budget:        $5.00 (8% used)       │
│ ████░░░░░░░░░░░░░░░░░░░░░░  8%     │
│                                      │
│ By Model:                            │
│ claude-sonnet-4  $0.35 (83%)         │
│ claude-haiku     $0.07 (17%)         │
│                                      │
│ By Branch:                           │
│ main      $0.28  (67%)               │
│ auth/jwt  $0.14  (33%)               │
│                                      │
│ Token Usage:                         │
│ Input:  45,200 tokens                │
│ Output: 12,800 tokens                │
│ Cached: 8,300 tokens (saved $0.08)  │
├──────────────────────────────────────┤
│ [Set Budget] [Export Report] [Reset] │
└──────────────────────────────────────┘
```

### Performance Metrics Panel

```
Triggered: Expanded menu > Performance
Type:      Popover (320x400px)

┌──────────────────────────────────────┐
│ PERFORMANCE METRICS               ✕  │
├──────────────────────────────────────┤
│ Event Rate:  2.1 events/minute       │
│ Avg Latency: 1.2s per LLM call      │
│ P95 Latency: 3.8s                    │
│ Throughput:  142 events this session │
│                                      │
│ Timeline Performance:                │
│ Render time:  8ms (target: <16ms)   │
│ Scroll FPS:   60 (target: 60)       │
│ Memory:       42 MB                  │
│                                      │
│ Agent Performance:                   │
│ Tool calls:   89                     │
│ Success rate:  96%                   │
│ Avg duration:  1.8s per tool call   │
│                                      │
│ Replay Score:  0.94 (high)          │
├──────────────────────────────────────┤
│ [Refresh] [Export] [Baseline]       │
└──────────────────────────────────────┘
```

### Keyboard Shortcuts Overlay

```
Triggered: ? key or Help > Shortcuts
Type:      Modal overlay (600x500px, centered)

┌─────────────────────────────────────────────────────────────────┐
│ KEYBOARD SHORTCUTS                                           ✕  │
├──────────────────────────┬──────────────────────────────────────┤
│ NAVIGATION               │ DOCKING                              │
│ ←/→     Prev/Next event  │ Ctrl+Shift+T  Toggle slim/expanded  │
│ Home    First event       │ Ctrl+Shift+H  Hide/show bar         │
│ End     Latest event      │ Ctrl+Shift+1  Dock bottom           │
│ Ctrl+G  Jump to event     │ Ctrl+Shift+2  Dock top              │
│ Space   Play/Pause        │ Ctrl+Shift+3  Dock left             │
│                           │ Ctrl+Shift+4  Dock right            │
│ BRANCHING                 │ Ctrl+Shift+5  Float                 │
│ J       Jump to selected  │                                     │
│ B       Branch from here  │ VIEW                                │
│ Ctrl+B  Branch switcher   │ Ctrl+I  Toggle inspector            │
│ R       Replay from here  │ Ctrl+0  Zoom fit all                │
│ Ctrl+M  Merge branch      │ Ctrl+=  Zoom in                     │
│                           │ Ctrl+-  Zoom out                    │
│ EDITING                   │ Ctrl+F  Search events               │
│ N       Add note          │ F       Filter events               │
│ M       Toggle bookmark   │ D       Show diff                   │
│ T       Add tag           │                                     │
│ Ctrl+Shift+S  Snapshot    │ DATA                                │
│ Ctrl+Shift+V  Verify      │ Ctrl+E  Export selected             │
│                           │ Ctrl+Shift+E  Export timeline       │
└──────────────────────────┴──────────────────────────────────────┘
```

---

## 12. State Machine

### View State Machine

```
                    Ctrl+Shift+H
         ┌──────────────────────────────┐
         │                              │
         ▼                              │
      ┌──────┐   Ctrl+Shift+H    ┌─────┴──┐
      │HIDDEN│ ─────────────────▶ │  SLIM  │
      └──────┘                    └───┬────┘
                                      │
                          Ctrl+Shift+T│ or click expand
                                      │
                                 ┌────▼─────┐
                                 │ EXPANDED  │
                                 └────┬─────┘
                                      │
                          Ctrl+Shift+T│ cycles back
                                      │
                                 ┌────▼────┐
                                 │  SLIM   │
                                 └─────────┘
```

### Dock Position State Machine

```
                     drag + drop in zone
     ┌────────────────────────────────────────────┐
     │                                            │
     ▼          drag to zone                      │
  ┌──────┐ ──────────────────▶ ┌──────┐          │
  │BOTTOM│                     │ TOP  │          │
  └──┬───┘ ◀────────────────── └──┬───┘          │
     │       drag to zone         │               │
     │                            │               │
     │  drag to zone              │ drag to zone  │
     │                            │               │
     ▼                            ▼               │
  ┌──────┐                     ┌──────┐          │
  │ LEFT │                     │RIGHT │          │
  └──┬───┘                     └──┬───┘          │
     │                            │               │
     │    drop outside zones      │               │
     └────────────┬───────────────┘               │
                  │                                │
                  ▼                                │
              ┌───────┐    dock menu selection     │
              │ FLOAT │ ─────────────────────────┘
              └───────┘
```

### Complete State

```typescript
interface TimeWarpBarState {
  // Position
  dock: DockPosition;       // 'top' | 'bottom' | 'left' | 'right' | 'float'

  // View mode
  view: ViewMode;           // 'hidden' | 'slim' | 'expanded'

  // Sizes (persisted)
  expandedHeight: number;   // for horizontal docks (80-200px)
  expandedWidth: number;    // for vertical docks (240-400px)
  floatBounds: Rect;        // for float mode

  // Auto-hide
  autoHide: boolean;
  autoHideDelay: number;    // ms before hiding (default 2000)

  // Content state
  scrollPosition: number;   // timeline scroll offset
  zoomLevel: number;        // current zoom
  selectedEventId: string | null;
  playheadPosition: number; // event index

  // Inspector
  inspectorOpen: boolean;
  inspectorTab: string;     // 'summary' | 'diff' | 'llm' | 'meta' | 'actions'

  // Recording
  recordingState: 'recording' | 'paused' | 'idle' | 'replaying' | 'error';
}
```

---

## 13. Keyboard Shortcuts -- Docking

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+T` | Cycle view mode: Slim -> Expanded -> Slim |
| `Ctrl+Shift+H` | Toggle visibility: Slim <-> Hidden |
| `Ctrl+Shift+1` | Dock to bottom |
| `Ctrl+Shift+2` | Dock to top |
| `Ctrl+Shift+3` | Dock to left |
| `Ctrl+Shift+4` | Dock to right |
| `Ctrl+Shift+5` | Float mode |
| `Ctrl+Shift+W` | Pop out to separate window (Electron BrowserWindow) |
| `Ctrl+Shift+D` | Toggle detail lane |
| `Ctrl+I` | Toggle event inspector |
| `?` | Show keyboard shortcuts overlay |

All shortcuts from the original spec (Section 12) remain active.

---

## 14. IPC Communication Protocol

The TimeWarp Bar communicates with the goosed backend via Electron IPC channels.

### Channel Map

```typescript
// Renderer -> Main -> goosed
const IPC_CHANNELS = {
  // Timeline data
  'timewarp:get-events':      'Request paginated events',
  'timewarp:get-branches':    'Request branch list',
  'timewarp:get-event-detail': 'Request full event details',

  // Actions
  'timewarp:jump-to-event':   'Restore workspace to event state',
  'timewarp:branch-from':     'Create branch from event',
  'timewarp:merge-branch':    'Merge branch into target',
  'timewarp:replay-range':    'Replay event range',
  'timewarp:take-snapshot':   'Manual snapshot trigger',
  'timewarp:set-milestone':   'Mark event as milestone',

  // Status updates (goosed -> Renderer, push)
  'timewarp:new-event':       'New event recorded',
  'timewarp:recording-state': 'Recording state changed',
  'timewarp:test-status':     'Test run completed',
  'timewarp:git-status':      'Git status changed',
  'timewarp:cost-update':     'Cost data updated',
  'timewarp:backup-status':   'Backup status changed',
  'timewarp:agent-status':    'Agent activity changed',
  'timewarp:build-status':    'Build completed',
  'timewarp:security-scan':   'Security scan results',
  'timewarp:dep-health':      'Dependency health check',
  'timewarp:perf-metrics':    'Performance metrics update',

  // Dock management
  'timewarp:dock-position':   'Dock position changed (persisted)',
  'timewarp:view-mode':       'View mode changed',
};
```

### Event Data Shapes

```typescript
interface TimeWarpEvent {
  id: string;
  type: EventType;
  branch: string;
  timestamp: string;        // ISO 8601
  duration_ms: number;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  files_changed: FileChange[];
  snapshot_id: string | null;
  hash: string;
  parent_hash: string;
  metadata: Record<string, any>;
}

interface TimeWarpStatus {
  recording: 'recording' | 'paused' | 'idle' | 'replaying' | 'error';
  branch: string;
  event_count: number;
  total_events: number;
  session_duration_secs: number;
  cost_usd: number;
  budget_usd: number | null;
  test_pass: number;
  test_fail: number;
  git_ahead: number;
  git_behind: number;
  git_status: 'clean' | 'dirty' | 'conflict' | 'detached';
  agent_status: 'idle' | 'working' | 'paused' | 'error' | 'offline';
  last_backup_secs: number | null;
  backup_status: 'ok' | 'stale' | 'failed' | 'disabled';
  build_status: 'passing' | 'failing' | 'unknown';
  security_issues: number;
  dep_outdated: number;
  dep_vulnerable: number;
}
```

---

## 15. React Component Architecture

### Component Tree

```
<TimeWarpProvider>                          // Context: dock state, events, status
  <TimeWarpBar>                            // Main container (position-aware)
    <DockDragHandler>                      // Handles dock zone detection & drag

    {view === 'slim' && (
      <SlimView orientation={orientation}>  // Horizontal or vertical layout
        <DragHandle />
        <RecordingIndicator />
        <BranchIndicator />
        <EventCounter />
        <QuickJumpButtons />
        <TestStatusIndicator />
        <GitSyncIndicator />
        <CostIndicator />
        <DurationIndicator />
        <AgentStatusIndicator />
        <BackupIndicator />
        <ExpandToggle />
      </SlimView>
    )}

    {view === 'expanded' && orientation === 'horizontal' && (
      <ExpandedHorizontalView>
        <ResizeHandle edge={dock === 'bottom' ? 'top' : 'bottom'} />
        <SlimView />                        // Status bar within expanded view
        <TimelineViewport>
          <TransportControls />             // Zone A
          <TimeRuler />                     // Zone B1
          <BranchTracks />                  // Zone B2 (Canvas)
          <DetailLane />                    // Zone B3
          <Playhead />
          <Minimap />                       // Zone C
        </TimelineViewport>
      </ExpandedHorizontalView>
    )}

    {view === 'expanded' && orientation === 'vertical' && (
      <ExpandedVerticalView>
        <ResizeHandle edge={dock === 'left' ? 'right' : 'left'} />
        <VerticalStatusStrip />
        <TransportControls layout="compact" />
        <VerticalTimeline>                  // Scrollable list
          <VerticalEventNode />             // Per event
          <VerticalBranchRail />            // Rail visualization
          <VerticalPlayhead />
        </VerticalTimeline>
        <QuickActions layout="wrap" />
        <IndicatorsPanel />
        <SearchBar />
      </ExpandedVerticalView>
    )}

    {/* Popover panels (rendered via portal) */}
    <EventInspectorPanel />
    <SnapshotManagerPanel />
    <GitIntegrationPanel />
    <TestRunnerPanel />
    <BuildStatusPanel />
    <DependencyHealthPanel />
    <SecurityScanPanel />
    <CostBreakdownPanel />
    <PerformanceMetricsPanel />
    <BranchSwitcherDropdown />
    <JumpToEventDialog />
    <KeyboardShortcutsOverlay />
    <SearchFilterBar />

  </TimeWarpBar>
</TimeWarpProvider>
```

### Key Hooks

```typescript
// Custom hooks for TimeWarp state management

useTimeWarpDock()         // Dock position, transitions, drag handling
useTimeWarpEvents()       // Event stream, pagination, search
useTimeWarpStatus()       // Real-time status indicators
useTimeWarpPlayhead()     // Playhead position, navigation
useTimeWarpBranches()     // Branch list, switcher, operations
useTimeWarpKeyboard()     // Keyboard shortcut registration
useTimeWarpPersistence()  // LocalStorage state persistence
useTimeWarpIPC()          // Electron IPC communication
useTimeWarpTheme()        // Theme-aware styling
useTimeWarpA11y()         // Accessibility state (reduced motion, screen reader)
```

### File Structure

```
ui/desktop/src/components/TimeWarp/
  index.tsx                       // Main export
  TimeWarpProvider.tsx            // Context provider
  TimeWarpBar.tsx                 // Container (dock-aware)

  slim/
    SlimView.tsx                  // Slim mode container
    DragHandle.tsx                // Dock repositioning
    RecordingIndicator.tsx        // Recording dot
    BranchIndicator.tsx           // Branch name
    EventCounter.tsx              // Event N/M
    QuickJumpButtons.tsx          // Prev/Next
    TestStatusIndicator.tsx       // Test pass/fail
    GitSyncIndicator.tsx          // Git ahead/behind
    CostIndicator.tsx             // Budget/cost
    DurationIndicator.tsx         // Session time
    AgentStatusIndicator.tsx      // Agent activity
    BackupIndicator.tsx           // Auto-backup
    ExpandToggle.tsx              // Expand button

  expanded/
    horizontal/
      ExpandedHorizontalView.tsx  // Horizontal expanded container
      TimelineViewport.tsx        // Canvas-based timeline
      TransportControls.tsx       // Play/pause/step
      TimeRuler.tsx               // Time markers
      BranchTracks.tsx            // Multi-lane tracks (Canvas)
      DetailLane.tsx              // Activity heatmap
      Playhead.tsx                // Current position
      Minimap.tsx                 // Overview bracket

    vertical/
      ExpandedVerticalView.tsx    // Vertical expanded container
      VerticalTimeline.tsx        // Scrollable event list
      VerticalEventNode.tsx       // Single event row
      VerticalBranchRail.tsx      // Rail visualization
      VerticalPlayhead.tsx        // Horizontal highlight
      QuickActions.tsx            // Action buttons
      IndicatorsPanel.tsx         // Status summary

  panels/
    EventInspectorPanel.tsx       // Tabbed event details
    SnapshotManagerPanel.tsx      // Snapshot CRUD
    GitIntegrationPanel.tsx       // Git operations
    TestRunnerPanel.tsx           // Test results
    BuildStatusPanel.tsx          // Build info
    DependencyHealthPanel.tsx     // Dep audit
    SecurityScanPanel.tsx         // Security results
    CostBreakdownPanel.tsx        // Cost per model/branch
    PerformanceMetricsPanel.tsx   // Perf dashboard
    BranchSwitcherDropdown.tsx    // Branch picker
    JumpToEventDialog.tsx         // Jump to event N
    KeyboardShortcutsOverlay.tsx  // Shortcut reference
    SearchFilterBar.tsx           // Search + filter

  shared/
    ResizeHandle.tsx              // Drag-to-resize
    DockDragHandler.tsx           // Dock zone detection
    DockZoneOverlay.tsx           // Snap zone visuals
    ContextMenus.tsx              // Right-click menus
    Tooltips.tsx                  // Hover tooltips

  hooks/
    useTimeWarpDock.ts
    useTimeWarpEvents.ts
    useTimeWarpStatus.ts
    useTimeWarpPlayhead.ts
    useTimeWarpBranches.ts
    useTimeWarpKeyboard.ts
    useTimeWarpPersistence.ts
    useTimeWarpIPC.ts
    useTimeWarpTheme.ts
    useTimeWarpA11y.ts

  types/
    index.ts                      // All TypeScript interfaces
    events.ts                     // Event types
    dock.ts                       // Dock position types
    status.ts                     // Status indicator types

  utils/
    animations.ts                 // Spring/easing functions
    canvas-renderer.ts            // Canvas drawing utilities
    text-search.ts                // Event search logic
    time-format.ts                // Duration/timestamp formatting

  __tests__/
    TimeWarpBar.test.tsx
    SlimView.test.tsx
    ExpandedHorizontalView.test.tsx
    ExpandedVerticalView.test.tsx
    DockDragHandler.test.tsx
    useTimeWarpDock.test.ts
```

---

## 16. Theme System

### Dark Theme (Default)

```css
:root[data-theme="dark"] {
  /* Bar surfaces */
  --tw-bg-primary:    #0F1219;
  --tw-bg-secondary:  #141A24;
  --tw-bg-tertiary:   #1A2230;
  --tw-bg-hover:      #1E2A3A;

  /* Text */
  --tw-text-primary:  #E0E8F0;
  --tw-text-secondary: #8899AA;
  --tw-text-dim:      #556677;

  /* Borders */
  --tw-border:        #2A3444;
  --tw-border-focus:  #4A9EFF;

  /* Indicators */
  --tw-recording-red:  #FF4444;
  --tw-success-green:  #4AFF8E;
  --tw-warning-yellow: #FFD74A;
  --tw-error-red:      #FF4A4A;
  --tw-info-blue:      #4A9EFF;
  --tw-working-blue:   #4A9EFF;

  /* Playhead */
  --tw-playhead:      #FFFFFF;
  --tw-playhead-glow: rgba(74, 158, 255, 0.25);

  /* Resize handles */
  --tw-resize-handle: #2A3444;
  --tw-resize-hover:  #4A9EFF;

  /* Dock zones */
  --tw-dock-zone:     rgba(74, 158, 255, 0.15);
  --tw-dock-active:   rgba(74, 158, 255, 0.30);
}
```

### Light Theme

```css
:root[data-theme="light"] {
  --tw-bg-primary:    #F5F7FA;
  --tw-bg-secondary:  #FFFFFF;
  --tw-bg-tertiary:   #EDF0F5;
  --tw-bg-hover:      #E8ECF2;

  --tw-text-primary:  #1A1A2E;
  --tw-text-secondary: #556677;
  --tw-text-dim:      #8899AA;

  --tw-border:        #D0D8E0;
  --tw-border-focus:  #2D7BE5;

  --tw-recording-red:  #DC2626;
  --tw-success-green:  #16A34A;
  --tw-warning-yellow: #CA8A04;
  --tw-error-red:      #DC2626;
  --tw-info-blue:      #2D7BE5;
  --tw-working-blue:   #2D7BE5;

  --tw-playhead:      #1A1A2E;
  --tw-playhead-glow: rgba(45, 123, 229, 0.20);

  --tw-resize-handle: #D0D8E0;
  --tw-resize-hover:  #2D7BE5;

  --tw-dock-zone:     rgba(45, 123, 229, 0.10);
  --tw-dock-active:   rgba(45, 123, 229, 0.25);
}
```

### Theme Detection

```typescript
// Inherits Super-Goose theme via CSS custom properties
// Falls back to system preference
const theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
// Or reads from Super-Goose context:
const { theme } = useGooseTheme();
```

---

## 17. Accessibility

### WCAG 2.1 AA Compliance

| Requirement | Implementation |
|------------|----------------|
| **Color contrast** | All text meets 4.5:1 minimum contrast. Indicators use shape+color (never color alone) |
| **Keyboard navigation** | Full Tab/Enter/Arrow/Escape navigation. Focus trapped within popovers. |
| **Screen reader** | ARIA labels on all interactive elements. Live regions for status updates |
| **Reduced motion** | Respects `prefers-reduced-motion`. Animations replaced with instant transitions |
| **Focus visible** | 2px bright outline on all focusable elements |
| **Touch targets** | Minimum 32px (slim mode indicators), 44px (expanded mode buttons) |
| **Font scaling** | Respects system font size up to 200% without layout breakage |
| **High contrast** | Supports Windows High Contrast mode via forced-colors media query |

### ARIA Labels

```html
<!-- Slim mode example -->
<div role="toolbar" aria-label="TimeWarp timeline controls">
  <button aria-label="Drag to reposition TimeWarp bar" role="separator" />
  <div role="status" aria-live="polite" aria-label="Recording active">
    <span class="recording-dot" aria-hidden="true" />
  </div>
  <button aria-label="Current branch: main. Click to switch branch">main</button>
  <button aria-label="Event 47 of 312. Click to jump to event">47/312</button>
  <button aria-label="Previous event">◀</button>
  <button aria-label="Next event">▶</button>
  <div aria-label="Tests: 3 passed, 0 failed">✓3 ✗0</div>
  <div aria-label="Git status: 2 commits ahead, synced">↑2 ↓0</div>
  <div aria-label="Session cost: $0.42">$0.42</div>
  <div aria-label="Session duration: 3 hours 22 minutes">⏱ 3:22</div>
  <div role="status" aria-label="Agent idle">● idle</div>
  <button aria-label="Expand timeline view">▲</button>
</div>
```

### Live Regions for Status Updates

```html
<!-- Announced to screen readers when status changes -->
<div aria-live="polite" aria-atomic="true" class="sr-only">
  <!-- Updated via React state -->
  Event 48 recorded: file write to src/auth.rs
</div>

<div aria-live="assertive" class="sr-only">
  <!-- Only for critical alerts -->
  Warning: Hash chain verification failed at event 203
</div>
```

---

## 18. Performance Budget

| Metric | Target | Measurement Point |
|--------|--------|-------------------|
| Slim bar render | < 5ms | Initial paint of slim view |
| Expanded view render | < 16ms (60fps) | Full expanded view first paint |
| Dock transition | < 300ms total | Position change animation |
| Slim/Expanded toggle | < 200ms | View mode switch |
| New event append | < 10ms | IPC receive to visual update |
| Search results | < 100ms | Query to highlights |
| Status indicator update | < 50ms | IPC receive to display |
| Canvas redraw (1K events) | < 16ms | requestAnimationFrame budget |
| Canvas redraw (10K events) | < 16ms | Must use virtualization |
| Memory (slim mode) | < 5MB | React component tree |
| Memory (expanded, 1K events) | < 50MB | Canvas + React |
| Memory (expanded, 10K events) | < 200MB | With virtualization |
| IPC round-trip | < 20ms | Renderer to goosed and back |

### Rendering Strategy

- **Slim mode:** Pure React/DOM. No canvas needed. All indicators are DOM elements.
- **Expanded horizontal:** Canvas for tracks/events/rails/connectors. DOM for overlays (tooltips, menus, inspector).
- **Expanded vertical:** Virtualized list (react-window) for event rows. Canvas optional for branch rail.
- **Float mode:** Same as expanded, inside an Electron BrowserWindow.

---

## 19. Multi-Monitor Support

### Behavior

| Scenario | Behavior |
|----------|----------|
| Float on monitor 2 | TimeWarp floats independently, stays synchronized via IPC |
| Move main window to monitor 2 | Docked TimeWarp moves with the main window |
| Maximize on monitor 1, float on monitor 2 | Both views stay in sync (same playhead, same events) |
| Close float, return to dock | Returns to last dock position |
| Multiple monitors with different DPI | Respects per-monitor DPI scaling |

### Electron BrowserWindow for Pop-Out

```typescript
// When user presses Ctrl+Shift+W or "Pop out timeline"
const popoutWindow = new BrowserWindow({
  width: 800,
  height: 400,
  title: 'TimeWarp Timeline',
  parent: mainWindow,
  frame: true,
  resizable: true,
  minimizable: true,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
  },
});
popoutWindow.loadURL(`${appURL}#/timewarp-popout`);
```

---

## 20. Auto-Hide Behavior

### Configuration

```typescript
interface AutoHideConfig {
  enabled: boolean;
  delay: number;          // ms before hiding (default 2000)
  revealOnHover: boolean; // show when mouse approaches edge (default true)
  revealZone: number;     // px from edge to trigger reveal (default 4)
  keepOnRecording: boolean; // never auto-hide during active recording (default true)
}
```

### Auto-Hide Sequence

```
State: BAR VISIBLE
  |
  +--> Mouse leaves bar area
  |      |
  |      +--> Start hide timer (2000ms)
  |            |
  |            +--> Timer expires: Slide bar off-screen (200ms ease-in)
  |            |     |
  |            |     +--> State: BAR HIDDEN
  |            |           |
  |            |           +--> Mouse enters reveal zone (4px from edge)
  |            |           |     |
  |            |           |     +--> Slide bar on-screen (150ms ease-out)
  |            |           |     |     |
  |            |           |     |     +--> State: BAR VISIBLE
  |            |           |     |
  |            |           +--> Keyboard shortcut Ctrl+Shift+T
  |            |                 |
  |            |                 +--> Show bar immediately
  |            |
  |            +--> Mouse re-enters bar: Cancel timer
  |
  +--> New event arrives (during recording): Cancel timer, keep visible
```

### Auto-Hide Visual

```
BOTTOM DOCK -- AUTO-HIDDEN:
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│              MAIN CONTENT                                           │
│              (takes full height)                                    │
│                                                                     │
│                                                                     │
│                                                                     │
│                                                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ← 4px reveal zone (invisible,
                                      hover here to show bar)

BOTTOM DOCK -- REVEALING (mouse entered 4px zone):
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│              MAIN CONTENT                                           │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ ⠿ │ ◉│ main │ 47/312 │ ◀ ▶ │ ✓3 ✗0 │ ↑2 ↓0 │ $0.42 │ ▲        │
└─────────────────────────────────────────────────────────────────────┘
  ^-- Slides up from bottom edge over 150ms
```

---

## 21. Responsive Breakpoints

### Window Width (Horizontal Dock)

| Width | Slim Mode Changes | Expanded Mode Changes |
|-------|------------------|----------------------|
| **< 600px** | Only: drag, record, branch, event, expand | Minimap hidden. Transport overlay. |
| **600-799px** | Add: nav buttons, duration | Minimap hidden. Transport compressed. |
| **800-999px** | Add: test status | Minimap 80px. Transport full. |
| **1000-1199px** | Add: git sync | Minimap 100px. |
| **1200-1399px** | Add: cost, agent status | Minimap 120px. All tracks visible. |
| **>= 1400px** | All indicators visible + backup | Minimap 160px. Event labels visible. |

### Window Height (Vertical Dock)

| Height | Slim Mode Changes | Expanded Mode Changes |
|--------|------------------|----------------------|
| **< 400px** | Only: drag, record, branch, event, nav, expand | Compact timeline (5 visible events) |
| **400-599px** | Add: agent dot, duration | 10 visible events |
| **600-799px** | Add: test pass/fail | 15+ events, quick actions visible |
| **800-999px** | Add: git ahead/behind | Full indicators panel |
| **>= 1000px** | All indicators + backup | Full layout with search bar |

---

## 22. Complete ASCII Wireframes

### Wireframe 1: Bottom Dock, Slim Mode (Default State)

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Super-Goose Desktop                                                                ─ □ ✕  │
├───────┬───────────────────────────────────────────────────────────────────────────────────┤
│       │                                                                                   │
│       │   Agent: I've updated the authentication module to handle expired JWT tokens.     │
│ Side  │   The changes include a new validation step in validate_token() and updated       │
│ bar   │   error types in auth_errors.rs. Running tests now...                             │
│       │                                                                                   │
│ Chat  │   > All 47 tests passed.                                                          │
│ Files │                                                                                   │
│ Ext.  │                                                                                   │
│       │   [Type a message...                                                    ] [Send]  │
│       │                                                                                   │
├───────┴───────────────────────────────────────────────────────────────────────────────────┤
│ ⠿ │ ◉│ main │ 47/312 │ ◀ ▶ │ ✓47 ✗0 │ ↑2 ↓0 │ $0.42 │ ⏱ 3:22 │ ● idle │ 💾 2m │ ▲  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 2: Bottom Dock, Expanded Mode

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Super-Goose Desktop                                                                ─ □ ✕  │
├───────┬───────────────────────────────────────────────────────────────────────────────────┤
│       │                                                                                   │
│       │   Agent: Tests passed. Auth module is working correctly.                          │
│ Side  │                                                                                   │
│ bar   │   [Type a message...                                                    ] [Send]  │
│       │                                                                                   │
├───────┼═══════════════════════════ RESIZE HANDLE ═════════════════════════════════════════┤
│       │ ┌──────┐┌────────────────────────────────────────────────────────┐┌─────────────┐│
│       │ │ ⏮    ││|09:50   |09:55   |10:00    ▼10:04   |10:10          ││  Minimap    ││
│       │ │ ◀    ││                             ║                         ││  ┌───────┐  ││
│       │ │ ▶    ││ main: ●─●─●─◆─●─●─■─●─●─●─▼─●─●─●─●─●─●─●─●─●─●  ││  │━━━━━━━│  ││
│       │ │ ▶|   ││            ╲                ║                         ││  │  ╲━━━ │  ││
│       │ │ ⏭    ││ auth:       ●─●─◆─●─●─●    ║                         ││  │[═══] │  ││
│       │ │      ││                    ╲        ║                         ││  │━━━━━━━│  ││
│       │ │ 1x ▾ ││ cache:              ●─●─●─●                          ││  └───────┘  ││
│       │ │ main ││                             ║                         ││             ││
│       │ │ 🔍 ⚙ ││ ▁▂▃▅▇█▇▅▃▁▁▂▃▅▇▇▅▃▁▁▁▂▅▇█████▇▅▃▂▁▁▁▂▃▅▇▅▃▂▁   ││             ││
│       │ └──────┘└────────────────────────────────────────────────────────┘└─────────────┘│
│       ├──────────────────────────────────────────────────────────────────────────────────┤
│       │ ⠿ │ ◉│ main │ E47/312 │ ✓47 ✗0 │ ↑2 ↓0 │ $0.42 │ ⏱ 3:22 │ ● idle │ ▼       │
├───────┴──────────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 3: Top Dock, Slim Mode

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Super-Goose Desktop                                                                ─ □ ✕  │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ ⠿ │ ◉│ main │ 47/312 │ ◀ ▶ │ ✓47 ✗0 │ ↑2 ↓0 │ $0.42 │ ⏱ 3:22 │ ● idle │ 💾 2m │ ▼  │
├───────┬───────────────────────────────────────────────────────────────────────────────────┤
│       │                                                                                   │
│       │   Agent: I've updated the authentication module...                                │
│ Side  │                                                                                   │
│ bar   │   > All 47 tests passed.                                                          │
│       │                                                                                   │
│       │                                                                                   │
│       │                                                                                   │
│       │   [Type a message...                                                    ] [Send]  │
│       │                                                                                   │
└───────┴───────────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 4: Left Dock, Slim Mode

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Super-Goose Desktop                                                               ─ □ ✕  │
├──────┬───────┬───────────────────────────────────────────────────────────────────────────┤
│  ⠿  │       │                                                                           │
│  ◉  │       │   Agent: I've updated the authentication module...                        │
│ main│ Side  │                                                                           │
│  47 │ bar   │   > All 47 tests passed.                                                  │
│ --- │       │                                                                           │
│ 312 │ Chat  │                                                                           │
│  ▲  │ Files │                                                                           │
│  ▼  │ Ext.  │                                                                           │
│ ✓47 │       │                                                                           │
│ ✗ 0 │       │                                                                           │
│  ↑2 │       │   [Type a message...                                             ] [Send] │
│  ↓0 │       │                                                                           │
│$0.42│       │                                                                           │
│ 3:22│       │                                                                           │
│  ●  │       │                                                                           │
│  💾 │       │                                                                           │
│  ▶  │       │                                                                           │
└──────┴───────┴───────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 5: Left Dock, Expanded Mode

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Super-Goose Desktop                                                               ─ □ ✕  │
├──────────────────────────┬───────┬───────────────────────────────────────────────────────┤
│ ⠿ TIMEWARP   [slim] [x] │       │                                                       │
│ ◉ REC│main │ E47/312    │       │  Agent: Tests passed.                                 │
│                          │ Side  │                                                       │
│   ⏮  ◀  ▶/⏸  ▶|  ⏭    │ bar   │                                                       │
│     Speed: 1x ▾         │       │                                                       │
│                          │ Chat  │                                                       │
│  10:01  ●  file_write    │ Files │                                                       │
│         │                │       │                                                       │
│  10:02  ◆  llm_call      │       │                                                       │
│         │                │       │                                                       │
│  10:03  ■  cmd_exec      │       │                                                       │
│         │╲               │       │                                                       │
│  10:03  │ ●  [auth]      │       │                                                       │
│         │ │              │       │                                                       │
│  10:04  ▼ ●  [auth]      │       │  [Type a message...                         ] [Send]  │
│         │ │              │       │                                                       │
│  10:05  │ ●  [auth]      │       │                                                       │
│         │╱               │       │                                                       │
│  10:06  ⬡  git_op        │       │                                                       │
│                          │       │                                                       │
│ [Branch][Merge][Replay]  │       │                                                       │
│                          │       │                                                       │
│ Tests:  ✓47  ✗0         │       │                                                       │
│ Git:    ↑2   ✓ clean    │       │                                                       │
│ Cost:   $0.42/$5.00     │       │                                                       │
│ Agent:  ● idle           │       │                                                       │
│                          │       │                                                       │
│ [Search...          ]    │       │                                                       │
│ ═══ RESIZE ══════════════│       │                                                       │
└──────────────────────────┴───────┴───────────────────────────────────────────────────────┘
```

### Wireframe 6: Right Dock, Slim Mode

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Super-Goose Desktop                                                               ─ □ ✕  │
├───────┬──────────────────────────────────────────────────────────────────────────┬──────┤
│       │                                                                          │  ⠿  │
│       │   Agent: I've updated the authentication module...                       │  ◉  │
│ Side  │                                                                          │ main│
│ bar   │   > All 47 tests passed.                                                 │  47 │
│       │                                                                          │ --- │
│ Chat  │                                                                          │ 312 │
│ Files │                                                                          │  ▲  │
│ Ext.  │                                                                          │  ▼  │
│       │                                                                          │ ✓47 │
│       │                                                                          │ ✗ 0 │
│       │   [Type a message...                                            ] [Send] │  ↑2 │
│       │                                                                          │  ↓0 │
│       │                                                                          │$0.42│
│       │                                                                          │ 3:22│
│       │                                                                          │  ●  │
│       │                                                                          │  💾 │
│       │                                                                          │  ◀  │
└───────┴──────────────────────────────────────────────────────────────────────────┴──────┘
```

### Wireframe 7: Floating Mode

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Super-Goose Desktop                                                                ─ □ ✕  │
├───────┬───────────────────────────────────────────────────────────────────────────────────┤
│       │                                                                                   │
│       │   Agent: Tests passed.                                                            │
│ Side  │                                                                                   │
│ bar   │   ┌─────────────────────────────────────────────────────────────────┐             │
│       │   │ ⠿ TimeWarp                          [Dock ▾] [─] [□] [✕]      │             │
│       │   ├─────────────────────────────────────────────────────────────────┤             │
│       │   │ ◉ REC│main│E47/312│✓47 ✗0│↑2 ↓0│$0.42│⏱ 3:22                │             │
│       │   ├─────────────────────────────────────────────────────────────────┤             │
│       │   │ ┌────┐┌───────────────────────────────────────┐┌────────────┐  │             │
│       │   │ │CTRL││ main: ●─●─◆─●─●─■─●─▼─●─●─●         ││  Minimap   │  │             │
│       │   │ │    ││ auth:      ╲──●──●──●                  ││  ━━━━━━━   │  │             │
│       │   │ └────┘└───────────────────────────────────────┘└────────────┘  │             │
│       │   │ ▁▂▃▅▇█▇▅▃▁▁▂▃▅▇▇▅▃▁▁▁▂▅▇██▇▅▃▂▁                             │             │
│       │   ├─────────────────────────────────────────────────────────────────┤             │
│       │   │ ◀ E46 │ [Jump] [Branch] [Merge] [Replay] │ E48 ▶              │             │
│       │   └─────────────────────────────────────────────────────────────────┘             │
│       │                                                                                   │
│       │   [Type a message...                                                    ] [Send]  │
│       │                                                                                   │
└───────┴───────────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 8: Bottom Dock with Event Inspector Open

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Super-Goose Desktop                                                                ─ □ ✕  │
├───────┬───────────────────────────────────────────────────────────────────────────────────┤
│       │                                                                                   │
│       │   Agent: Tests passed.                                                            │
│ Side  │   [Type a message...                                                    ] [Send]  │
│ bar   │                                                                                   │
├───────┼═══════════════════════════ RESIZE HANDLE ═════════════════════════════════════════┤
│       │ EVENT INSPECTOR: E47 cmd_exec                                [Summary][Diff][✕]  │
│       │ Command: cargo test --release │ ✓ exit 0 │ 2.3s │ Score: 0.95                    │
│       │ Files: src/auth.rs (+12-4) │ src/config.rs (+3-1) │ tests/auth.rs (+8-0)         │
│       │ [Jump Here] [Branch from Here] [Replay] [Compare] [Export]                       │
│       ├═══════════════════════════════════════════════════════════════════════════════════┤
│       │ ┌──────┐┌──────────────────────────────────────────────────┐┌───────────────────┐│
│       │ │CTRL  ││ main: ●─●─●─◆─●─●─■─●─●─●─▼─●─●─●             ││ Minimap           ││
│       │ │PANEL ││ auth:      ╲──●──●──●         ║                  ││                   ││
│       │ └──────┘└──────────────────────────────────────────────────┘└───────────────────┘│
│       ├──────────────────────────────────────────────────────────────────────────────────┤
│       │ ⠿│◉│main│E47/312│✓47 ✗0│↑2 ↓0│$0.42│⏱ 3:22│● idle│💾 2m│ ▼                    │
└───────┴──────────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 9: Hidden State (Auto-Hide Active)

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Super-Goose Desktop                                                                ─ □ ✕  │
├───────┬───────────────────────────────────────────────────────────────────────────────────┤
│       │                                                                                   │
│       │   Agent: I've updated the authentication module to handle expired JWT tokens.     │
│ Side  │   The changes include a new validation step in validate_token() and updated       │
│ bar   │   error types in auth_errors.rs. Running tests now...                             │
│       │                                                                                   │
│ Chat  │   > All 47 tests passed.                                                          │
│ Files │                                                                                   │
│ Ext.  │                                                                                   │
│       │                                                                                   │
│       │                                                                                   │
│       │                                                                                   │
│       │                                                                                   │
│       │   [Type a message...                                                    ] [Send]  │
│       │                                                                                   │
└───────┴───────────────────────────────────────────────────────────────────────────────────┘
▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ← 4px invisible reveal zone (hover to show bar)
```

### Wireframe 10: Dock Drag In Progress

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Super-Goose Desktop                                                                ─ □ ✕  │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─── DROP ZONE: DOCK TOP ──────────────────────────────────────────────────────────────┐  │
│ │                                   Drop here                                          │  │
│ └──────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                           │
│ ┌────┐                                                                          ┌────┐   │
│ │    │                                                                          │    │   │
│ │LEFT│           MAIN CONTENT                                                   │RGHT│   │
│ │    │                                                                          │    │   │
│ │    │                       ┌──────────────────┐                               │    │   │
│ │    │                       │ ⠿ main │ 47/312  │  ← Floating bar being dragged │    │   │
│ │    │                       └──────────────────┘    (follows cursor)            │    │   │
│ │    │                                                                          │    │   │
│ └────┘                                                                          └────┘   │
│                                                                                           │
│ ┌─── DROP ZONE: DOCK BOTTOM (ACTIVE -- cursor is near) ───────────────────────────────┐  │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ Drop here (highlighted)            │  │
│ └──────────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary of Feature Density

This enhanced specification adds the following on top of the original `TIMEWARP_BAR_UI_UX_SPEC.md`:

| Category | Count | New |
|----------|-------|-----|
| Dock positions | 5 (bottom, top, left, right, float) | +4 |
| View modes | 3 (hidden, slim, expanded) + float | +1 |
| Slim indicators | 12 distinct segments | +7 |
| Expanded panels (fly-out) | 13 popover panels | +10 |
| Dock transitions | 8 animation types | +8 |
| Keyboard shortcuts (docking) | 11 new bindings | +11 |
| IPC channels | 22 channels | +22 |
| React components | 50+ components | +50 |
| Custom hooks | 10 hooks | +10 |
| Theme variables | 40+ CSS variables | +40 |
| ARIA labels | Full coverage | NEW |
| Performance targets | 14 metrics | +4 |
| ASCII wireframes | 10 complete wireframes | +6 |
| Responsive breakpoints | 12 breakpoints (6 width + 6 height) | +12 |
| Auto-hide states | 5 states with transition diagram | NEW |
| Multi-monitor support | Full specification | NEW |

---

*This specification extends the original TIMEWARP_BAR_UI_UX_SPEC.md. Both documents together form the complete engineering specification for implementing the TimeWarp Bar in the Super-Goose Electron desktop application. The original spec covers the timeline internals (tracks, events, nodes, inspector tabs, context menus, zoom, search, animations, colors). This document covers the docking system, position-aware layouts, slim/expanded modes, integration with the Electron shell, and all supporting infrastructure.*
