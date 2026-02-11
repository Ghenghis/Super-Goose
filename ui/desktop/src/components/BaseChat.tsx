import { AppEvents } from '../constants/events';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SearchView } from './conversation/SearchView';
import LoadingGoose from './LoadingGoose';
import PopularChatTopics from './PopularChatTopics';
import ProgressiveMessageList from './ProgressiveMessageList';
import { MainPanelLayout } from './Layout/MainPanelLayout';
import ChatInput from './ChatInput';
import { ScrollArea, ScrollAreaHandle } from './ui/scroll-area';
import { useFileDrop } from '../hooks/useFileDrop';
import { Message } from '../api';
import { ChatState } from '../types/chatState';
import { ChatType } from '../types/chat';
import { useIsMobile } from '../hooks/use-mobile';
import { useSidebar } from './ui/sidebar';
import { cn } from '../utils';
import { useChatStream } from '../hooks/useChatStream';
import { useNavigation } from '../hooks/useNavigation';
import { RecipeHeader } from './RecipeHeader';
import { RecipeWarningModal } from './ui/RecipeWarningModal';
import { scanRecipe } from '../recipe';
import { UserInput } from '../types/message';
import { useCostTracking } from '../hooks/useCostTracking';
import RecipeActivities from './recipes/RecipeActivities';
import { useToolCount } from './alerts/useToolCount';
import { getThinkingMessage, getTextAndImageContent, getToolRequests, getToolResponses } from '../types/message';
import ParameterInputModal from './ParameterInputModal';
import { substituteParameters } from '../utils/providerUtils';
import CreateRecipeFromSessionModal from './recipes/CreateRecipeFromSessionModal';
import { toastSuccess } from '../toasts';
import { Recipe } from '../recipe';
import { useAutoSubmit } from '../hooks/useAutoSubmit';
import { Goose } from './icons';
import EnvironmentBadge from './GooseSidebar/EnvironmentBadge';
import { SwarmOverview, SwarmProgress, CompactionIndicator, BatchProgressPanel, TaskCardGroup, SkillCard, AgentCommunication, BatchProgress, ChatCodingErrorBoundary } from './chat_coding';
import type { AgentInfo, TaskCardProps, SkillToolCall, AgentMessage, BatchItem } from './chat_coding';

const CurrentModelContext = createContext<{ model: string; mode: string } | null>(null);
export const useCurrentModelInfo = () => useContext(CurrentModelContext);

interface BaseChatProps {
  setChat: (chat: ChatType) => void;
  onMessageSubmit?: (message: string) => void;
  renderHeader?: () => React.ReactNode;
  customChatInputProps?: Record<string, unknown>;
  customMainLayoutProps?: Record<string, unknown>;
  contentClassName?: string;
  disableSearch?: boolean;
  showPopularTopics?: boolean;
  suppressEmptyState: boolean;
  sessionId: string;
  isActiveSession: boolean;
  initialMessage?: UserInput;
}

