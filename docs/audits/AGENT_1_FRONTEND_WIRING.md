# Agent 1: Frontend Wiring Auditor — Task List

**Scope:** Electron UI components, ConsciousBridge, React wiring, Android UI, accessibility  
**Audit Passes:** 1 (UI), 2 (UI column), 3 (orphaned UI), 4 (full wiring)  
**Estimated Time:** 3-4 hours  
**Dependencies:** None — can start immediately  

---

## Phase 1 Tasks (Start Immediately)

### TASK 1.1: Create 7 Missing UI Components

All new components go in `G:\goose\ui\desktop\src\components\conscious\`.

#### 1.1.1 MemoryPanel.tsx
**Purpose:** Display conversation transcript history from `/api/memory/status`  
**API:** `GET http://localhost:8999/api/memory/status`  
**Response shape:**
```json
{
  "session_id": "voice-1234567890",
  "entry_count": 15,
  "session_duration_s": 300,
  "speakers": {"user": 8, "conscious": 7}
}
```
**Requirements:**
- Fetch memory status on mount and every 5 seconds
- Display session ID, entry count, duration
- Show user/conscious message counts
- "Clear History" button → call agent_controller's clear_memory action
- Handle API unreachable gracefully (show offline state)
- Use Tailwind CSS classes consistent with ConsciousSection.tsx
- Import icons from `lucide-react` (MessageSquare, Trash2)

#### 1.1.2 CreatorPanel.tsx
**Purpose:** UI for AI artifact creation (personalities, skills, prompts)  
**APIs:**
- `POST http://localhost:8999/api/creator/create` — body: `{"text": "create a pirate personality"}`
- `GET http://localhost:8999/api/creator/history` — returns list of created artifacts
- `POST http://localhost:8999/api/creator/promote` — body: `{"staging_path": "..."}`
**Requirements:**
- Text input for creation command
- Submit button → POST /api/creator/create
- Display creation history list (from GET /api/creator/history)
- Each history item: type, description, status, promote button
- Loading state during creation (can take 10+ seconds)
- Error handling for failed creation
- Icons: Wand2, History, CheckCircle from lucide-react

#### 1.1.3 TestingDashboard.tsx
**Purpose:** Display test results and self-healing status  
**APIs:**
- `POST http://localhost:8999/api/testing/validate` — body: `{"feature": "personality"}`
- `POST http://localhost:8999/api/testing/heal` — body: `{"feature": "personality"}`
- `GET http://localhost:8999/api/testing/history` — returns healing history
**Requirements:**
- Feature name input + "Validate" button
- "Heal" button (enabled when validation fails)
- Results display: pass/fail status, failure messages, attempt count
- History list showing recent validation/healing results
- Icons: TestTube, Wrench, CheckCircle, XCircle from lucide-react

#### 1.1.4 EmotionVisualizer.tsx
**Purpose:** Real-time emotion display beyond the basic text in ConsciousSection  
**API:** `GET http://localhost:8999/api/emotion/status`  
**Response shape:**
```json
{
  "enabled": true,
  "model_loaded": true,
  "mood": {
    "dominant_emotion": "happy",
    "trend": "improving",
    "avg_valence": 0.65,
    "history": [
      {"emotion": "neutral", "confidence": 0.8},
      {"emotion": "happy", "confidence": 0.9}
    ]
  }
}
```
**Requirements:**
- Poll every 3 seconds when enabled
- Show dominant emotion with colored indicator
- Show trend (improving/declining/stable/volatile) with arrow icon
- Valence bar (0-1 scale, red to green gradient)
- Emotion history as small timeline/sparkline
- Icons: Heart, TrendingUp, TrendingDown, Minus from lucide-react

