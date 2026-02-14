# Audit 01 — Frontend Components
## Status: IN_PROGRESS
## Last Updated: 2026-02-14T01:00
## Findings Count: 12

---

## Directory: ui/desktop/src/components/super/

### Finding S-001 [STRUCTURAL] SuperGoosePanel.tsx — Missing panel navigations
- **Severity**: Medium
- **File**: `ui/desktop/src/components/super/SuperGoosePanel.tsx`
- **Description**: SuperGoosePanel defines 13 panel IDs in its `PanelId` type and maps them to 13 child components. However, 4 components that exist in the super/ directory are NOT reachable from the panel navigation: `AutonomousDashboard`, `AuditDashboard`, `AgentChatPanel`, `AgentRegistryPanel`. These components are effectively orphaned — they exist in the codebase but have no route into the panel system.
- **Recommendation**: Either add these as panel options in the `PanelId` type and `PANEL_MAP`, or remove them if they are accessed through other means (e.g., dedicated routes).

### Finding S-002 [STRUCTURAL] DashboardPanel.tsx — Quick action buttons have no onClick handlers
- **Severity**: High
- **File**: `ui/desktop/src/components/super/DashboardPanel.tsx`
- **Description**: The quick action buttons ("New Task", "Run Tests", "Open Studio") in the dashboard have empty or missing `onClick` handlers. Users can click them but nothing happens. These are prominent UI elements that give the impression of broken functionality.
- **Recommendation**: Wire onClick handlers to appropriate actions (e.g., panel navigation, IPC calls, or disable with tooltip explaining they are coming soon).

### Finding S-003 [QUALITY] SGSettingsPanel.tsx — Hardcoded version string
- **Severity**: Low
- **File**: `ui/desktop/src/components/super/SGSettingsPanel.tsx`, line ~159
- **Description**: Version is hardcoded as `"v1.24.05"`. This will become stale as the project evolves. Should be dynamically sourced from package.json, build metadata, or the `/api/version` endpoint.
- **Recommendation**: Import version from package.json or fetch from `/api/version` (which already exists per the OTA system).

### Finding S-004 [STRUCTURAL] AuditDashboard.tsx — Oversized component (~1050 lines)
- **Severity**: Medium
- **File**: `ui/desktop/src/components/super/AuditDashboard.tsx`
- **Description**: At ~1050 lines, this is by far the largest component in the super/ directory. It contains:
  - Hardcoded COLORS palette (should use sg-* design tokens)
  - 8+ inline sub-components (Dot, Badge, Card, LiveBanner, SectionHeader, etc.)
  - Static data arrays for gaps, failsafes, phases, test counts
  - Its own pulse keyframe animation (duplicates what could be in shared CSS)
  - `useLiveData()` custom hook defined inline
- **Recommendation**: Extract sub-components to separate files, move hardcoded data to a constants file or fetch from API, use sg-* design tokens instead of custom COLORS palette.

### Finding S-005 [QUALITY] AuditDashboard.tsx — Hardcoded port 3284
- **Severity**: High
- **File**: `ui/desktop/src/components/super/AuditDashboard.tsx`
- **Description**: The `useLiveData()` hook inside AuditDashboard constructs API URLs with hardcoded `localhost:3284`. This was supposed to be fixed in the session 4 sweep that converted 10 files from hardcoded localhost:3284 to `getApiUrl()`. This file was missed.
- **Recommendation**: Replace hardcoded URL construction with `getApiUrl()` from `../../config`.

### Finding S-006 [QUALITY] RecipeBrowser.tsx, PromptLibrary.tsx, SkillsPanel.tsx — Static mock data
- **Severity**: Low
- **File**: Multiple files in `ui/desktop/src/components/super/`
- **Description**: Three components use static/hardcoded data arrays with TODO comments for future API integration:
  - `RecipeBrowser.tsx`: `SAMPLE_RECIPES` array (line 36, TODO: fetch from /api/recipes)
  - `PromptLibrary.tsx`: `PROMPTS` array (line 31, TODO: fetch from /api/prompts)
  - `SkillsPanel.tsx`: `INITIAL_SKILLS` array (line 32, TODO: fetch from /api/learning/skills)
