// Enhanced chat coding components - Claude Desktop / Bolt-style code rendering
export { default as ChatCodingErrorBoundary } from './ChatCodingErrorBoundary';

// Phase 1: Core code rendering
export { default as EnhancedCodeBlock } from './EnhancedCodeBlock';
export { default as DiffCard, parseDiffText } from './DiffCard';
export type { DiffLine, DiffCardProps } from './DiffCard';
export { default as FileChangeGroup } from './FileChangeGroup';
export type { FileChange, FileChangeGroupProps } from './FileChangeGroup';
export { default as CodeActionBar, LANGUAGE_META } from './CodeActionBar';
export { default as ToolResultCodeBlock } from './ToolResultCodeBlock';
export { detectLanguageFromPath, looksLikeCode } from './ToolResultCodeBlock';

// Phase 2: Code navigation
export { default as CodeSearch, findMatches } from './CodeSearch';
export type { CodeSearchProps, CodeSearchMatch } from './CodeSearch';
export { default as CodeMinimap } from './CodeMinimap';
export type { CodeMinimapProps } from './CodeMinimap';
export { default as BreadcrumbPath } from './BreadcrumbPath';
export type { BreadcrumbPathProps } from './BreadcrumbPath';

// Phase 3: Thinking & media
export { default as ThinkingBlock } from './ThinkingBlock';
export { default as ImagePreviewCard } from './ImagePreviewCard';
export { default as AudioPlayer } from './AudioPlayer';
export { default as ContentTypeIndicator } from './ContentTypeIndicator';
export type { ThinkingBlockProps } from './ThinkingBlock';
export type { ImagePreviewCardProps } from './ImagePreviewCard';
export type { AudioPlayerProps } from './AudioPlayer';

// Phase 4: Multi-agent / swarm visualization
export { default as SwarmOverview } from './SwarmOverview';
export { default as SubagentTrace } from './SubagentTrace';
export { default as AgentCommunication } from './AgentCommunication';
export { default as SwarmProgress } from './SwarmProgress';
export type { AgentInfo, AgentStatus, SwarmOverviewProps } from './SwarmOverview';
export type { TraceEvent, TraceEventType, SubagentTraceProps } from './SubagentTrace';
export type { AgentMessage, AgentMessageType, AgentCommunicationProps } from './AgentCommunication';
export type { SwarmProgressProps } from './SwarmProgress';

// Phase 5: Task & workflow visualization
export { default as TaskCard, TaskCardGroup } from './TaskCard';
export type { TaskCardProps, TaskStatus, TaskLog, SubTask } from './TaskCard';
export { default as TaskGraph } from './TaskGraph';
export { default as BatchProgress } from './BatchProgress';
export { default as BatchProgressPanel } from './BatchProgressPanel';
export { default as SkillCard } from './SkillCard';
export { default as CompactionIndicator } from './CompactionIndicator';
export type { TaskGraphNode, TaskGraphProps } from './TaskGraph';
export type { BatchItem, BatchProgressProps } from './BatchProgress';
export type { BatchProgressPanelProps } from './BatchProgressPanel';
export type { SkillToolCall, SkillCardProps } from './SkillCard';
export type { CompactionIndicatorProps } from './CompactionIndicator';

// Phase 6: Diagram & chart rendering
export { default as MermaidDiagram } from './MermaidDiagram';
export { default as RechartsWrapper } from './RechartsWrapper';
export type { MermaidDiagramProps } from './MermaidDiagram';
export { detectContentType } from './ContentTypeIndicator';
export type { ContentType, ContentTypeIndicatorProps } from './ContentTypeIndicator';
export type { RechartsWrapperProps } from './RechartsWrapper';
