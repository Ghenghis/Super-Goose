use std::collections::HashMap;

use anyhow::{anyhow, Result};

use crate::context_mgmt::compact_messages;
use crate::conversation::message::{Message, SystemNotificationType};
use crate::recipe::build_recipe::build_recipe_from_template_with_positional_params;

use super::Agent;

pub const COMPACT_TRIGGERS: &[&str] =
    &["/compact", "Please compact this conversation", "/summarize"];

pub struct CommandDef {
    pub name: &'static str,
    pub description: &'static str,
}

static COMMANDS: &[CommandDef] = &[
    CommandDef {
        name: "prompts",
        description: "List available prompts, optionally filtered by extension",
    },
    CommandDef {
        name: "prompt",
        description: "Execute a prompt or show its info with --info",
    },
    CommandDef {
        name: "compact",
        description: "Compact the conversation history",
    },
    CommandDef {
        name: "clear",
        description: "Clear the conversation history",
    },
];

pub fn list_commands() -> &'static [CommandDef] {
    COMMANDS
}

impl Agent {
    pub async fn execute_command(
        &self,
        message_text: &str,
        session_id: &str,
    ) -> Result<Option<Message>> {
        let mut trimmed = message_text.trim().to_string();

        if COMPACT_TRIGGERS.contains(&trimmed.as_str()) {
            trimmed = COMPACT_TRIGGERS[0].to_string();
        }

        if !trimmed.starts_with('/') {
            return Ok(None);
        }

        let command_str = trimmed.strip_prefix('/').unwrap_or(&trimmed);
        let (command, params_str) = command_str
            .split_once(' ')
            .map(|(cmd, p)| (cmd, p.trim()))
            .unwrap_or((command_str, ""));

        let params: Vec<&str> = if params_str.is_empty() {
            vec![]
        } else {
            params_str.split_whitespace().collect()
        };

        match command {
            "prompts" => self.handle_prompts_command(&params, session_id).await,
            "prompt" => self.handle_prompt_command(&params, session_id).await,
            "compact" => self.handle_compact_command(session_id).await,
            "clear" => self.handle_clear_command(session_id).await,
            #[cfg(feature = "memory")]
            "memory" | "memories" => self.handle_memory_command(&params, session_id).await,
            #[cfg(feature = "memory")]
            "pause" => self.handle_hitl_command("pause", &params, session_id).await,
            #[cfg(feature = "memory")]
            "resume" => self.handle_hitl_command("resume", &params, session_id).await,
            #[cfg(feature = "memory")]
            "breakpoint" | "bp" => self.handle_hitl_command("breakpoint", &params, session_id).await,
            #[cfg(feature = "memory")]
            "inspect" => self.handle_hitl_command("inspect", &params, session_id).await,
            #[cfg(feature = "memory")]
            "plan" => self.handle_hitl_command("plan", &params, session_id).await,
            #[cfg(feature = "memory")]
            "bookmark" | "bm" | "checkpoint" => {
                self.handle_bookmark_command(&params, session_id).await
            }
            _ => {
                self.handle_recipe_command(command, params_str, session_id)
                    .await
            }
        }
    }

    async fn handle_compact_command(&self, session_id: &str) -> Result<Option<Message>> {
        let manager = self.config.session_manager.clone();
        let session = manager.get_session(session_id, true).await?;
        let conversation = session
            .conversation
            .ok_or_else(|| anyhow!("Session has no conversation"))?;

        let (compacted_conversation, usage) = compact_messages(
            self.provider().await?.as_ref(),
            session_id,
            &conversation,
            true, // is_manual_compact
        )
        .await?;

        manager
            .replace_conversation(session_id, &compacted_conversation)
            .await?;

        self.update_session_metrics(session_id, session.schedule_id, &usage, true)
            .await?;

        Ok(Some(Message::assistant().with_system_notification(
            SystemNotificationType::InlineMessage,
            "Compaction complete",
        )))
    }

