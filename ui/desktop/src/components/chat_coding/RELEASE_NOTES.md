# Chat Coding Components - Release Notes

## Overview

A suite of 24 component files (25 named exports) for the Goose desktop chat interface, providing enhanced code rendering, multi-agent visualization, task management, and rich media support.

## Components

### Phase 1: Core Code Rendering
- **EnhancedCodeBlock** - Syntax-highlighted code blocks with line numbers, copy, collapse, search, minimap
- **DiffCard** - Unified/split diff viewer with additions/deletions counts
- **CodeActionBar** - Action toolbar (copy, download, run) for code blocks
- **ToolResultCodeBlock** - Smart renderer for tool call outputs with language detection
- **FileChangeGroup** - Grouped file change display with content type badges

### Phase 2: Code Navigation
- **CodeSearch** - In-block text search with match highlighting and navigation
- **CodeMinimap** - VS Code-style minimap overview for long code blocks
- **BreadcrumbPath** - File path breadcrumb with directory truncation

### Phase 3: Thinking & Media
- **ThinkingBlock** - Animated chain-of-thought display with elapsed time
- **ImagePreviewCard** - Click-to-expand image preview with zoom controls
- **AudioPlayer** - Compact audio player with waveform, speed control, volume
- **ContentTypeIndicator** - File type badge with icon and color

### Phase 4: Multi-Agent / Swarm Visualization
- **SwarmOverview** - Dashboard showing all active agents with status
- **SwarmProgress** - Progress bar with agent completion stats and ETA
- **SubagentTrace** - Hierarchical trace of sub-agent tool calls
- **AgentCommunication** - Inter-agent message timeline

### Phase 5: Task & Workflow
- **TaskCard** / **TaskCardGroup** - Task progress cards with subtasks and logs (both exported from the same file)
- **TaskGraph** - SVG dependency graph visualization
- **BatchProgress** - Batch operation progress tracker
- **BatchProgressPanel** - Panel wrapper for batch progress display
- **SkillCard** - Skill/capability card display
- **CompactionIndicator** - Context compaction status indicator

### Phase 6: Diagram & Chart
- **MermaidDiagram** - Mermaid.js diagram renderer with pan/zoom
- **RechartsWrapper** - Simple SVG chart renderer (bar, line, area, pie)

## Integration Points

Each parent file imports specific components from the `chat_coding/` barrel export:

### GooseMessage.tsx
- ThinkingBlock

### MarkdownContent.tsx
- EnhancedCodeBlock
- DiffCard (and `parseDiffText` helper)
- ImagePreviewCard
- AudioPlayer
- MermaidDiagram
- RechartsWrapper

### ToolCallWithResponse.tsx
- ToolResultCodeBlock (and `looksLikeCode` helper)
- FileChangeGroup
- TaskGraph
- SubagentTrace

### BaseChat.tsx
- SwarmOverview
- SwarmProgress
- CompactionIndicator
- BatchProgressPanel
- TaskCardGroup
- SkillCard
- AgentCommunication
- BatchProgress

## Internal Component Dependencies

The following components are consumed only by sibling components within `chat_coding/`, not by any parent files:

- **CodeActionBar** - used by ToolResultCodeBlock
- **CodeSearch** - used by EnhancedCodeBlock
- **CodeMinimap** - used by EnhancedCodeBlock
- **BreadcrumbPath** - used by EnhancedCodeBlock
- **ContentTypeIndicator** - used by EnhancedCodeBlock and FileChangeGroup
- **BatchProgress** - also used internally by BatchProgressPanel (in addition to its BaseChat.tsx import)

## External Dependencies

- **lucide-react** - icons throughout all components
- **react-syntax-highlighter** - syntax highlighting in code blocks
- **mermaid** - diagram rendering (dynamic import in MermaidDiagram)

## Technical Notes

- All components use `memo()` for render optimization
- Dark theme with consistent design language
- Full TypeScript types exported from `index.ts` barrel
