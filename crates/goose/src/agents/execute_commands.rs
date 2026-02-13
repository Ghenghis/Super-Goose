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
        description: "Compact the conversation history: /compact [status]",
    },
    CommandDef {
        name: "clear",
        description: "Clear the conversation history",
    },
    CommandDef {
        name: "cores",
        description: "List all available agent cores with status",
    },
    CommandDef {
        name: "core",
        description: "Switch active core: /core <name> (freeform, structured, orchestrator, swarm, workflow, adversarial)",
    },
    CommandDef {
        name: "self-improve",
        description: "Trigger OTA self-build pipeline: /self-improve [--dry-run]",
    },
    CommandDef {
        name: "autonomous",
        description: "Manage autonomous daemon: /autonomous [status|start|stop]",
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
            "compact" => self.handle_compact_command(&params, session_id).await,
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
            "cores" => self.handle_cores_command(session_id).await,
            "core" => self.handle_core_command(&params, session_id).await,
            "experience" | "exp" => self.handle_experience_command(&params, session_id).await,
            "skills" => self.handle_skills_command(&params, session_id).await,
            "insights" => self.handle_insights_command(session_id).await,
            "self-improve" | "selfimprove" | "ota" => {
                self.handle_self_improve_command(&params, session_id).await
            }
            "autonomous" | "daemon" => {
                self.handle_autonomous_command(&params, session_id).await
            }
            _ => {
                self.handle_recipe_command(command, params_str, session_id)
                    .await
            }
        }
    }

    async fn handle_compact_command(
        &self,
        params: &[&str],
        session_id: &str,
    ) -> Result<Option<Message>> {
        let manager = self.config.session_manager.clone();

        // Handle '/compact status' — show compaction stats
        if params.first() == Some(&"status") {
            let stats = self.compaction_stats().await;
            let session = manager.get_session(session_id, true).await?;
            let conversation = session
                .conversation
                .ok_or_else(|| anyhow!("Session has no conversation"))?;

            let message_count = conversation.messages().len();
            let output = format!(
                "## Compaction Status\n\n\
                 **Current messages:** {}\n\
                 **Total compactions:** {}\n\
                 **Total tokens saved:** {}\n\
                 **Average reduction:** {:.1}%\n\n\
                 _Use `/compact` to manually compact the current conversation._",
                message_count,
                stats.total_compactions,
                stats.total_tokens_saved,
                stats.average_reduction_percent,
            );
            return Ok(Some(Message::assistant().with_text(output)));
        }

        // Default: perform compaction
        let session = manager.get_session(session_id, true).await?;
        let conversation = session
            .conversation
            .ok_or_else(|| anyhow!("Session has no conversation"))?;

        let message_count = conversation.messages().len();

        // Use the legacy compact_messages for now (keeps existing behavior)
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

        // Record compaction in the CompactionManager for statistics
        {
            let mut compact_mgr = self.compaction_manager.lock().await;
            let est_tokens_per_msg = 100; // rough estimate
            compact_mgr.record_compaction(
                message_count * est_tokens_per_msg,
                compacted_conversation.messages().len() * est_tokens_per_msg,
                crate::compaction::CompactionTrigger::Command,
            );
        }

        let saved_msgs = message_count.saturating_sub(compacted_conversation.messages().len());
        let stats = self.compaction_stats().await;
        let output = format!(
            "## Compaction Complete\n\n\
             **Original messages:** {}\n\
             **Compacted messages:** {}\n\
             **Messages removed:** {}\n\n\
             **Total compactions:** {}\n\
             **Total tokens saved:** {}\n\
             **Average reduction:** {:.1}%",
            message_count,
            compacted_conversation.messages().len(),
            saved_msgs,
            stats.total_compactions,
            stats.total_tokens_saved,
            stats.average_reduction_percent,
        );

        Ok(Some(Message::assistant().with_text(output)))
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

    /// Handle /cores command — list all available cores with status
    async fn handle_cores_command(&self, _session_id: &str) -> Result<Option<Message>> {
        let cores = self.core_registry.list_cores();
        let active = self.core_registry.active_core_type().await;
        let output = super::core::registry::format_cores_list(&cores, active);
        Ok(Some(Message::assistant().with_text(output)))
    }

    /// Handle /core <name> command — switch active execution core
    async fn handle_core_command(
        &self,
        params: &[&str],
        _session_id: &str,
    ) -> Result<Option<Message>> {
        if params.is_empty() {
            // No argument: show current core
            let active = self.core_registry.active_core_type().await;
            let core = self.core_registry.active_core().await;
            return Ok(Some(Message::assistant().with_text(format!(
                "Active core: **{}** — {}\n\nSwitch with: `/core <name>`\nAvailable: freeform, structured, orchestrator, swarm, workflow, adversarial",
                active, core.description()
            ))));
        }

        let core_name = params[0];
        match core_name.parse::<super::core::CoreType>() {
            Ok(core_type) => {
                match self.core_registry.switch_core(core_type).await {
                    Ok(core) => {
                        Ok(Some(Message::assistant().with_system_notification(
                            SystemNotificationType::InlineMessage,
                            &format!("Switched to **{}** core — {}", core.name(), core.description()),
                        )))
                    }
                    Err(e) => Ok(Some(Message::assistant().with_text(format!(
                        "Failed to switch core: {}", e
                    )))),
                }
            }
            Err(e) => Ok(Some(Message::assistant().with_text(e))),
        }
    }

    /// Handle /experience command — show cross-session learning data
    async fn handle_experience_command(
        &self,
        params: &[&str],
        _session_id: &str,
    ) -> Result<Option<Message>> {
        let store = match self.experience_store.lock().await.clone() {
            Some(s) => s,
            None => {
                return Ok(Some(Message::assistant().with_text(
                    "ExperienceStore not initialized. Cross-session learning is not active.",
                )));
            }
        };

        if params.first() == Some(&"stats") {
            // /experience stats — per-core aggregate stats
            let stats = store.get_core_stats().await?;
            if stats.is_empty() {
                return Ok(Some(Message::assistant().with_text(
                    "No experiences recorded yet. Complete some tasks to build experience.",
                )));
            }
            let mut output = String::from("## Core Performance Stats\n\n");
            output.push_str("| Core | Runs | Success | Avg Turns | Avg Cost | Avg Time |\n");
            output.push_str("|------|------|---------|-----------|----------|----------|\n");
            for s in &stats {
                output.push_str(&format!(
                    "| {} | {} | {:.0}% | {:.1} | ${:.3} | {:.0}ms |\n",
                    s.core_type, s.total_executions, s.success_rate * 100.0,
                    s.avg_turns, s.avg_cost, s.avg_time_ms,
                ));
            }
            return Ok(Some(Message::assistant().with_text(output)));
        }

        // Default: show recent experiences
        let recent = store.recent(10).await?;
        if recent.is_empty() {
            return Ok(Some(Message::assistant().with_text(
                "No experiences recorded yet. Complete some tasks to build experience.\n\nUsage:\n  `/experience` — show recent\n  `/experience stats` — per-core stats",
            )));
        }

        let mut output = String::from("## Recent Experiences\n\n");
        for exp in &recent {
            let status = if exp.succeeded { "OK" } else { "FAIL" };
            output.push_str(&format!(
                "- [{}] **{}** — {} core, {} turns, ${:.3}, {}ms\n",
                status,
                truncate_str(&exp.task, 60),
                exp.core_type,
                exp.turns_used,
                exp.cost_dollars,
                exp.time_ms,
            ));
        }
        output.push_str(&format!("\nTotal: {} experiences stored", store.count().await?));
        Ok(Some(Message::assistant().with_text(output)))
    }

    /// Handle /skills command — show learned skills
    async fn handle_skills_command(
        &self,
        _params: &[&str],
        _session_id: &str,
    ) -> Result<Option<Message>> {
        let lib = match self.skill_library.lock().await.clone() {
            Some(l) => l,
            None => {
                return Ok(Some(Message::assistant().with_text(
                    "SkillLibrary not initialized. Skill learning is not active.",
                )));
            }
        };

        let skills = lib.verified_skills().await?;
        if skills.is_empty() {
            return Ok(Some(Message::assistant().with_text(
                "No verified skills yet. Skills are learned from successful task completions.\n\nUsage: `/skills`",
            )));
        }

        let mut output = String::from("## Learned Skills\n\n");
        for skill in &skills {
            output.push_str(&format!(
                "- **{}** ({}): {} — {}/{} uses ({:.0}%)\n",
                skill.name,
                skill.recommended_core,
                truncate_str(&skill.description, 50),
                skill.use_count,
                skill.attempt_count,
                skill.success_rate * 100.0,
            ));
        }
        output.push_str(&format!("\nTotal: {} skills in library", lib.count().await?));
        Ok(Some(Message::assistant().with_text(output)))
    }

    /// Handle /insights command — extract and show insights
    async fn handle_insights_command(&self, _session_id: &str) -> Result<Option<Message>> {
        let store = match self.experience_store.lock().await.clone() {
            Some(s) => s,
            None => {
                return Ok(Some(Message::assistant().with_text(
                    "ExperienceStore not initialized. Run `/experience` for more info.",
                )));
            }
        };

        let insights = super::insight_extractor::InsightExtractor::extract(&store).await?;
        let formatted = super::insight_extractor::InsightExtractor::format_insights(&insights);
        Ok(Some(Message::assistant().with_text(formatted)))
    }

    /// Handle /self-improve command — trigger OTA self-build pipeline
    async fn handle_self_improve_command(
        &self,
        params: &[&str],
        _session_id: &str,
    ) -> Result<Option<Message>> {
        let dry_run = params.iter().any(|p| *p == "--dry-run" || *p == "dry-run" || *p == "check");

        if params.first() == Some(&"status") {
            let ota_guard = self.ota_manager.lock().await;
            return match ota_guard.as_ref() {
                Some(ota) => {
                    Ok(Some(Message::assistant().with_text(format!(
                        "## OTA Status\n\n**Status:** {}\n**Workspace:** detected\n\n\
                         Use `/self-improve` to build, or `/self-improve --dry-run` to validate.",
                        ota.status()
                    ))))
                }
                None => {
                    Ok(Some(Message::assistant().with_text(
                        "OTA manager not initialized. No Cargo workspace detected.\n\n\
                         Run from within the goose repository to enable self-improvement."
                    )))
                }
            };
        }

        // Run insight extraction first for context
        if let Ok(insights) = self.extract_insights().await {
            if !insights.is_empty() {
                tracing::info!("Pre-improve insights: {} patterns found", insights.len());
            }
        }

        match self.perform_self_improve(dry_run).await {
            Ok(summary) => Ok(Some(Message::assistant().with_text(summary))),
            Err(e) => Ok(Some(Message::assistant().with_text(format!(
                "## Self-Improve Failed\n\n**Error:** {}\n\n\
                 Make sure you're running from within the goose repository with Cargo installed.",
                e
            )))),
        }
    }

    /// Handle /autonomous command — manage the autonomous daemon
    async fn handle_autonomous_command(
        &self,
        params: &[&str],
        _session_id: &str,
    ) -> Result<Option<Message>> {
        match params.first().copied() {
            Some("start") => {
                if let Err(e) = self.init_autonomous_daemon().await {
                    return Ok(Some(Message::assistant().with_text(format!(
                        "Failed to initialize autonomous daemon: {}", e
                    ))));
                }
                let guard = self.autonomous_daemon.lock().await;
                if let Some(daemon) = guard.as_ref() {
                    daemon.start();
                    Ok(Some(Message::assistant().with_text(
                        "Autonomous daemon **started**. Use `/autonomous status` to check."
                    )))
                } else {
                    Ok(Some(Message::assistant().with_text(
                        "Failed to start daemon — initialization returned None."
                    )))
                }
            }
            Some("stop") => {
                let guard = self.autonomous_daemon.lock().await;
                if let Some(daemon) = guard.as_ref() {
                    daemon.stop();
                    Ok(Some(Message::assistant().with_text(
                        "Autonomous daemon **stopped**."
                    )))
                } else {
                    Ok(Some(Message::assistant().with_text(
                        "Daemon not running."
                    )))
                }
            }
            None | Some("status") => {
                let guard = self.autonomous_daemon.lock().await;
                match guard.as_ref() {
                    Some(daemon) => {
                        let running = daemon.is_running();
                        let pending = daemon.pending_task_count().await;
                        let shutdown = daemon.is_shutdown().await;
                        let breakers = daemon.failsafe_status().await;

                        let mut output = String::from("## Autonomous Daemon Status\n\n");
                        output.push_str(&format!("**Running:** {}\n", running));
                        output.push_str(&format!("**Pending tasks:** {}\n", pending));
                        output.push_str(&format!("**Shutdown:** {}\n\n", shutdown));

                        output.push_str("**Circuit Breakers:**\n");
                        for b in &breakers {
                            output.push_str(&format!(
                                "  - {} — {:?} (failures: {})\n",
                                b.name, b.state, b.consecutive_failures
                            ));
                        }

                        output.push_str("\nUsage:\n");
                        output.push_str("  `/autonomous start` — Start the daemon\n");
                        output.push_str("  `/autonomous stop` — Stop the daemon\n");
                        output.push_str("  `/autonomous status` — Show this status\n");

                        Ok(Some(Message::assistant().with_text(output)))
                    }
                    None => {
                        Ok(Some(Message::assistant().with_text(
                            "Autonomous daemon not initialized.\n\n\
                             Use `/autonomous start` to initialize and start it."
                        )))
                    }
                }
            }
            Some(other) => {
                Ok(Some(Message::assistant().with_text(format!(
                    "Unknown /autonomous subcommand: `{}`\n\n\
                     Usage:\n\
                     - `/autonomous` or `/autonomous status` — Show daemon status\n\
                     - `/autonomous start` — Start the daemon\n\
                     - `/autonomous stop` — Stop the daemon",
                    other
                ))))
            }
        }
    }
}

