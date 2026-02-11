use anyhow::Result;
use goose::agents::orchestrator::{AgentOrchestrator, AgentRole, TaskPriority};
use goose::config::paths::Paths;
use std::path::PathBuf;
use uuid::Uuid;

const STATE_FILE: &str = "orchestrator_state.json";

/// Get the file path for persisted orchestrator state
fn state_path() -> PathBuf {
    Paths::config_dir().join(STATE_FILE)
}

/// Load orchestrator from persisted state (or create fresh if none exists)
async fn load_orchestrator() -> Result<AgentOrchestrator> {
    let orchestrator = AgentOrchestrator::new();
    let path = state_path();
    if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(data) if !data.trim().is_empty() => {
                if let Err(e) = orchestrator.load_state(&data).await {
                    tracing::warn!("Failed to load orchestrator state: {}", e);
                }
            }
            _ => {}
        }
    }
    Ok(orchestrator)
}

/// Save orchestrator state to disk
async fn save_orchestrator(orchestrator: &AgentOrchestrator) -> Result<()> {
    let path = state_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let data = orchestrator.save_state().await?;
    std::fs::write(&path, data)?;
    Ok(())
}

/// Parse a role string into an AgentRole enum
fn parse_role(role: &str) -> Result<AgentRole> {
    match role.to_lowercase().as_str() {
        "code" => Ok(AgentRole::Code),
        "test" => Ok(AgentRole::Test),
        "deploy" => Ok(AgentRole::Deploy),
        "docs" => Ok(AgentRole::Docs),
        "security" => Ok(AgentRole::Security),
        "coordinator" => Ok(AgentRole::Coordinator),
        _ => {
            anyhow::bail!(
                "Invalid agent role: '{}'. Valid roles: code, test, deploy, docs, security, coordinator",
                role
            );
        }
    }
}

/// Show orchestrator status and available agent roles
pub async fn handle_orchestrator_status() -> Result<()> {
    let orchestrator = load_orchestrator().await?;

    let is_ready = orchestrator.is_ready();
    let stats = orchestrator.get_stats().await;
    let workflows = orchestrator.list_workflows().await;

    println!("Agent Orchestrator Status");
    println!("{}", "-".repeat(60));
    println!("  Ready:               {}", if is_ready { "Yes" } else { "No" });
    println!("  Active workflows:    {}", workflows.len());
    println!("  Workflows started:   {}", stats.workflows_started);
    println!("  Workflows completed: {}", stats.workflows_completed);
    println!("  Tasks executed:      {}", stats.tasks_executed);
    println!("  Tasks failed:        {}", stats.tasks_failed);
    println!("  Success rate:        {:.1}%", stats.success_rate * 100.0);

    if !workflows.is_empty() {
        println!("\n  Active Workflows:");
        for (id, status) in &workflows {
            println!("    {} -- {:?}", id, status);
        }
    }

    println!("\n  Available Agent Roles:");
    println!("    code        -- Code generation and architecture");
    println!("    test        -- Testing and quality assurance");
    println!("    deploy      -- Deployment and infrastructure");
    println!("    docs        -- Documentation and communication");
    println!("    security    -- Security analysis and compliance");
    println!("    coordinator -- General-purpose coordination");
    println!("{}", "-".repeat(60));

    Ok(())
}

/// Create a new multi-agent workflow
pub async fn handle_orchestrator_create(name: String, description: Option<String>) -> Result<()> {
    let name = name.trim().to_string();
    if name.is_empty() {
        anyhow::bail!("Workflow name cannot be empty");
    }

    let orchestrator = load_orchestrator().await?;
    let desc = description.unwrap_or_else(|| format!("Workflow: {}", name));

    let workflow_id = orchestrator.create_workflow(name.clone(), desc).await?;

    // Persist state so subsequent commands can find this workflow
    save_orchestrator(&orchestrator).await?;

    println!("Workflow created successfully!");
    println!("  Name:        {}", name);
    println!("  Workflow ID: {}", workflow_id);
    println!(
        "\n  Next: Add tasks with `goose orchestrator add-task --workflow-id {}`",
        workflow_id
    );

    Ok(())
}

/// Add a task to an existing workflow
pub async fn handle_orchestrator_add_task(
    workflow_id: String,
    name: String,
    description: String,
    role: String,
    depends_on: Vec<String>,
) -> Result<()> {
    let name = name.trim().to_string();
    if name.is_empty() {
        anyhow::bail!("Task name cannot be empty");
    }

    let orchestrator = load_orchestrator().await?;

    let wf_id = Uuid::parse_str(&workflow_id)
        .map_err(|e| anyhow::anyhow!("Invalid workflow ID '{}': {}", workflow_id, e))?;

    let agent_role = parse_role(&role)?;

    // Parse dependency UUIDs (filter empty strings from value_delimiter)
    let deps: Vec<Uuid> = depends_on
        .iter()
        .filter(|s| !s.trim().is_empty())
        .map(|s| {
            Uuid::parse_str(s.trim())
                .map_err(|e| anyhow::anyhow!("Invalid dependency ID '{}': {}", s, e))
        })
        .collect::<Result<Vec<Uuid>>>()?;

    let task_id = orchestrator
        .add_task(
            wf_id,
            name.clone(),
            description.clone(),
            agent_role,
            deps.clone(),
            TaskPriority::Medium,
        )
        .await?;

    // Persist state
    save_orchestrator(&orchestrator).await?;

    println!("Task added to workflow!");
    println!("  Task ID:    {}", task_id);
    println!("  Name:       {}", name);
    println!("  Role:       {}", role);
    if !deps.is_empty() {
        println!(
            "  Depends on: {}",
            deps.iter()
                .map(|d| d.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        );
    }

    Ok(())
}

/// Start executing a workflow
pub async fn handle_orchestrator_start(workflow_id: String) -> Result<()> {
    let orchestrator = load_orchestrator().await?;

    let wf_id = Uuid::parse_str(&workflow_id)
        .map_err(|e| anyhow::anyhow!("Invalid workflow ID '{}': {}", workflow_id, e))?;

    // Show pre-start info
    let tasks = orchestrator.get_workflow_tasks(wf_id).await?;
    println!("Starting workflow {}...", workflow_id);
    println!("  Tasks: {}", tasks.len());

    orchestrator.start_workflow(wf_id).await?;

    // Persist state after start
    save_orchestrator(&orchestrator).await?;

    println!("Workflow started! Tasks are being executed.");
    println!("  Use `goose orchestrator status` to monitor progress.");

    Ok(())
}