    async fn handle_clear_command(&self, session_id: &str) -> Result<Option<Message>> {
        use crate::conversation::Conversation;

        let manager = self.config.session_manager.clone();
        manager
            .replace_conversation(session_id, &Conversation::default())
            .await?;

        manager
            .update(session_id)
            .total_tokens(Some(0))
            .input_tokens(Some(0))
            .output_tokens(Some(0))
            .apply()
            .await?;

        Ok(Some(Message::assistant().with_system_notification(
            SystemNotificationType::InlineMessage,
            "Conversation cleared",
        )))
    }

    async fn handle_prompts_command(
        &self,
        params: &[&str],
        session_id: &str,
    ) -> Result<Option<Message>> {
        let extension_filter = params.first().map(|s| s.to_string());

        let prompts = self.list_extension_prompts(session_id).await;

        if let Some(filter) = &extension_filter {
            if !prompts.contains_key(filter) {
                let error_msg = format!("Extension '{}' not found", filter);
                return Ok(Some(Message::assistant().with_text(error_msg)));
            }
        }

        let filtered_prompts: HashMap<String, Vec<String>> = prompts
            .into_iter()
            .filter(|(ext, _)| extension_filter.as_ref().is_none_or(|f| f == ext))
            .map(|(extension, prompt_list)| {
                let names = prompt_list.into_iter().map(|p| p.name).collect();
                (extension, names)
            })
            .collect();

        let mut output = String::new();
        if filtered_prompts.is_empty() {
            output.push_str("No prompts available.\n");
        } else {
            output.push_str("Available prompts:\n\n");
            for (extension, prompt_names) in filtered_prompts {
                output.push_str(&format!("**{}**:\n", extension));
                for name in prompt_names {
                    output.push_str(&format!("  - {}\n", name));
                }
                output.push('\n');
            }
        }

        Ok(Some(Message::assistant().with_text(output)))
    }

    async fn handle_prompt_command(
        &self,
        params: &[&str],
        session_id: &str,
    ) -> Result<Option<Message>> {
        if params.is_empty() {
            return Ok(Some(
                Message::assistant().with_text("Prompt name argument is required"),
            ));
        }

        let prompt_name = params[0].to_string();
        let is_info = params.get(1).map(|s| *s == "--info").unwrap_or(false);

        if is_info {
            let prompts = self.list_extension_prompts(session_id).await;
            let mut prompt_info = None;

            for (extension, prompt_list) in prompts {
                if let Some(prompt) = prompt_list.iter().find(|p| p.name == prompt_name) {
                    let mut output = format!("**Prompt: {}**\n\n", prompt.name);
                    if let Some(desc) = &prompt.description {
                        output.push_str(&format!("Description: {}\n\n", desc));
                    }
                    output.push_str(&format!("Extension: {}\n\n", extension));

                    if let Some(args) = &prompt.arguments {
                        output.push_str("Arguments:\n");
                        for arg in args {
                            output.push_str(&format!("  - {}", arg.name));
                            if let Some(desc) = &arg.description {
                                output.push_str(&format!(": {}", desc));
                            }
                            output.push('\n');
                        }
                    }

                    prompt_info = Some(output);
                    break;
                }
            }

            return Ok(Some(Message::assistant().with_text(
                prompt_info.unwrap_or_else(|| format!("Prompt '{}' not found", prompt_name)),
            )));
        }

        let mut arguments = HashMap::new();
        for param in params.iter().skip(1) {
            if let Some((key, value)) = param.split_once('=') {
                let value = value.trim_matches('"');
                arguments.insert(key.to_string(), value.to_string());
            }
        }

        let arguments_value = serde_json::to_value(arguments)
            .map_err(|e| anyhow!("Failed to serialize arguments: {}", e))?;

        match self
            .get_prompt(session_id, &prompt_name, arguments_value)
            .await
        {
            Ok(prompt_result) => {
                for (i, prompt_message) in prompt_result.messages.into_iter().enumerate() {
                    let msg = Message::from(prompt_message);

                    let expected_role = if i % 2 == 0 {
                        rmcp::model::Role::User
                    } else {
                        rmcp::model::Role::Assistant
                    };

                    if msg.role != expected_role {
                        let error_msg = format!(
                            "Expected {:?} message at position {}, but found {:?}",
                            expected_role, i, msg.role
                        );
                        return Ok(Some(Message::assistant().with_text(error_msg)));
                    }

                    self.config
                        .session_manager
                        .clone()
                        .add_message(session_id, &msg)
                        .await?;
                }

                let last_message = self
                    .config
                    .session_manager
                    .get_session(session_id, true)
                    .await?
                    .conversation
                    .ok_or_else(|| anyhow!("No conversation found"))?
                    .messages()
                    .last()
                    .cloned()
                    .ok_or_else(|| anyhow!("No messages in conversation"))?;

                Ok(Some(last_message))
            }
            Err(e) => Ok(Some(
                Message::assistant().with_text(format!("Error getting prompt: {}", e)),
            )),
        }
    }