export default function BaseChat({
  setChat,
  renderHeader,
  customChatInputProps = {},
  customMainLayoutProps = {},
  sessionId,
  initialMessage,
  isActiveSession,
}: BaseChatProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<ScrollAreaHandle>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const disableAnimation = location.state?.disableAnimation || false;
  const [hasStartedUsingRecipe, setHasStartedUsingRecipe] = React.useState(false);
  const [hasNotAcceptedRecipe, setHasNotAcceptedRecipe] = useState<boolean>();
  const [hasRecipeSecurityWarnings, setHasRecipeSecurityWarnings] = useState(false);

  const isMobile = useIsMobile();
  const { state: sidebarState } = useSidebar();
  const setView = useNavigation();

  const contentClassName = cn(
    'pr-1 pb-10 pt-10',
    (isMobile || sidebarState === 'collapsed') && 'pt-14'
  );
  const { droppedFiles, setDroppedFiles, handleDrop, handleDragOver } = useFileDrop();

  const onStreamFinish = useCallback(() => {}, []);

  const [isCreateRecipeModalOpen, setIsCreateRecipeModalOpen] = useState(false);

  const {
    session,
    messages,
    chatState,
    setChatState,
    handleSubmit,
    submitElicitationResponse,
    stopStreaming,
    sessionLoadError,
    setRecipeUserParams,
    tokenState,
    notifications: toolCallNotifications,
    onMessageUpdate,
  } = useChatStream({
    sessionId,
    onStreamFinish,
  });

  useAutoSubmit({
    sessionId,
    session,
    messages,
    chatState,
    initialMessage,
    handleSubmit,
  });

  useEffect(() => {
    let streamState: 'idle' | 'loading' | 'streaming' | 'error' = 'idle';
    if (chatState === ChatState.LoadingConversation) {
      streamState = 'loading';
    } else if (
      chatState === ChatState.Streaming ||
      chatState === ChatState.Thinking ||
      chatState === ChatState.Compacting
    ) {
      streamState = 'streaming';
    } else if (sessionLoadError) {
      streamState = 'error';
    }

    window.dispatchEvent(
      new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, {
        detail: {
          sessionId,
          streamState,
          messageCount: messages.length,
        },
      })
    );
  }, [sessionId, chatState, messages.length, sessionLoadError]);

  // Generate command history from user messages (most recent first)
  const commandHistory = useMemo(() => {
    return messages
      .reduce<string[]>((history, message) => {
        if (message.role === 'user') {
          const text = getTextAndImageContent(message).textContent.trim();
          if (text) {
            history.push(text);
          }
        }
        return history;
      }, [])
      .reverse();
  }, [messages]);

  // Snapshot token count before compaction for CompactionIndicator
  const compactionTokensRef = useRef<{ before?: number; after?: number }>({});
  useEffect(() => {
    if (chatState === ChatState.Compacting && tokenState?.totalTokens) {
      compactionTokensRef.current.before = tokenState.totalTokens;
      compactionTokensRef.current.after = undefined;
    } else if (chatState === ChatState.Idle && compactionTokensRef.current.before && !compactionTokensRef.current.after && tokenState?.totalTokens) {
      compactionTokensRef.current.after = tokenState.totalTokens;
    }
  }, [chatState, tokenState?.totalTokens]);

  // Derive agent info from subagent notifications for SwarmOverview
  const agentInfos = useMemo<AgentInfo[]>(() => {
    const agentMap = new Map<string, { id: string; toolCalls: string[]; firstSeen: number; lastSeen: number }>();
    toolCallNotifications.forEach((notifs) => {
      for (const notif of notifs) {
        const msg = notif.message as { method?: string; params?: { data?: unknown } };
        if (msg.method !== 'notifications/message') continue;
        const data = msg.params?.data as Record<string, unknown> | undefined;
        if (!data || data.type !== 'subagent_tool_request') continue;
        const agentId = data.subagent_id as string;
        const toolCall = data.tool_call as { name?: string } | undefined;
        const toolName = toolCall?.name || 'unknown';
        const existing = agentMap.get(agentId) || { id: agentId, toolCalls: [], firstSeen: Date.now(), lastSeen: Date.now() };
        existing.toolCalls.push(toolName);
        existing.lastSeen = Date.now();
        agentMap.set(agentId, existing);
      }
    });
    return Array.from(agentMap.values()).map(agent => ({
      id: agent.id,
      name: `Agent ${agent.id.length > 8 ? agent.id.slice(-6) : agent.id}`,
      status: (chatState !== ChatState.Idle ? 'running' : 'completed') as 'idle' | 'running' | 'completed' | 'error',
      currentTask: agent.toolCalls[agent.toolCalls.length - 1],
      startedAt: agent.firstSeen,
      completedAt: chatState === ChatState.Idle ? agent.lastSeen : undefined,
      toolCallCount: agent.toolCalls.length,
    }));
  }, [toolCallNotifications, chatState]);

  const swarmCounts = useMemo(() => {
    const completed = agentInfos.filter((a: AgentInfo) => a.status === 'completed').length;
    const failed = agentInfos.filter((a: AgentInfo) => a.status === 'error').length;
    const phase = chatState === ChatState.Idle ? 'Complete' : chatState === ChatState.Compacting ? 'Compacting' : agentInfos.length > 0 ? 'Multi-agent execution' : undefined;
    return { total: agentInfos.length, completed, failed, phase };
  }, [agentInfos, chatState]);

  // Shared response map — built once, used by all data pipelines below
  const toolResponseMap = useMemo(() => {
    const map = new Map<string, { status: string; text?: string }>();
    for (const msg of messages) {
      for (const resp of getToolResponses(msg)) {
        const toolResult = resp.toolResult as Record<string, unknown>;
        const status = (typeof toolResult?.status === 'string') ? toolResult.status : 'success';
        const resultValue = toolResult?.value;
        let text: string | undefined;
        if (resultValue && typeof resultValue === 'object') {
          const content = (resultValue as Record<string, unknown>)?.content;
          if (Array.isArray(content) && content.length > 0) {
            const first = content[0];
            if (first && typeof first === 'object' && 'text' in first) {
              text = typeof (first as Record<string, unknown>).text === 'string'
                ? ((first as Record<string, unknown>).text as string)
                : undefined;
            }
          }
        }
        map.set(resp.id, { status, text });
      }
    }
    return map;
  }, [messages]);

  // Batch progress tracking - derives tool call statuses from messages
  const batchToolStatuses = useMemo<Map<string, { label: string; status: 'pending' | 'processing' | 'completed' | 'error'; result?: string }>>(() => {
    const map = new Map<string, { label: string; status: 'pending' | 'processing' | 'completed' | 'error'; result?: string }>();
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      for (const req of getToolRequests(msg)) {
        const toolCall = req.toolCall as Record<string, unknown>;
        const toolValue = toolCall?.value as { name?: string } | undefined;
        const fullName = (toolValue?.name as string) || (toolCall?.name as string) || 'unknown';
        const lastIdx = fullName.lastIndexOf('__');
        const toolName = lastIdx === -1 ? fullName : fullName.substring(lastIdx + 2);
        const response = toolResponseMap.get(req.id);
        let status: 'pending' | 'processing' | 'completed' | 'error';
        let result: string | undefined;
        if (!response) {
          status = chatState !== ChatState.Idle ? 'processing' : 'pending';
        } else if (response.status === 'error') {
          status = 'error';
          result = response.text || 'Error';
        } else {
          status = 'completed';
          result = 'Done';
        }
        map.set(req.id, { label: toolName, status, result });
      }
    }
    return map;
  }, [messages, chatState, toolResponseMap]);

  // Task cards derived from tool_graph in code execution tool calls
  const tasks = useMemo<TaskCardProps[]>(() => {
    const result: TaskCardProps[] = [];
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      for (const req of getToolRequests(msg)) {
        const tc = req.toolCall as Record<string, unknown>;
        const tv = tc?.value as { name?: string; arguments?: Record<string, unknown> } | undefined;
        const args = tv?.arguments || (tc?.arguments as Record<string, unknown>) || {};
        const toolGraph = args.tool_graph as Array<{ tool: string; description: string; depends_on: number[] }> | undefined;
        if (!toolGraph || toolGraph.length === 0) continue;
        const resp = toolResponseMap.get(req.id);
        const isRunning = !resp && chatState !== ChatState.Idle;
        result.push({
          id: req.id,
          title: `${toolGraph.length}-step execution plan`,
          status: (resp ? (resp.status === 'error' ? 'error' : 'success') : (isRunning ? 'running' : 'pending')) as 'pending' | 'running' | 'success' | 'error' | 'cancelled',
          startedAt: msg.created * 1000,
          completedAt: resp ? Date.now() : undefined,
          subtasks: toolGraph.map((node, idx) => ({
            id: `${req.id}-${idx}`,
            title: `${node.tool}: ${node.description}`,
            status: (resp ? 'success' : (isRunning && idx === 0 ? 'running' : 'pending')) as 'pending' | 'running' | 'success' | 'error' | 'cancelled',
          })),
        });
      }
    }
    return result;
  }, [messages, chatState, toolResponseMap]);

  // Skill cards grouped by MCP extension
  const skills = useMemo<{ name: string; description: string; toolCalls: SkillToolCall[]; status: 'running' | 'completed' | 'error' }[]>(() => {
    const groups = new Map<string, { name: string; calls: Array<{ req: { id: string; toolCall: Record<string, unknown> }; resp?: { status: string; text?: string } }> }>();
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      for (const req of getToolRequests(msg)) {
        const tc = req.toolCall as Record<string, unknown>;
        const tv = tc?.value as { name?: string } | undefined;
        const fullName = (tv?.name as string) || (tc?.name as string) || 'unknown';
        const delimIdx = fullName.lastIndexOf('__');
        const extName = delimIdx === -1 ? 'default' : fullName.substring(0, delimIdx);
        if (!groups.has(extName)) groups.set(extName, { name: extName, calls: [] });
        groups.get(extName)!.calls.push({ req: { id: req.id, toolCall: tc }, resp: toolResponseMap.get(req.id) });
      }
    }
    return Array.from(groups.values())
      .filter(g => g.calls.length >= 2)
      .map(g => {
        const allDone = g.calls.every(c => c.resp);
        const anyError = g.calls.some(c => c.resp?.status === 'error');
        return {
          name: g.name.replace(/_/g, ' '),
          description: `${g.calls.length} tool calls`,
          toolCalls: g.calls.map(c => {
            const tc = c.req.toolCall;
            const tv = tc?.value as { name?: string } | undefined;
            const fullName = (tv?.name as string) || (tc?.name as string) || 'unknown';
            const lastIdx = fullName.lastIndexOf('__');
            const toolName = lastIdx === -1 ? fullName : fullName.substring(lastIdx + 2);
            return {
              tool: toolName,
              status: (!c.resp ? (chatState !== ChatState.Idle ? 'running' : 'pending') : c.resp.status === 'error' ? 'error' : 'completed') as 'pending' | 'running' | 'completed' | 'error',
              input: (() => { try { return JSON.stringify((tc?.value as Record<string, unknown>)?.arguments || {}).slice(0, 200); } catch { return '[complex data]'; } })(),
              output: c.resp?.text?.slice(0, 200),
            };
          }),
          status: (anyError ? 'error' : allDone ? 'completed' : 'running') as 'running' | 'completed' | 'error',
        };
      });
  }, [messages, chatState, toolResponseMap]);

  // Agent communication messages from subagent notifications
  const agentMessages = useMemo<AgentMessage[]>(() => {
    const msgs: AgentMessage[] = [];
    toolCallNotifications.forEach((notifs) => {
      for (const notif of notifs) {
        const msg = notif.message as { method?: string; params?: { data?: unknown } };
        if (msg.method !== 'notifications/message') continue;
        const data = msg.params?.data as Record<string, unknown> | undefined;
        if (!data || data.type !== 'subagent_tool_request') continue;
        const toolCall = data.tool_call as { name?: string } | undefined;
        msgs.push({
          from: 'orchestrator',
          to: data.subagent_id as string,
          content: `Tool request: ${toolCall?.name || 'unknown'}`,
          timestamp: Date.now(),
          type: 'request' as const,
        });
      }
    });
    return msgs;
  }, [toolCallNotifications]);

  // Batch progress items derived from the latest assistant message's tool calls
  const batchItems = useMemo<BatchItem[]>(() => {
    const lastAssistantMsg = [...messages].reverse().find(m =>
      m.role === 'assistant' && getToolRequests(m).length > 0
    );
    if (!lastAssistantMsg) return [];
    return getToolRequests(lastAssistantMsg).map(req => {
      const toolCall = req.toolCall as Record<string, unknown>;
      const toolValue = toolCall?.value as { name?: string } | undefined;
      const fullName = (toolValue?.name as string) || (toolCall?.name as string) || 'unknown';
      const lastIdx = fullName.lastIndexOf('__');
      const toolName = lastIdx === -1 ? fullName : fullName.substring(lastIdx + 2);
      const response = toolResponseMap.get(req.id);
      return {
        id: req.id,
        label: toolName,
        status: (!response ? (chatState !== ChatState.Idle ? 'processing' : 'pending') : response.status === 'error' ? 'error' : 'completed') as 'pending' | 'processing' | 'completed' | 'error',
        result: response?.status !== 'error' && response ? 'Done' : undefined,
        error: response?.status === 'error' ? (response.text || 'Error') : undefined,
      };
    });
  }, [messages, chatState, toolResponseMap]);

  const chatInputSubmit = (input: UserInput) => {
    if (recipe && input.msg.trim()) {
      setHasStartedUsingRecipe(true);
    }
    handleSubmit(input);
  };

  const { sessionCosts } = useCostTracking({
    sessionInputTokens: session?.accumulated_input_tokens || 0,
    sessionOutputTokens: session?.accumulated_output_tokens || 0,
    localInputTokens: 0,
    localOutputTokens: 0,
    session,
  });

  const recipe = session?.recipe;

  useEffect(() => {
    if (!recipe) return;

    (async () => {
      const accepted = await window.electron.hasAcceptedRecipeBefore(recipe);
      setHasNotAcceptedRecipe(!accepted);

      if (!accepted) {
        const scanResult = await scanRecipe(recipe);
        setHasRecipeSecurityWarnings(scanResult.has_security_warnings);
      }
    })();
  }, [recipe]);

  const handleRecipeAccept = async (accept: boolean) => {
    if (recipe && accept) {
      await window.electron.recordRecipeHash(recipe);
      setHasNotAcceptedRecipe(false);
    } else {
      setView('chat');
    }
  };

  // Track if this is the initial render for session resuming
  const initialRenderRef = useRef(true);

  // Auto-scroll when messages are loaded (for session resuming)
  const handleRenderingComplete = React.useCallback(() => {
    // Only force scroll on the very first render
    if (initialRenderRef.current && messages.length > 0) {
      initialRenderRef.current = false;
      if (scrollRef.current?.scrollToBottom) {
        scrollRef.current.scrollToBottom();
      }
    } else if (scrollRef.current?.isFollowing) {
      if (scrollRef.current?.scrollToBottom) {
        scrollRef.current.scrollToBottom();
      }
    }
  }, [messages.length]);

  const toolCount = useToolCount(sessionId);

  // Listen for global scroll-to-bottom requests (e.g., from MCP UI prompt actions)
  useEffect(() => {
    const handleGlobalScrollRequest = () => {
      // Add a small delay to ensure content has been rendered
      setTimeout(() => {
        if (scrollRef.current?.scrollToBottom) {
          scrollRef.current.scrollToBottom();
        }
      }, 200);
    };

    window.addEventListener(AppEvents.SCROLL_CHAT_TO_BOTTOM, handleGlobalScrollRequest);
    return () =>
      window.removeEventListener(AppEvents.SCROLL_CHAT_TO_BOTTOM, handleGlobalScrollRequest);
  }, []);

  useEffect(() => {
    if (
      isActiveSession &&
      sessionId &&
      chatInputRef.current &&
      chatState !== ChatState.LoadingConversation
    ) {
      const timeoutId = setTimeout(() => {
        chatInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [isActiveSession, sessionId, chatState]);

  useEffect(() => {
    const handleMakeAgent = () => {
      setIsCreateRecipeModalOpen(true);
    };

    window.addEventListener('make-agent-from-chat', handleMakeAgent);
    return () => window.removeEventListener('make-agent-from-chat', handleMakeAgent);
  }, []);

  useEffect(() => {
    const handleSessionForked = (event: Event) => {
      const customEvent = event as CustomEvent<{
        newSessionId: string;
        shouldStartAgent?: boolean;
        editedMessage?: string;
      }>;
      window.dispatchEvent(new CustomEvent(AppEvents.SESSION_CREATED));
      const { newSessionId, shouldStartAgent, editedMessage } = customEvent.detail;

      const params = new URLSearchParams();
      params.set('resumeSessionId', newSessionId);
      if (shouldStartAgent) {
        params.set('shouldStartAgent', 'true');
      }

      navigate(`/pair?${params.toString()}`, {
        state: {
          disableAnimation: true,
          initialMessage: editedMessage ? { msg: editedMessage, images: [] } : undefined,
        },
      });
    };

    window.addEventListener(AppEvents.SESSION_FORKED, handleSessionForked);

    return () => {
      window.removeEventListener(AppEvents.SESSION_FORKED, handleSessionForked);
    };
  }, [location.pathname, navigate]);

  const handleRecipeCreated = (recipe: Recipe) => {
    toastSuccess({
      title: 'Recipe created successfully!',
      msg: `"${recipe.title}" has been saved and is ready to use.`,
    });
  };

  const showPopularTopics =
    messages.length === 0 && !initialMessage && chatState === ChatState.Idle;

  const chat: ChatType = {
    messages,
    recipe,
    sessionId,
    name: session?.name || 'No Session',
  };

  const lastSetNameRef = useRef<string>('');

  useEffect(() => {
    const currentSessionName = session?.name;
    if (currentSessionName && currentSessionName !== lastSetNameRef.current) {
      lastSetNameRef.current = currentSessionName;
      setChat({
        messages,
        recipe,
        sessionId,
        name: currentSessionName,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.name, setChat]);

  // If we have a recipe prompt and user recipe values, substitute parameters
  let recipePrompt = '';
  if (messages.length === 0 && recipe?.prompt) {
    recipePrompt = session?.user_recipe_values
      ? substituteParameters(recipe.prompt, session.user_recipe_values)
      : recipe.prompt;
  }

  const initialPrompt = recipePrompt;

  const chatSessionRef = useMemo(() => ({ sessionId }), [sessionId]);

  if (sessionLoadError) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <MainPanelLayout
          backgroundColor={'bg-background-muted'}
          removeTopPadding={true}
          {...customMainLayoutProps}
        >
          {renderHeader && renderHeader()}
          <div className="flex flex-col flex-1 mb-0.5 min-h-0 relative">
            <div className="flex-1 bg-background-default rounded-b-2xl flex items-center justify-center">
              <div className="flex flex-col items-center justify-center p-8">
                <div className="text-red-700 dark:text-red-300 bg-red-400/50 p-4 rounded-lg mb-4 max-w-md">
                  <h3 className="font-semibold mb-2">Failed to Load Session</h3>
                  <p className="text-sm">{sessionLoadError}</p>
                </div>
                <button
                  onClick={() => {
                    setView('chat');
                  }}
                  className="px-4 py-2 text-center cursor-pointer text-text-default border border-border-default hover:bg-background-muted rounded-lg transition-all duration-150"
                >
                  Go home
                </button>
              </div>
            </div>
          </div>
        </MainPanelLayout>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <MainPanelLayout
        backgroundColor={'bg-background-muted'}
        removeTopPadding={true}
        {...customMainLayoutProps}
      >
        {/* Custom header */}
        {renderHeader && renderHeader()}

        {/* Chat container with sticky recipe header */}
        <div className="flex flex-col flex-1 mb-0.5 min-h-0 relative">
          <div className="absolute top-3 right-4 z-[60] flex flex-row items-center gap-1">
            <a
              href="https://ghenghis.github.io/Super-Goose"
              target="_blank"
              rel="noopener noreferrer"
              className="no-drag flex flex-row items-center gap-1 hover:opacity-80 transition-opacity"
            >
              <Goose className="size-5 goose-icon-animation" />
              <span className="text-sm leading-none text-text-muted -translate-y-px">goose</span>
            </a>
            <EnvironmentBadge className="translate-y-px" />
          </div>

          <ScrollArea
            ref={scrollRef}
            className={`flex-1 bg-background-default rounded-b-2xl min-h-0 relative ${contentClassName}`}
            autoScroll
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            data-drop-zone="true"
            paddingX={6}
            paddingY={0}
          >
            {recipe?.title && (
              <div className="sticky top-0 z-10 bg-background-default px-0 -mx-6 mb-6 pt-6">
                <RecipeHeader title={recipe.title} />
              </div>
            )}

            {recipe && (
              <div className={hasStartedUsingRecipe ? 'mb-6' : ''}>
                <RecipeActivities
                  append={(text: string) => handleSubmit({ msg: text, images: [] })}
                  activities={Array.isArray(recipe.activities) ? recipe.activities : null}
                  title={recipe.title}
                  parameterValues={session?.user_recipe_values || {}}
                />
              </div>
            )}

            {messages.length > 0 || recipe ? (
              <>
                <ChatCodingErrorBoundary componentName="Chat analytics">
                  {agentInfos.length > 0 && (
                    <div className="mb-4 space-y-2">
                      <SwarmProgress
                        totalAgents={swarmCounts.total}
                        completedAgents={swarmCounts.completed}
                        failedAgents={swarmCounts.failed}
                        currentPhase={swarmCounts.phase}
                      />
                      <SwarmOverview agents={agentInfos} />
                    </div>
                  )}

                  {batchToolStatuses.size > 0 && (
                    <div className="mb-4">
                      <BatchProgressPanel toolStatuses={batchToolStatuses} />
                    </div>
                  )}

                  {tasks.length > 0 && (
                    <div className="mb-4">
                      <TaskCardGroup title="Active Tasks" tasks={tasks} />
                    </div>
                  )}

                  {skills.map((skill: { name: string; description: string; toolCalls: SkillToolCall[]; status: 'running' | 'completed' | 'error' }, i: number) => (
                    <div key={`skill-${i}`} className="mb-4">
                      <SkillCard
                        name={skill.name}
                        description={skill.description}
                        toolCalls={skill.toolCalls}
                        status={skill.status}
                      />
                    </div>
                  ))}
                  {agentMessages.length > 0 && (
                    <div className="mb-4">
                      <AgentCommunication messages={agentMessages} />
                    </div>
                  )}
                  {batchItems.length > 0 && (
                    <div className="mb-4">
                      <BatchProgress items={batchItems} title="Task Progress" />
                    </div>
                  )}
                </ChatCodingErrorBoundary>
                <SearchView>
                  <ProgressiveMessageList
                    messages={messages}
                    chat={chatSessionRef}
                    toolCallNotifications={toolCallNotifications}
                    append={(text: string) => handleSubmit({ msg: text, images: [] })}
                    isUserMessage={(m: Message) => m.role === 'user'}
                    isStreamingMessage={chatState !== ChatState.Idle}
                    onRenderingComplete={handleRenderingComplete}
                    onMessageUpdate={onMessageUpdate}
                    submitElicitationResponse={submitElicitationResponse}
                  />
                </SearchView>

                <div className="block h-8" />
              </>
            ) : !recipe && showPopularTopics ? (
              <PopularChatTopics
                append={(text: string) => handleSubmit({ msg: text, images: [] })}
              />
            ) : null}
          </ScrollArea>

          <ChatCodingErrorBoundary componentName="Compaction indicator">
            {(chatState === ChatState.Compacting || compactionTokensRef.current.after) && (
              <div className="absolute top-2 right-4 z-20">
                <CompactionIndicator
                  isCompacting={chatState === ChatState.Compacting}
                  beforeTokens={compactionTokensRef.current.before}
                  afterTokens={compactionTokensRef.current.after}
                />
              </div>
            )}
          </ChatCodingErrorBoundary>
          {chatState !== ChatState.Idle && (
            <div className="absolute bottom-1 left-4 z-20 pointer-events-none">
              <LoadingGoose
                chatState={chatState}
                message={
                  messages.length > 0
                    ? getThinkingMessage(messages[messages.length - 1])
                    : undefined
                }
              />
            </div>
          )}
        </div>

        <div
          className={`relative z-10 ${disableAnimation ? '' : 'animate-[fadein_400ms_ease-in_forwards]'}`}
        >
          <ChatInput
            inputRef={chatInputRef}
            sessionId={sessionId}
            handleSubmit={chatInputSubmit}
            chatState={chatState}
            setChatState={setChatState}
            onStop={stopStreaming}
            commandHistory={commandHistory}
            initialValue={initialPrompt}
            setView={setView}
            totalTokens={tokenState?.totalTokens ?? session?.total_tokens ?? undefined}
            accumulatedInputTokens={
              tokenState?.accumulatedInputTokens ?? session?.accumulated_input_tokens ?? undefined
            }
            accumulatedOutputTokens={
              tokenState?.accumulatedOutputTokens ?? session?.accumulated_output_tokens ?? undefined
            }
            droppedFiles={droppedFiles}
            onFilesProcessed={() => setDroppedFiles([])} // Clear dropped files after processing
            messages={messages}
            disableAnimation={disableAnimation}
            sessionCosts={sessionCosts}
            recipe={recipe}
            recipeAccepted={!hasNotAcceptedRecipe}
            initialPrompt={initialPrompt}
            toolCount={toolCount || 0}
            {...customChatInputProps}
          />
        </div>
      </MainPanelLayout>

      {recipe && (
        <RecipeWarningModal
          isOpen={!!hasNotAcceptedRecipe}
          onConfirm={() => handleRecipeAccept(true)}
          onCancel={() => handleRecipeAccept(false)}
          recipeDetails={{
            title: recipe.title,
            description: recipe.description,
            instructions: recipe.instructions || undefined,
          }}
          hasSecurityWarnings={hasRecipeSecurityWarnings}
        />
      )}

      {recipe?.parameters && recipe.parameters.length > 0 && !session?.user_recipe_values && (
        <ParameterInputModal
          parameters={recipe.parameters}
          onSubmit={setRecipeUserParams}
          onClose={() => setView('chat')}
          initialValues={
            (window.appConfig?.get('recipeParameters') as Record<string, string> | undefined) ||
            undefined
          }
        />
      )}

      <CreateRecipeFromSessionModal
        isOpen={isCreateRecipeModalOpen}
        onClose={() => setIsCreateRecipeModalOpen(false)}
        sessionId={chat.sessionId}
        onRecipeCreated={handleRecipeCreated}
      />
    </div>
  );
}
