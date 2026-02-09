import React from 'react';
import { Zap, Code, Brain, Shield, MessageSquare, Palette } from 'lucide-react';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: <Brain className="h-5 w-5 text-purple-400" />,
    title: 'Agentic Intelligence',
    description: 'Multi-agent orchestration with specialist agents for code, testing, and deployment.',
  },
  {
    icon: <Code className="h-5 w-5 text-blue-400" />,
    title: 'Code Generation',
    description: 'Generate, review, and refactor code with context-aware suggestions.',
  },
  {
    icon: <MessageSquare className="h-5 w-5 text-green-400" />,
    title: 'Natural Conversations',
    description: 'Chat naturally with extended thinking, swarm visualization, and task tracking.',
  },
  {
    icon: <Shield className="h-5 w-5 text-orange-400" />,
    title: 'Enterprise Security',
    description: 'Guardrails, policies, and observability for safe autonomous operation.',
  },
  {
    icon: <Palette className="h-5 w-5 text-pink-400" />,
    title: 'Voice Personalities',
    description: 'Choose from multiple voice personalities for spoken responses.',
  },
  {
    icon: <Zap className="h-5 w-5 text-yellow-400" />,
    title: 'MCP Extensions',
    description: 'Extend capabilities with Model Context Protocol tools and integrations.',
  },
];

export default function FeatureHighlights() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {features.map((feature, index) => (
        <div
          key={index}
          className="flex items-start gap-3 rounded-lg border border-border-default bg-background-default p-3 transition-colors hover:bg-background-muted"
        >
          <div className="mt-0.5 flex-shrink-0">{feature.icon}</div>
          <div>
            <h4 className="text-sm font-medium text-text-default">{feature.title}</h4>
            <p className="text-xs text-text-muted mt-0.5">{feature.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