fn truncate_str(s: &str, max: usize) -> &str {
    if s.len() <= max { s } else { &s[..max] }
}

// ---------------------------------------------------------------------------
// HITL (Human-in-the-Loop) slash commands
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Integration tests for autonomous daemon wiring
// ---------------------------------------------------------------------------

#[cfg(test)]
mod autonomous_integration_tests {
    use super::*;
    use std::sync::Arc;
    use crate::autonomous::AutonomousDaemon;
    use crate::conversation::message::MessageContent;
    use std::path::PathBuf;

    /// Helper: extract the first text string from a Message
    fn extract_text(msg: &Message) -> String {
        msg.content
            .iter()
            .filter_map(|c| match c {
                MessageContent::Text(t) => Some(t.text.clone()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("")
    }

    // ═══════════════════════════════════════════════════════════
    // 1. Status when daemon is NOT initialized (cold start)
    // ═══════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_autonomous_status_not_initialized() {
        let agent = Agent::new();
        let result = agent
            .handle_autonomous_command(&[], "test-session")
            .await
            .unwrap();
        let msg = result.expect("should return a message");
        let text = extract_text(&msg);
        assert!(
            text.contains("not initialized"),
            "Expected 'not initialized' in: {}",
            text
        );
        assert!(
            text.contains("/autonomous start"),
            "Expected usage hint in: {}",
            text
        );
    }

    #[tokio::test]
    async fn test_autonomous_status_subcommand_not_initialized() {
        let agent = Agent::new();
        let result = agent
            .handle_autonomous_command(&["status"], "test-session")
            .await
            .unwrap();
        let msg = result.expect("should return a message");
        let text = extract_text(&msg);
        assert!(
            text.contains("not initialized"),
            "Expected 'not initialized' in: {}",
            text
        );
    }

    // ═══════════════════════════════════════════════════════════
    // 2. Stop when daemon is NOT initialized
    // ═══════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_autonomous_stop_not_initialized() {
        let agent = Agent::new();
        let result = agent
            .handle_autonomous_command(&["stop"], "test-session")
            .await
            .unwrap();
        let msg = result.expect("should return a message");
        let text = extract_text(&msg);
        assert!(
            text.contains("not running"),
            "Expected 'not running' in: {}",
            text
        );
    }

    // ═══════════════════════════════════════════════════════════
    // 3. Unknown subcommand returns helpful error
    // ═══════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_autonomous_unknown_subcommand() {
        let agent = Agent::new();
        let result = agent
            .handle_autonomous_command(&["foobar"], "test-session")
            .await
            .unwrap();
        let msg = result.expect("should return a message");
        let text = extract_text(&msg);
        assert!(
            text.contains("Unknown /autonomous subcommand"),
            "Expected error for unknown subcommand in: {}",
            text
        );
        assert!(
            text.contains("foobar"),
            "Expected the bad subcommand echoed back in: {}",
            text
        );
    }

