import type { ReactNode } from 'react';
import {
  Shield,
  Mic,
  Brain,
  FileText,
  Network,
  MessageSquare,
} from 'lucide-react';
import { cn } from '../../utils';

interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: <Shield className="size-5" />,
    title: 'Enterprise Security',
    description: '6 guardrail detectors protect your sessions',
  },
  {
    icon: <Mic className="size-5" />,
    title: 'Voice Assistant',
    description: 'Talk to your AI with personality voices',
  },
  {
    icon: <Brain className="size-5" />,
    title: 'Smart Memory',
    description: 'AI remembers across sessions',
  },
  {
    icon: <FileText className="size-5" />,
    title: 'Policy Engine',
    description: 'YAML-based rules for compliance',
  },
  {
    icon: <Network className="size-5" />,
    title: 'MCP Gateway',
    description: 'Enterprise tool routing with audit',
  },
  {
    icon: <MessageSquare className="size-5" />,
    title: 'Enhanced Chat',
    description: 'Regenerate, export, and more',
  },
];

export default function FeatureHighlights({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      {features.map((feature) => (
        <div
          key={feature.title}
          className="flex items-start gap-3 rounded-lg border border-border-default bg-background-default p-3 transition-colors hover:bg-background-muted"
        >
          <div className="mt-0.5 flex-shrink-0 text-text-muted">{feature.icon}</div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-default">{feature.title}</p>
            <p className="text-xs text-text-muted leading-relaxed">{feature.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