- **Recommendation**: These TODOs are acceptable for now since the backend endpoints don't exist yet. Track as tech debt. When backend endpoints are created, convert to fetched data with loading/error states.

### Finding S-007 [QUALITY] AgentRegistryPanel.tsx — Uses window.prompt() for user input
- **Severity**: Medium
- **File**: `ui/desktop/src/components/super/AgentRegistryPanel.tsx`
- **Description**: The "Send Message" action uses `window.prompt()` to collect message text from the user. This is a browser-native modal that breaks the UI design language, cannot be styled, and provides a poor user experience in an Electron app.
- **Recommendation**: Replace with an inline text input or a custom modal component that matches the sg-* design system.

### Finding S-008 [STRUCTURAL] ConnectionsPanel.tsx — 'keys' tab category mismatch
- **Severity**: Low
- **File**: `ui/desktop/src/components/super/ConnectionsPanel.tsx`
- **Description**: The tab bar includes a 'keys' tab that filters connections by `category === 'keys'`. However, none of the `STATIC_CONNECTIONS` entries have `category: 'keys'`. The tab always falls through to showing the extensions list or empty state, making it redundant with the extensions section.
- **Recommendation**: Either add connections with category 'keys' (e.g., API keys, tokens), or remove the 'keys' tab, or clarify the intent of this tab.

### Finding S-009 [QUALITY] SGApprovalGate.tsx — Redundant export
- **Severity**: Trivial
- **File**: `ui/desktop/src/components/super/shared/SGApprovalGate.tsx`, line ~142
- **Description**: The component exports both a default export and a named export of the same component. The barrel file (`shared/index.ts`) only uses the named export. The default export is redundant.
- **Recommendation**: Remove the default export to keep a single export pattern consistent with the rest of the shared components.

### Finding S-010 [QUALITY] Multiple components — Missing error boundaries
- **Severity**: Medium
- **File**: All super/ components
- **Description**: No super/ panel components wrap their content in error boundaries. If any panel throws a runtime error (e.g., from a malformed API response or AG-UI event), the entire SuperGoosePanel tree crashes. Components that do API fetching (GPUPanel, StudiosPanel, MarketplacePanel, AgentRegistryPanel, ConnectionsPanel) are most at risk.
- **Recommendation**: Add a shared `SGErrorBoundary` component and wrap each panel, or add a single error boundary in SuperGoosePanel around the active panel.

### Finding S-011 [QUALITY] MonitorPanel.tsx — Derived cost data may be undefined
- **Severity**: Low
- **File**: `ui/desktop/src/components/super/MonitorPanel.tsx`
- **Description**: MonitorPanel reads `agentState.session_spend`, `total_spend`, `budget_limit`, and `model_breakdown` from the AG-UI state. These fields may be undefined if the AG-UI stream hasn't sent cost data yet. The component does handle the undefined case for `model_breakdown` (falls back to empty array), but `session_spend` and `total_spend` are used directly in arithmetic without null checks.
- **Recommendation**: Add fallback values (e.g., `agentState.session_spend ?? 0`) to prevent NaN display.

### Finding S-012 [POSITIVE] GPUPanel.tsx — Well-implemented component
- **Severity**: N/A (positive finding)
- **File**: `ui/desktop/src/components/super/GPUPanel.tsx`
- **Description**: GPUPanel is one of the best-implemented components in super/. It features:
  - Proper AbortController cleanup on unmount
  - Separate polling intervals for GPU info (10s) and jobs (3s)
  - Full loading/error/empty states for all 3 tabs
  - Auto-detection of local Ollama models
  - Clean tab navigation with proper ARIA attributes
- **Recommendation**: Use as a reference pattern for other panels.

---