    async fn handle_recipe_command(
        &self,
        command: &str,
        params_str: &str,
        _session_id: &str,
    ) -> Result<Option<Message>> {
        let full_command = format!("/{}", command);
        let recipe_path = match crate::slash_commands::get_recipe_for_command(&full_command) {
            Some(path) => path,
            None => return Ok(None),
        };

        if !recipe_path.exists() {
            return Ok(None);
        }

        let recipe_content = std::fs::read_to_string(&recipe_path)
            .map_err(|e| anyhow!("Failed to read recipe file: {}", e))?;

        let recipe_dir = recipe_path
            .parent()
            .ok_or_else(|| anyhow!("Recipe path has no parent directory"))?;

        let recipe_dir_str = recipe_dir.display().to_string();
        let validation_result =
            crate::recipe::validate_recipe::validate_recipe_template_from_content(
                &recipe_content,
                Some(recipe_dir_str),
            )
            .map_err(|e| anyhow!("Failed to parse recipe: {}", e))?;

        let param_values: Vec<String> = if params_str.is_empty() {
            vec![]
        } else {
            let params_without_default = validation_result
                .parameters
                .as_ref()
                .map(|params| params.iter().filter(|p| p.default.is_none()).count())
                .unwrap_or(0);

            if params_without_default <= 1 {
                vec![params_str.to_string()]
            } else {
                let param_names: Vec<String> = validation_result
                    .parameters
                    .as_ref()
                    .map(|params| {
                        params
                            .iter()
                            .filter(|p| p.default.is_none())
                            .map(|p| p.key.clone())
                            .collect()
                    })
                    .unwrap_or_default();

                let error_message = format!(
                    "The /{} recipe requires {} parameters: {}.\n\n\
                    Slash command recipes only support 1 parameter.\n\n\
                    **To use this recipe:**\n\
                    • **CLI:** `goose run --recipe {} {}`\n\
                    • **Desktop:** Launch from the recipes sidebar to fill in parameters",
                    command,
                    params_without_default,
                    param_names
                        .iter()
                        .map(|name| format!("**{}**", name))
                        .collect::<Vec<_>>()
                        .join(", "),
                    command,
                    param_names
                        .iter()
                        .map(|name| format!("--params {}=\"...\"", name))
                        .collect::<Vec<_>>()
                        .join(" ")
                );

                return Err(anyhow!(error_message));
            }
        };

        let param_values_len = param_values.len();

        let recipe = match build_recipe_from_template_with_positional_params(
            recipe_content,
            recipe_dir,
            param_values,
            None::<fn(&str, &str) -> Result<String>>,
        ) {
            Ok(recipe) => recipe,
            Err(crate::recipe::build_recipe::RecipeError::MissingParams { parameters }) => {
                return Ok(Some(Message::assistant().with_text(format!(
                    "Recipe requires {} parameter(s): {}. Provided: {}",
                    parameters.len(),
                    parameters.join(", "),
                    param_values_len
                ))));
            }
            Err(e) => return Err(anyhow!("Failed to build recipe: {}", e)),
        };

        self.apply_recipe_components(recipe.sub_recipes.clone(), recipe.response.clone(), true)
            .await;

        let prompt = [recipe.instructions.as_deref(), recipe.prompt.as_deref()]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join("\n\n");

        Ok(Some(Message::user().with_text(prompt)))
    }

