# Continuation: Enterprise Routes & Settings Bridge

**Date:** 2026-02-11
**Branch:** `feat/session-9-wiring`
**Session:** Enterprise panel standalone routes + settingsBridge enhancements

---

## Files Created

| File | Purpose |
|------|---------|
| `ui/desktop/src/components/settings/enterprise/EnterpriseRoutePanel.tsx` | Standalone route-level component for enterprise settings. Renders a 2-column card grid with 6 panels (Guardrails, Gateway, Observability, Policies, Hooks, Memory). Clicking a card opens the panel inline with a "Back" button. |

## Files Modified

| File | Change |
|------|--------|
| `ui/desktop/src/utils/settingsBridge.ts` | Added `SettingsKeys` enum (18 keys), `syncSettingToBackend()`, `loadSettingFromBackend()`, and `useSettingsBridge<T>()` generic hook. All existing code left untouched. |
| `ui/desktop/src/App.tsx` | Added import for `EnterpriseRoutePanel` and `<Route path="enterprise">` after the `conscious` route. |
| `ui/desktop/src/components/GooseSidebar/AppSidebar.tsx` | Added `Shield` to lucide-react imports. Added Enterprise nav item (`/enterprise`) before the final separator + Settings entry. |

## Architecture Notes

### EnterpriseRoutePanel.tsx
- **Different from** `EnterpriseSettingsSection.tsx` (which is the collapsible accordion used inside the Settings tabs).
- `EnterpriseRoutePanel` is a standalone full-page view accessible at `/enterprise`.
- Uses local `useState<string | null>` to track which panel is open (grid view vs detail view).
- Imports the same 6 panel components that `EnterpriseSettingsSection` uses.
- Matches project styling: `border-border-default`, `bg-background-default`, `text-text-default`, `rounded-lg`.

### settingsBridge.ts Enhancements
- **`SettingsKeys` enum**: Canonical string enum for all 18 feature setting keys. Components should use `SettingsKeys.BudgetLimit` instead of `'budgetLimit'` strings.
- **`syncSettingToBackend(key, value)`**: POSTs to `/api/settings/{key}`. Returns `boolean` success. Falls back silently with `console.warn` if backend unavailable.
- **`loadSettingFromBackend<T>(key)`**: GETs from `/api/settings/{key}`. Returns `T | undefined`. Falls back silently.
- **`useSettingsBridge<T>(key, defaultValue)`**: Generic React hook for any single setting. Layered persistence: tries backend first on load, falls back to `localStorage`. Writes go to both localStorage (sync) and backend (async best-effort).
- All existing code (`useFeatureSettings`, `loadFeatureSettings`, `saveFeatureSettings`, `resetFeatureSettings`, `defaultFeatureSettings`, `FeatureSettings` type) is **unchanged**.

### Routing
- Route path: `/enterprise`
- Nested inside the root `"/"` layout route (inside `ProviderGuard` + `ChatProvider` + `AppLayout`), consistent with all other panel routes.

### Sidebar
- Enterprise entry appears after "Conscious" and before the final separator + Settings.
- Uses the `Shield` icon from lucide-react (distinct from `ShieldCheck` used by Guardrails).

## Remaining Work

### Wiring (Future Sessions)
- [ ] Wire `useSettingsBridge` / `useFeatureSettings` calls into actual enterprise panels so changes persist across sessions.
- [ ] Backend API endpoints: `GET/POST /api/settings/{key}` on the Rust server side (currently the endpoints do not exist; the bridge falls back to localStorage).
- [ ] Backend API endpoints: `/enterprise/guardrails/config`, `/enterprise/gateway/status`, `/enterprise/observability/usage`, `/enterprise/policies/rules`, `/enterprise/hooks/config`, `/enterprise/memory/status` (panels currently fall back to defaults when these are unavailable).

### UI Polish (Future Sessions)
- [ ] Add breadcrumb navigation to EnterpriseRoutePanel detail view.
- [ ] Add status badges on the grid cards (e.g., "3/6 detectors active" for Guardrails).
- [ ] Consider deep-linking: `/enterprise/guardrails` should open directly to the Guardrails panel.
- [ ] Mobile responsive layout for single-column on narrow viewports.

### Testing
- [ ] Playwright E2E: navigate to `/enterprise`, verify 6 cards render, click each card and verify panel loads.
- [ ] Unit test for `useSettingsBridge` hook with mocked fetch.
- [ ] Unit test for `syncSettingToBackend` / `loadSettingFromBackend` with fetch mock.
