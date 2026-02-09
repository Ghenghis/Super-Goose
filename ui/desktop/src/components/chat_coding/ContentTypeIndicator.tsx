import { memo, useMemo } from 'react';
import {
  Code2,
  FileText,
  Image,
  Music,
  Video,
  Database,
  Settings,
  Terminal,
  Globe,
  FileJson,
  FileSpreadsheet,
  Braces,
  Hash,
  Paintbrush,
  Lock,
  Package,
  type LucideIcon,
} from 'lucide-react';

export type ContentType =
  | 'code'
  | 'markdown'
  | 'image'
  | 'audio'
  | 'video'
  | 'data'
  | 'config'
  | 'shell'
  | 'web'
  | 'json'
  | 'csv'
  | 'style'
  | 'binary'
  | 'security'
  | 'package'
  | 'unknown';

interface ContentTypeConfig {
  icon: LucideIcon;
  label: string;
  color: string;
  bgColor: string;
}

const TYPE_CONFIG: Record<ContentType, ContentTypeConfig> = {
  code: { icon: Code2, label: 'Code', color: 'text-blue-400', bgColor: 'bg-blue-400/10' },
  markdown: { icon: FileText, label: 'Markdown', color: 'text-purple-400', bgColor: 'bg-purple-400/10' },
  image: { icon: Image, label: 'Image', color: 'text-green-400', bgColor: 'bg-green-400/10' },
  audio: { icon: Music, label: 'Audio', color: 'text-yellow-400', bgColor: 'bg-yellow-400/10' },
  video: { icon: Video, label: 'Video', color: 'text-red-400', bgColor: 'bg-red-400/10' },
  data: { icon: Database, label: 'Data', color: 'text-cyan-400', bgColor: 'bg-cyan-400/10' },
  config: { icon: Settings, label: 'Config', color: 'text-orange-400', bgColor: 'bg-orange-400/10' },
  shell: { icon: Terminal, label: 'Shell', color: 'text-emerald-400', bgColor: 'bg-emerald-400/10' },
  web: { icon: Globe, label: 'Web', color: 'text-indigo-400', bgColor: 'bg-indigo-400/10' },
  json: { icon: FileJson, label: 'JSON', color: 'text-amber-400', bgColor: 'bg-amber-400/10' },
  csv: { icon: FileSpreadsheet, label: 'CSV', color: 'text-teal-400', bgColor: 'bg-teal-400/10' },
  style: { icon: Paintbrush, label: 'Style', color: 'text-pink-400', bgColor: 'bg-pink-400/10' },
  binary: { icon: Braces, label: 'Binary', color: 'text-gray-400', bgColor: 'bg-gray-400/10' },
  security: { icon: Lock, label: 'Security', color: 'text-red-500', bgColor: 'bg-red-500/10' },
  package: { icon: Package, label: 'Package', color: 'text-violet-400', bgColor: 'bg-violet-400/10' },
  unknown: { icon: Hash, label: 'File', color: 'text-gray-400', bgColor: 'bg-gray-400/10' },
};

const EXTENSION_MAP: Record<string, ContentType> = {
  // Code
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code', py: 'code', rs: 'code',
  go: 'code', java: 'code', cpp: 'code', c: 'code', h: 'code', hpp: 'code',
  rb: 'code', php: 'code', swift: 'code', kt: 'code', scala: 'code',
  // Markdown
  md: 'markdown', mdx: 'markdown', rst: 'markdown', txt: 'markdown',
  // Image
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image',
  webp: 'image', ico: 'image', bmp: 'image',
  // Audio
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', aac: 'audio',
  // Video
  mp4: 'video', webm: 'video', avi: 'video', mov: 'video', mkv: 'video',
  // Data
  sql: 'data', db: 'data', sqlite: 'data',
  // Config
  yml: 'config', yaml: 'config', toml: 'config', ini: 'config', env: 'config',
  // Shell
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell', ps1: 'shell',
  bat: 'shell', cmd: 'shell',
  // Web
  html: 'web', htm: 'web', css: 'web', scss: 'web', less: 'web', vue: 'web',
  svelte: 'web',
  // JSON
  json: 'json', jsonl: 'json', json5: 'json',
  // CSV
  csv: 'csv', tsv: 'csv', xls: 'csv', xlsx: 'csv',
  // Style
  sass: 'style', styl: 'style', postcss: 'style',
  // Security
  pem: 'security', key: 'security', cert: 'security', crt: 'security',
  // Package
  lock: 'package', 'package.json': 'package',
};

export interface ContentTypeIndicatorProps {
  /** File path or name to detect type from */
  filePath?: string;
  /** Explicit content type override */
  type?: ContentType;
  /** Show label text next to icon */
  showLabel?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Detects content type from file extension.
 */
export function detectContentType(filePath: string): ContentType {
  const fileName = filePath.split('/').pop()?.split('\\').pop() || '';
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';

  // Check special filenames
  if (fileName === 'Dockerfile' || fileName === 'Makefile') return 'config';
  if (fileName === 'package.json' || fileName === 'Cargo.toml') return 'package';
  if (fileName === '.gitignore' || fileName === '.editorconfig') return 'config';
  if (fileName.startsWith('.env')) return 'config';

  return EXTENSION_MAP[ext] || 'unknown';
}

const SIZE_CLASSES = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
} as const;

const LABEL_CLASSES = {
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
} as const;

/**
 * ContentTypeIndicator — shows an icon + optional label for a file's content type.
 * Automatically detects type from file extension or accepts explicit type prop.
 */
const ContentTypeIndicator = memo(function ContentTypeIndicator({
  filePath,
  type,
  showLabel = false,
  size = 'sm',
}: ContentTypeIndicatorProps) {
  const contentType = useMemo(() => {
    if (type) return type;
    if (filePath) return detectContentType(filePath);
    return 'unknown' as ContentType;
  }, [type, filePath]);

  const config = TYPE_CONFIG[contentType];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 ${config.bgColor} ${config.color} rounded px-1.5 py-0.5`}
      data-testid="content-type-indicator"
      title={config.label}
    >
      <Icon className={SIZE_CLASSES[size]} />
      {showLabel && (
        <span className={`${LABEL_CLASSES[size]} font-medium`}>{config.label}</span>
      )}
    </span>
  );
});

export default ContentTypeIndicator;