    /// Handle /memory command — show stats, list memories, or clear
    #[cfg(feature = "memory")]
    async fn handle_memory_command(
        &self,
        params: &[&str],
        _session_id: &str,
    ) -> Result<Option<Message>> {
        let memory_mgr = self.memory_manager.lock().await;

        match params.first().copied() {
            None | Some("stats") | Some("status") => {
                // Show memory statistics
                let stats = memory_mgr.stats().await;
                let provider_name = memory_mgr.embedding_provider_name().to_string();
                drop(memory_mgr); // Release before checking mem0

                let mem0_status = {
                    let mem0_guard = self.mem0_client.lock().await;
                    match mem0_guard.as_ref() {
                        Some(client) if client.is_available() => "connected",
                        Some(_) => "configured (offline)",
                        None => "not configured",
                    }
                };

                let output = format!(
                    "## Memory System Status\n\n\
                     | Store | Count | Capacity | Utilization |\n\
                     |-------|------:|------:|-----------:|\n\
                     | Working | {} | {} | {:.0}% |\n\
                     | Episodic | {} | {} | {:.0}% |\n\
                     | Semantic | {} | {} | {:.0}% |\n\
                     | **Total** | **{}** | | |\n\n\
                     **Embedding provider:** {}\n\
                     **Mem0 graph memory:** {}\n\
                     **Persistence:** ~/.config/goose/memory/memories.json",
                    stats.working_count,
                    stats.working_capacity,
                    stats.working_utilization() * 100.0,
                    stats.episodic_count,
                    stats.episodic_capacity,
                    stats.episodic_utilization() * 100.0,
                    stats.semantic_count,
                    stats.semantic_capacity,
                    stats.semantic_utilization() * 100.0,
                    stats.total_count(),
                    provider_name,
                    mem0_status,
                );

                Ok(Some(Message::assistant().with_text(output)))
            }
            Some("clear") => {
                memory_mgr.clear().await?;
                drop(memory_mgr);
                Ok(Some(
                    Message::assistant().with_text("All memories cleared."),
                ))
            }
            Some("save") | Some("persist") => {
                match memory_mgr.save_to_disk().await {
                    Ok(path) => {
                        drop(memory_mgr);
                        Ok(Some(Message::assistant().with_text(format!(
                            "Memories saved to {}",
                            path.display()
                        ))))
                    }
                    Err(e) => {
                        drop(memory_mgr);
                        Ok(Some(Message::assistant().with_text(format!(
                            "Failed to save memories: {}",
                            e
                        ))))
                    }
                }
            }
            Some(other) => Ok(Some(Message::assistant().with_text(format!(
                "Unknown /memory subcommand: `{}`\n\n\
                 Usage:\n\
                 - `/memory` or `/memory stats` — Show memory statistics\n\
                 - `/memory clear` — Clear all memories\n\
                 - `/memory save` — Persist memories to disk",
                other
            )))),
        }
    }
}

// ---------------------------------------------------------------------------
// HITL (Human-in-the-Loop) slash commands
// ---------------------------------------------------------------------------