#### 1.1.5 WakeWordIndicator.tsx
**Purpose:** Show wake word detection + VAD status  
**API:** `GET http://localhost:8999/api/wake-vad/status`  
**Requirements:**
- Show current state: IDLE / LISTENING / WAKE_DETECTED / SPEECH_ACTIVE
- Color-coded status dot (gray/yellow/green/blue)
- Toggle button → `POST /api/wake-vad/toggle`
- Show "Say 'Hey Goose'" hint when in IDLE state
- Icons: Mic, MicOff, Radio from lucide-react

#### 1.1.6 CapabilitiesList.tsx
**Purpose:** Browsable list of all agent capabilities with voice triggers  
**API:** `GET http://localhost:8999/api/agent/capabilities`  
**Requirements:**
- Fetch capability list on mount
- Display as categorized, searchable list
- Show: capability name, voice trigger phrase, category, description
- Search/filter input at top
- Group by category (settings, devices, self, creator, testing, goose)
- Icons: Zap, Search from lucide-react

#### 1.1.7 SkillManager.tsx
**Purpose:** Manage voice-triggered skills (list/run/save)  
**API:** Uses `/api/agent/execute` with skill-related commands  
**Requirements:**
- "List Skills" button → POST /api/agent/execute with text "list skills"
- "Run Skill" input + button → POST /api/agent/execute with text "run skill [name]"
- Display skill execution results
- "Save Skill" input → POST /api/agent/execute with text "save skill [name]"
- Icons: BookOpen, Play, Save from lucide-react

### TASK 1.2: Integrate New Components into ConsciousSection.tsx

**File:** `G:\goose\ui\desktop\src\components\settings\conscious\ConsciousSection.tsx`

After creating all 7 components, add them as collapsible sections within ConsciousSection:
- Import all 7 new components
- Add them below the existing Voice Controls, Agentic Layer, Emotion Engine, and UI Bridge sections
- Each new section should be collapsible (use a simple useState toggle)
- Order: Emotion Visualizer, Wake Word, Memory, Creator, Testing, Capabilities, Skills

### TASK 1.3: Expand ConsciousBridge Command Handlers

**File:** `G:\goose\ui\desktop\src\components\conscious\ConsciousBridge.ts`

Currently only handles `set_theme`. Add handlers for:

```typescript
consciousBridge.on('set_model', (params) => {
  // Dispatch model change to settings
});
consciousBridge.on('toggle_voice', (params) => {
  // Toggle voice recording state
});
consciousBridge.on('set_volume', (params) => {
  // Adjust system volume (if possible via Electron)
});
consciousBridge.on('navigate', (params) => {
  // Navigate to a specific settings tab or page
});
consciousBridge.on('toggle_sidebar', (params) => {
  // Toggle sidebar visibility
});
consciousBridge.on('show_notification', (params) => {
  // Show a toast/notification in the UI
});
consciousBridge.on('zoom_in', (params) => {
  // Increase font size / zoom level
});
consciousBridge.on('zoom_out', (params) => {
  // Decrease font size / zoom level
});
```

---

## Phase 2 Tasks (After Phase 1)

### TASK 1.4: Wire All UI Components to Real API Endpoints

For EVERY button, toggle, and form in the Conscious UI, verify:
1. onClick/onSubmit handler exists and calls a real API
2. Loading state shown during API call
3. Success state updates the display
4. Error state shown with meaningful message
5. No `console.log` only handlers — all must make real API calls

**Wiring verification checklist:**
- [ ] VoiceToggle → POST /api/voice/start and /api/voice/stop
- [ ] PersonalitySelector → POST /api/personality/switch and GET /api/personality/list
- [ ] Agentic toggle → POST /api/agentic/toggle
- [ ] Emotion toggle → POST /api/emotion/toggle
- [ ] MemoryPanel clear → POST /api/agent/execute (text: "clear memory")
- [ ] CreatorPanel create → POST /api/creator/create
- [ ] CreatorPanel promote → POST /api/creator/promote
- [ ] TestingDashboard validate → POST /api/testing/validate
- [ ] TestingDashboard heal → POST /api/testing/heal
- [ ] WakeWordIndicator toggle → POST /api/wake-vad/toggle
- [ ] SkillManager list/run/save → POST /api/agent/execute