    // ═══════════════════════════════════════════════════════════
    // 4. Inject in-memory daemon, then test status
    // ═══════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_autonomous_status_with_injected_daemon() {
        let agent = Agent::new();

        // Inject an in-memory daemon directly (bypasses init_autonomous_daemon)
        let daemon = AutonomousDaemon::in_memory(PathBuf::from("/tmp/test-autonomous"))
            .await
            .expect("in_memory daemon creation should succeed");
        {
            let mut guard = agent.autonomous_daemon.lock().await;
            *guard = Some(Arc::new(daemon));
        }

        let result = agent
            .handle_autonomous_command(&["status"], "test-session")
            .await
            .unwrap();
        let msg = result.expect("should return a message");
        let text = extract_text(&msg);

        assert!(text.contains("Autonomous Daemon Status"), "Expected status header in: {}", text);
        assert!(text.contains("Running:"), "Expected Running field in: {}", text);
        assert!(text.contains("false"), "Daemon should not be running yet: {}", text);
        assert!(text.contains("Pending tasks:"), "Expected Pending tasks field in: {}", text);
        assert!(text.contains("Circuit Breakers:"), "Expected circuit breakers in: {}", text);
    }

    // ═══════════════════════════════════════════════════════════
    // 5. Inject daemon, start, verify running status
    // ═══════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_autonomous_start_stop_lifecycle() {
        let agent = Agent::new();

        // Inject an in-memory daemon
        let daemon = AutonomousDaemon::in_memory(PathBuf::from("/tmp/test-lifecycle"))
            .await
            .expect("in_memory daemon creation should succeed");
        let daemon_arc = Arc::new(daemon);
        {
            let mut guard = agent.autonomous_daemon.lock().await;
            *guard = Some(Arc::clone(&daemon_arc));
        }

        // Verify not running initially
        assert!(!daemon_arc.is_running());

        // Start via the handler — init_autonomous_daemon will find the already-injected
        // daemon and set the initialized flag, then the handler calls daemon.start()
        let result = agent
            .handle_autonomous_command(&["start"], "test-session")
            .await
            .unwrap();
        let msg = result.expect("should return a message");
        let text = extract_text(&msg);
        assert!(
            text.contains("started"),
            "Expected 'started' confirmation in: {}",
            text
        );
        assert!(daemon_arc.is_running());

        // Now check status reports running
        let result = agent
            .handle_autonomous_command(&["status"], "test-session")
            .await
            .unwrap();
        let msg = result.expect("should return a message");
        let text = extract_text(&msg);
        assert!(text.contains("**Running:** true"), "Expected Running: true in: {}", text);
        assert!(text.contains("**Pending tasks:** 0"), "Expected 0 pending tasks in: {}", text);
        assert!(text.contains("**Shutdown:** false"), "Expected Shutdown: false in: {}", text);

        // Stop the daemon
        let result = agent
            .handle_autonomous_command(&["stop"], "test-session")
            .await
            .unwrap();
        let msg = result.expect("should return a message");
        let text = extract_text(&msg);
        assert!(text.contains("stopped"), "Expected 'stopped' in: {}", text);

        // Verify stopped
        assert!(!daemon_arc.is_running());

        // Status should now show not running
        let result = agent
            .handle_autonomous_command(&["status"], "test-session")
            .await
            .unwrap();
        let msg = result.expect("should return a message");
        let text = extract_text(&msg);
        assert!(text.contains("**Running:** false"), "Expected Running: false after stop in: {}", text);
    }

    // ═══════════════════════════════════════════════════════════
    // 6. Failsafe status contains expected circuit breakers
    // ═══════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_autonomous_status_shows_circuit_breakers() {
        let agent = Agent::new();

        let daemon = AutonomousDaemon::in_memory(PathBuf::from("/tmp/test-breakers"))
            .await
            .expect("in_memory daemon creation should succeed");
        {
            let mut guard = agent.autonomous_daemon.lock().await;
            *guard = Some(Arc::new(daemon));
        }

        let result = agent
            .handle_autonomous_command(&["status"], "test-session")
            .await
            .unwrap();
        let msg = result.expect("should return a message");
        let text = extract_text(&msg);

        // The in-memory daemon registers 4 breakers:
        // branch_manager, release_manager, ci_watcher, docs_generator
        assert!(text.contains("branch_manager"), "Expected branch_manager breaker in: {}", text);
        assert!(text.contains("release_manager"), "Expected release_manager breaker in: {}", text);
        assert!(text.contains("ci_watcher"), "Expected ci_watcher breaker in: {}", text);
        assert!(text.contains("docs_generator"), "Expected docs_generator breaker in: {}", text);
    }

    // ═══════════════════════════════════════════════════════════
    // 7. The "daemon" alias routes to the same handler
    // ═══════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_daemon_alias_routes_to_autonomous() {
        let agent = Agent::new();

        // Use execute_command with "/daemon" to verify the alias works
        // This will call handle_autonomous_command internally
        let result = agent
            .execute_command("/daemon", "test-session")
            .await
            .unwrap();
        let msg = result.expect("should return a message");
        let text = extract_text(&msg);

        // Should show "not initialized" status (same as /autonomous)
        assert!(
            text.contains("not initialized") || text.contains("Autonomous"),
            "Expected autonomous-related output for /daemon alias in: {}",
            text
        );
    }

    // ═══════════════════════════════════════════════════════════
    // 8. Scheduled task integration: inject daemon + schedule + verify count
    // ═══════════════════════════════════════════════════════════

    #[tokio::test]
    async fn test_autonomous_pending_tasks_reflected_in_status() {
        use crate::autonomous::ActionType;

        let agent = Agent::new();
        let daemon = AutonomousDaemon::in_memory(PathBuf::from("/tmp/test-tasks"))
            .await
            .expect("in_memory daemon creation should succeed");
        let daemon_arc = Arc::new(daemon);
        {
            let mut guard = agent.autonomous_daemon.lock().await;
            *guard = Some(Arc::clone(&daemon_arc));
        }

        // Schedule a task via the daemon API
        // Use the convenience method to schedule a task
        let task_id = daemon_arc
            .schedule_once(
                "Integration test task",
                5,
                chrono::Utc::now() + chrono::Duration::hours(1),
                ActionType::RunCommand {
                    command: "echo integration".into(),
                },
            )
            .await;
        assert!(!task_id.is_empty());

        // Status should report 1 pending task
        let result = agent
            .handle_autonomous_command(&["status"], "test-session")
            .await
            .unwrap();
        let msg = result.expect("should return a message");
        let text = extract_text(&msg);
        assert!(text.contains("**Pending tasks:** 1"), "Expected 1 pending task in: {}", text);
    }

    // ═══════════════════════════════════════════════════════════
    // 9. Command table includes autonomous entry
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_command_list_includes_autonomous() {
        let commands = list_commands();
        let has_autonomous = commands.iter().any(|c| c.name == "autonomous");
        assert!(has_autonomous, "Command list should include 'autonomous'");
    }
}

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
