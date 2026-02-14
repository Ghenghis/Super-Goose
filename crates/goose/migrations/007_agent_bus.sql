-- 007_agent_bus.sql
-- Agent registry, persistent message queue, team shared memory, topic
-- subscriptions, task queue, and build history tables for the multi-agent bus.

-- Agent registry
CREATE TABLE IF NOT EXISTS agent_registry (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    display_name TEXT NOT NULL,
    model_backend TEXT,
    status TEXT DEFAULT 'offline',
    capabilities TEXT,
    wake_policy TEXT,
    last_heartbeat TIMESTAMP,
    last_online TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

-- Persistent message queue
CREATE TABLE IF NOT EXISTS message_queue (
    id TEXT PRIMARY KEY,
    from_agent TEXT NOT NULL,
    to_target TEXT NOT NULL,
    target_type TEXT NOT NULL,
    channel TEXT DEFAULT 'team',
    priority INTEGER DEFAULT 2,
    payload TEXT NOT NULL,
    reply_to TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    delivered BOOLEAN DEFAULT FALSE,
    delivered_at TIMESTAMP,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP
);

-- Team shared memory
CREATE TABLE IF NOT EXISTS team_memories (
    id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE(namespace, key)
);

-- Topic subscriptions
CREATE TABLE IF NOT EXISTS topic_subscriptions (
    agent_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, topic)
);

-- Persistent task queue
CREATE TABLE IF NOT EXISTS task_queue (
    id TEXT PRIMARY KEY,
    assigned_to TEXT,
    title TEXT NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 2,
    status TEXT DEFAULT 'pending',
    dependencies TEXT,
    result TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_by TEXT,
    metadata TEXT
);

-- Build history
CREATE TABLE IF NOT EXISTS build_history (
    id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    improvement_plan TEXT,
    build_status TEXT NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    test_results TEXT,
    health_check_result TEXT,
    rollback_reason TEXT,
    triggered_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_undelivered ON message_queue(to_target, delivered) WHERE delivered = FALSE;
CREATE INDEX IF NOT EXISTS idx_tasks_status ON task_queue(status, priority);
CREATE INDEX IF NOT EXISTS idx_agent_status ON agent_registry(status);
CREATE INDEX IF NOT EXISTS idx_team_memories_ns ON team_memories(namespace, key);