#[cfg(feature = "memory")]
impl Agent {
    pub(crate) async fn handle_hitl_command(
        &self,
        command: &str,
        params: &[&str],
        session_id: &str,
    ) -> Result<Option<Message>> {
        match command {
            "pause" => {
                let mut session = self.interactive_session.lock().await;
                session.pause(super::hitl::PauseReason::UserRequested);
                Ok(Some(Message::assistant().with_text(
                    "⏸ Agent will pause at the next turn boundary or tool call.",
                )))
            }

            "resume" => {
                let mut session = self.interactive_session.lock().await;
                // If there's feedback text after /resume, inject it
                let feedback_text: String = params.join(" ");
                if !feedback_text.is_empty() {
                    session.inject_feedback(super::hitl::UserFeedback::new(&feedback_text));
                }
                session.resume();
                let msg = if feedback_text.is_empty() {
                    "▶ Agent resumed.".to_string()
                } else {
                    format!("▶ Agent resumed with feedback: {}", feedback_text)
                };
                Ok(Some(Message::assistant().with_text(msg)))
            }

            "breakpoint" | "bp" => self.handle_breakpoint_subcommand(params).await,

            "inspect" => {
                let session = self.interactive_session.lock().await;
                // Build memory stats string if available
                let memory_stats = {
                    let memory_mgr = self.memory_manager.lock().await;
                    let stats = memory_mgr.stats().await;
                    Some(format!(
                        "working: {}, episodic: {}, semantic: {}",
                        stats.working_count, stats.episodic_count, stats.semantic_count
                    ))
                };
                let snap = session.snapshot(session_id, None, memory_stats);
                Ok(Some(Message::assistant().with_text(snap.to_string())))
            }

            "plan" => {
                match params.first().copied() {
                    Some("approve") => Ok(Some(Message::assistant().with_text(
                        "Plan approval noted. The agent will proceed with execution.",
                    ))),
                    Some("reject") | Some("cancel") => Ok(Some(Message::assistant().with_text(
                        "Plan rejected. The agent will not execute this plan.",
                    ))),
                    Some("show") | None => Ok(Some(Message::assistant().with_text(
                        "No active plan. Plans are created automatically when the agent tackles complex tasks.",
                    ))),
                    Some(other) => Ok(Some(Message::assistant().with_text(format!(
                        "Unknown /plan subcommand: `{}`\n\n\
                         Usage:\n\
                         - `/plan` or `/plan show` — Show current plan\n\
                         - `/plan approve` — Approve pending plan\n\
                         - `/plan reject` — Reject pending plan",
                        other
                    )))),
                }
            }

            _ => Ok(None),
        }
    }

    async fn handle_breakpoint_subcommand(
        &self,
        params: &[&str],
    ) -> Result<Option<Message>> {
        let mut session = self.interactive_session.lock().await;

        match params.first().copied() {
            Some("add") => {
                let tool_name = params.get(1).unwrap_or(&"").to_string();
                if tool_name.is_empty() {
                    return Ok(Some(Message::assistant().with_text(
                        "Usage: `/breakpoint add <tool_name>` — e.g., `/bp add bash`",
                    )));
                }
                session.add_breakpoint(super::hitl::Breakpoint::BeforeToolCall {
                    tool_name: tool_name.clone(),
                });
                Ok(Some(Message::assistant().with_text(format!(
                    "🔴 Breakpoint added: pause before `{}`",
                    tool_name
                ))))
            }

            Some("pattern") => {
                let pattern = params.get(1).unwrap_or(&"").to_string();
                if pattern.is_empty() {
                    return Ok(Some(Message::assistant().with_text(
                        "Usage: `/breakpoint pattern <regex>` — e.g., `/bp pattern file_.*`",
                    )));
                }
                // Validate regex
                if regex::Regex::new(&pattern).is_err() {
                    return Ok(Some(Message::assistant().with_text(format!(
                        "Invalid regex pattern: `{}`",
                        pattern
                    ))));
                }
                session.add_breakpoint(super::hitl::Breakpoint::BeforeToolPattern {
                    pattern: pattern.clone(),
                });
                Ok(Some(Message::assistant().with_text(format!(
                    "🔴 Breakpoint added: pause before tools matching `{}`",
                    pattern
                ))))
            }

            Some("turns") => {
                let n: u32 = params
                    .get(1)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                if n == 0 {
                    return Ok(Some(Message::assistant().with_text(
                        "Usage: `/breakpoint turns <N>` — e.g., `/bp turns 5`",
                    )));
                }
                session.add_breakpoint(super::hitl::Breakpoint::EveryNTurns { n });
                Ok(Some(Message::assistant().with_text(format!(
                    "🔴 Breakpoint added: pause every {} turns",
                    n
                ))))
            }

            Some("error") => {
                session.add_breakpoint(super::hitl::Breakpoint::OnError);
                Ok(Some(Message::assistant().with_text(
                    "🔴 Breakpoint added: pause on any tool error",
                )))
            }

            Some("plan") => {
                session.add_breakpoint(super::hitl::Breakpoint::AfterPlanGeneration);
                Ok(Some(Message::assistant().with_text(
                    "🔴 Breakpoint added: pause after plan generation for review",
                )))
            }

            Some("remove") => {
                let idx: usize = params
                    .get(1)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(usize::MAX);
                match session.remove_breakpoint(idx) {
                    Some(bp) => Ok(Some(Message::assistant().with_text(format!(
                        "Removed breakpoint [{}]: {}",
                        idx, bp
                    )))),
                    None => Ok(Some(Message::assistant().with_text(format!(
                        "No breakpoint at index {}. Use `/bp list` to see current breakpoints.",
                        idx
                    )))),
                }
            }

            Some("list") | None => {
                let bps = session.list_breakpoints();
                if bps.is_empty() {
                    Ok(Some(Message::assistant().with_text(
                        "No active breakpoints. Use `/bp add <tool>` to add one.",
                    )))
                } else {
                    let list: String = bps
                        .iter()
                        .enumerate()
                        .map(|(i, bp)| format!("  [{}] {}", i, bp))
                        .collect::<Vec<_>>()
                        .join("\n");
                    Ok(Some(Message::assistant().with_text(format!(
                        "**Active Breakpoints:**\n{}",
                        list
                    ))))
                }
            }

            Some("clear") => {
                let count = session.breakpoint_count();
                session.clear_breakpoints();
                Ok(Some(Message::assistant().with_text(format!(
                    "Cleared {} breakpoint(s).",
                    count
                ))))
            }

            Some(other) => Ok(Some(Message::assistant().with_text(format!(
                "Unknown /breakpoint subcommand: `{}`\n\n\
                 Usage:\n\
                 - `/bp add <tool>` — Break before a specific tool\n\
                 - `/bp pattern <regex>` — Break before tools matching pattern\n\
                 - `/bp turns <N>` — Break every N turns\n\
                 - `/bp error` — Break on tool errors\n\
                 - `/bp plan` — Break after plan generation\n\
                 - `/bp remove <index>` — Remove a breakpoint\n\
                 - `/bp list` — List all breakpoints\n\
                 - `/bp clear` — Remove all breakpoints",
                other
            )))),
        }
    }