### TASK 1.5: Accessibility Fixes

For ALL interactive elements in `src/components/conscious/` and `src/components/settings/conscious/`:
- [ ] Add `aria-label` to all buttons and toggles
- [ ] Add `role` attributes where needed
- [ ] Verify color contrast for all status indicators (green/red/yellow dots)
- [ ] Add keyboard navigation (Tab + Enter/Space) for all controls
- [ ] Add `aria-live="polite"` on status displays that update dynamically

---

## Phase 3 Tasks (After Desktop UI Verified)

### TASK 1.6: Android — Generate gradle-wrapper.jar (BUG-007)

**Location:** `G:\goose\ui\mobile\android\`

Run this command to generate the missing binary:
```bash
cd G:\goose\ui\mobile\android
gradle wrapper --gradle-version 8.9
```

If `gradle` is not installed, download the wrapper jar from:
`https://services.gradle.org/distributions/gradle-8.9-bin.zip`

Extract and copy `gradle/wrapper/gradle-wrapper.jar` to the android project.

### TASK 1.7: Android — ConsciousClient.kt

**Create:** `G:\goose\ui\mobile\android\app\src\main\java\com\block\goose\conscious\ConsciousClient.kt`

```kotlin
class ConsciousClient(private val baseUrl: String = "http://10.0.2.2:8999") {
    // Mirror the desktop Conscious API calls:
    suspend fun getStatus(): ConsciousStatus
    suspend fun getEmotionStatus(): EmotionStatus
    suspend fun toggleEmotion(enabled: Boolean)
    suspend fun toggleAgentic(enabled: Boolean)
    suspend fun listPersonalities(): List<PersonalityInfo>
    suspend fun switchPersonality(name: String)
    suspend fun executeCommand(text: String): AgentResult
    suspend fun getCapabilities(): List<Capability>
}
```

Use OkHttp + Gson (already in Android dependencies).

### TASK 1.8: Android — ConsciousScreen.kt

**Create:** `G:\goose\ui\mobile\android\app\src\main\java\com\block\goose\ui\screens\ConsciousScreen.kt`

Compose UI screen showing:
- Connection status to Conscious API
- Emotion status display
- Personality selector
- Agentic layer toggle
- Voice command text input + execute button

Add navigation entry in the app's nav graph.

---

## Verification Checkpoints

### After Phase 1:
```bash
cd G:\goose\ui\desktop && npx tsc --noEmit
cd G:\goose\ui\desktop && npx eslint src/components/conscious/ src/components/settings/conscious/ --max-warnings 0
```

### After Phase 2:
- Start Conscious backend: `cd G:\goose\external\conscious && python -m conscious --auto-start`
- Open Electron UI, navigate to Settings → Conscious tab
- Verify each component renders without errors
- Verify each button makes a real API call (check browser Network tab)

### After Phase 3:
```bash
cd G:\goose\ui\mobile\android && gradlew assembleDebug
```

---

## Files Created/Modified Summary

| Action | File |
|--------|------|
| CREATE | `src/components/conscious/MemoryPanel.tsx` |
| CREATE | `src/components/conscious/CreatorPanel.tsx` |
| CREATE | `src/components/conscious/TestingDashboard.tsx` |
| CREATE | `src/components/conscious/EmotionVisualizer.tsx` |
| CREATE | `src/components/conscious/WakeWordIndicator.tsx` |
| CREATE | `src/components/conscious/CapabilitiesList.tsx` |
| CREATE | `src/components/conscious/SkillManager.tsx` |
| MODIFY | `src/components/settings/conscious/ConsciousSection.tsx` |
| MODIFY | `src/components/conscious/ConsciousBridge.ts` |
| CREATE | `android/.../conscious/ConsciousClient.kt` |
| CREATE | `android/.../ui/screens/ConsciousScreen.kt` |
| FIX | `android/gradle/wrapper/gradle-wrapper.jar` |
