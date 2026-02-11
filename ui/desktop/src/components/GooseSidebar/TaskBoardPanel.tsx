import React from 'react';
import { ChevronRight, ListTodo } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { SidebarGroup, SidebarGroupContent } from '../ui/sidebar';
import { useAgentPanel, TaskItem, TaskStatus } from './AgentPanelContext';

// --- Status icons ---

const TASK_STATUS_ICON: Record<TaskStatus, string> = {
  pending: '\u25CB',       // ○
  in_progress: '\u25B6',   // ►
  completed: '\u2713',     // ✓
  blocked: '\u2298',       // ⊘
};

const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  pending: 'text-gray-400',
  in_progress: 'text-blue-400',
  completed: 'text-green-500',
  blocked: 'text-red-400',
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
};

// --- Single task row ---

const TaskRow: React.FC<{ task: TaskItem }> = ({ task }) => {
  return (
    <div
      className="flex items-start gap-1.5 py-1 px-2 rounded-md text-xs hover:bg-background-medium/50 transition-colors"
      title={`${TASK_STATUS_LABEL[task.status]}${task.owner ? ` - ${task.owner}` : ''}${task.blockedBy?.length ? ` (blocked by #${task.blockedBy.join(', #')})` : ''}`}
    >
      {/* Status icon */}
      <span
        className={`flex-shrink-0 font-mono text-sm leading-4 ${TASK_STATUS_COLOR[task.status]}`}
        aria-label={TASK_STATUS_LABEL[task.status]}
      >
        {TASK_STATUS_ICON[task.status]}
      </span>

      {/* Title + owner */}
      <div className="flex-1 min-w-0">
        <span
          className={`block truncate ${
            task.status === 'completed'
              ? 'text-text-muted line-through'
              : 'text-text-default'
          }`}
        >
          {task.title}
        </span>
        {task.owner && (
          <span className="text-[10px] text-text-muted truncate block">
            {task.owner}
          </span>
        )}
      </div>

      {/* Task ID */}
      <span className="text-[10px] text-text-muted flex-shrink-0">#{task.id}</span>
    </div>
  );
};

// --- Panel ---

const TaskBoardPanel: React.FC = () => {
  const { state } = useAgentPanel();
  const [isExpanded, setIsExpanded] = React.useState(true);

  const completedCount = state.taskBoard.filter((t) => t.status === 'completed').length;
  const totalCount = state.taskBoard.length;

  return (
    <SidebarGroup className="px-2">
      <SidebarGroupContent>
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium text-text-default hover:bg-background-medium/50 transition-colors">
              <ListTodo className="w-3.5 h-3.5" />
              <span>Tasks</span>
              <span className="ml-auto text-[10px] text-text-muted">
                {completedCount}/{totalCount}
              </span>
              <ChevronRight
                className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${
                  isExpanded ? 'rotate-90' : ''
                }`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden transition-all data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
            <div className="mt-1 space-y-0.5">
              {state.taskBoard.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
              {state.taskBoard.length === 0 && (
                <div className="text-[10px] text-text-muted px-3 py-2">No tasks</div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export default TaskBoardPanel;
