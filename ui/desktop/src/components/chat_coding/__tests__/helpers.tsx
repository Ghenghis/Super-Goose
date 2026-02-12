/**
 * Shared test helpers for chat_coding component tests.
 *
 * Usage in test files:
 *   vi.mock('lucide-react', () => lucideReactMock);
 *
 * This avoids the Proxy-based mock that causes vitest to hang,
 * and the importOriginal pattern that is slow.
 */

// Mock icon component — renders a <span> with data-testid for easy querying
const MockIcon = (props: any) => <span data-testid="mock-icon" {...props} />;

/**
 * Polyfill scrollIntoView for jsdom (not implemented in jsdom).
 * Call this in beforeAll/beforeEach of tests that render components using scrollIntoView.
 */
export function polyfillScrollIntoView() {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
}

/**
 * Complete lucide-react mock with all icons used by chat_coding components.
 * Every icon export is replaced with MockIcon.
 */
export const lucideReactMock = {
  // AgentCommunication
  ArrowRight: MockIcon,
  Radio: MockIcon,
  Filter: MockIcon,
  MessageSquare: MockIcon,
  // AudioPlayer
  Play: MockIcon,
  Pause: MockIcon,
  Volume2: MockIcon,
  VolumeX: MockIcon,
  Volume1: MockIcon,
  Gauge: MockIcon,
  // BatchProgress + CompactionIndicator + SkillCard + TaskCard + SwarmProgress
  Loader2: MockIcon,
  Check: MockIcon,
  X: MockIcon,
  Clock: MockIcon,
  ChevronDown: MockIcon,
  ChevronRight: MockIcon,
  AlertTriangle: MockIcon,
  Scissors: MockIcon,
  Zap: MockIcon,
  Wrench: MockIcon,
  Ban: MockIcon,
  Terminal: MockIcon,
  // BreadcrumbPath + EnhancedCodeBlock + DiffCard + CodeActionBar
  FileCode: MockIcon,
  FileCode2: MockIcon,
  FileJson: MockIcon,
  FileText: MockIcon,
  FileType: MockIcon,
  File: MockIcon,
  FilePlus: MockIcon,
  FilePlus2: MockIcon,
  FileMinus: MockIcon,
  FileX: MockIcon,
  FileX2: MockIcon,
  FileEdit: MockIcon,
  FileSymlink: MockIcon,
  Files: MockIcon,
  Copy: MockIcon,
  WrapText: MockIcon,
  Hash: MockIcon,
  Search: MockIcon,
  Eye: MockIcon,
  EyeOff: MockIcon,
  // ContentTypeIndicator
  Code2: MockIcon,
  Image: MockIcon,
  Music: MockIcon,
  Video: MockIcon,
  Database: MockIcon,
  Settings: MockIcon,
  Globe: MockIcon,
  FileSpreadsheet: MockIcon,
  Braces: MockIcon,
  Paintbrush: MockIcon,
  Lock: MockIcon,
  Package: MockIcon,
  // CodeSearch
  ChevronUp: MockIcon,
  CaseSensitive: MockIcon,
  // ImagePreviewCard
  ImageIcon: MockIcon,
  Download: MockIcon,
  ZoomIn: MockIcon,
  ZoomOut: MockIcon,
  Maximize2: MockIcon,
  Minimize2: MockIcon,
  // MermaidDiagram
  AlertCircle: MockIcon,
  // SubagentTrace
  CheckCircle2: MockIcon,
  ArrowDown: MockIcon,
  Circle: MockIcon,
  // SwarmOverview
  Users: MockIcon,
  GitBranch: MockIcon,
  // ThinkingBlock
  Brain: MockIcon,
  // XCircle (SwarmProgress)
  XCircle: MockIcon,
};