    /// Handle /bookmark (session bookmarks/checkpoints) slash commands
    pub(crate) async fn handle_bookmark_command(
        &self,
        params: &[&str],
        session_id: &str,
    ) -> Result<Option<Message>> {
        use crate::agents::persistence::{CheckpointManager, CheckpointSummary};
        let cp_guard = self.checkpoint_manager.lock().await;
        let manager: &CheckpointManager = match cp_guard.as_ref() {
            Some(mgr) => mgr,
            None => {
                return Ok(Some(Message::assistant().with_text(
                    "Checkpointing is not enabled. Start a session with memory features to use bookmarks.",
                )));
            }
        };

        match params.first().copied() {
            Some("save") | Some("create") => {
                let label = if params.len() > 1 {
                    params[1..].join(" ")
                } else {
                    format!("Bookmark at {}", chrono::Utc::now().format("%H:%M:%S"))
                };

                // Create checkpoint with current session state
                let state = serde_json::json!({
                    "session_id": session_id,
                    "label": label,
                    "created_at": chrono::Utc::now().to_rfc3339(),
                });
                let metadata = super::persistence::CheckpointMetadata {
                    label: Some(label.clone()),
                    tags: vec!["bookmark".to_string()],
                    auto: false,
                    ..Default::default()
                };
                let mut checkpoint = super::persistence::Checkpoint::new(session_id, state);
                checkpoint = checkpoint.with_metadata(metadata);

                manager.checkpointer().save(&checkpoint).await?;

                Ok(Some(Message::assistant().with_text(format!(
                    "Bookmark saved: \"{}\" (ID: {})",
                    label,
                    &checkpoint.checkpoint_id[..8]
                ))))
            }

            Some("list") | None => {
                let summaries: Vec<CheckpointSummary> = manager.checkpointer().list(session_id).await?;
                if summaries.is_empty() {
                    return Ok(Some(Message::assistant().with_text(
                        "No bookmarks for this session. Use `/bookmark save [label]` to create one.",
                    )));
                }
                let list: String = summaries
                    .iter()
                    .enumerate()
                    .map(|(i, s)| {
                        let label = s
                            .metadata
                            .label
                            .as_deref()
                            .unwrap_or("(unnamed)");
                        let time = s.created_at.format("%Y-%m-%d %H:%M:%S");
                        let auto_tag = if s.metadata.auto { " [auto]" } else { "" };
                        format!(
                            "  [{}] {} -- {}{} ({})",
                            i,
                            label,
                            time,
                            auto_tag,
                            &s.checkpoint_id[..8]
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                Ok(Some(Message::assistant().with_text(format!(
                    "Session Bookmarks:\n{}",
                    list
                ))))
            }

            Some("restore") | Some("load") => {
                let target = params.get(1).unwrap_or(&"");
                if target.is_empty() {
                    return Ok(Some(Message::assistant().with_text(
                        "Usage: `/bookmark restore <index|id>` -- restore a saved bookmark",
                    )));
                }
                // Try parsing as index first
                let summaries: Vec<CheckpointSummary> = manager.checkpointer().list(session_id).await?;
                let checkpoint_id = if let Ok(idx) = target.parse::<usize>() {
                    summaries.get(idx).map(|s| s.checkpoint_id.clone())
                } else {
                    // Try matching by ID prefix
                    summaries
                        .iter()
                        .find(|s| s.checkpoint_id.starts_with(target))
                        .map(|s| s.checkpoint_id.clone())
                };

                match checkpoint_id {
                    Some(id) => {
                        let loaded = manager.checkpointer().load_by_id(&id).await?;
                        match loaded {
                            Some(cp) => {
                                let label = cp
                                    .metadata
                                    .label
                                    .as_deref()
                                    .unwrap_or("(unnamed)");
                                Ok(Some(Message::assistant().with_text(format!(
                                    "Restored bookmark: \"{}\" (created {})\n\
                                     State snapshot loaded. The agent will use this context.",
                                    label,
                                    cp.created_at.format("%Y-%m-%d %H:%M:%S")
                                ))))
                            }
                            None => Ok(Some(Message::assistant().with_text(
                                "Bookmark not found. Use `/bookmark list` to see available bookmarks.",
                            ))),
                        }
                    }
                    None => Ok(Some(Message::assistant().with_text(format!(
                        "No bookmark matching '{}'. Use `/bookmark list` to see available bookmarks.",
                        target
                    )))),
                }
            }

            Some("delete") | Some("remove") => {
                let target = params.get(1).unwrap_or(&"");
                if target.is_empty() {
                    return Ok(Some(Message::assistant().with_text(
                        "Usage: `/bookmark delete <index|id>` -- delete a bookmark",
                    )));
                }
                let summaries: Vec<CheckpointSummary> = manager.checkpointer().list(session_id).await?;
                let checkpoint_id = if let Ok(idx) = target.parse::<usize>() {
                    summaries.get(idx).map(|s| s.checkpoint_id.clone())
                } else {
                    summaries
                        .iter()
                        .find(|s| s.checkpoint_id.starts_with(target))
                        .map(|s| s.checkpoint_id.clone())
                };

                match checkpoint_id {
                    Some(id) => {
                        let deleted = manager.checkpointer().delete(&id).await?;
                        if deleted {
                            Ok(Some(Message::assistant().with_text("Bookmark deleted.")))
                        } else {
                            Ok(Some(Message::assistant().with_text("Bookmark not found.")))
                        }
                    }
                    None => Ok(Some(Message::assistant().with_text(format!(
                        "No bookmark matching '{}'. Use `/bookmark list` to see available bookmarks.",
                        target
                    )))),
                }
            }

            Some("clear") => {
                let count = manager.checkpointer().delete_thread(session_id).await?;
                Ok(Some(Message::assistant().with_text(format!(
                    "Cleared {} bookmark(s) for this session.",
                    count
                ))))
            }

            Some(other) => Ok(Some(Message::assistant().with_text(format!(
                "Unknown /bookmark subcommand: `{}`\n\n\
                 Usage:\n\
                 - `/bookmark save [label]` -- Save current state as bookmark\n\
                 - `/bookmark list` -- List all bookmarks\n\
                 - `/bookmark restore <index|id>` -- Restore a bookmark\n\
                 - `/bookmark delete <index|id>` -- Delete a bookmark\n\
                 - `/bookmark clear` -- Delete all bookmarks",
                other
            )))),
        }
    }
}
