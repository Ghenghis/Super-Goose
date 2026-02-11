use anyhow::Result;
use goose::config::permission::{PermissionLevel, PermissionManager};

/// List all tool permissions currently configured (uses PermissionManager API directly)
pub async fn handle_permissions_list() -> Result<()> {
    let manager = PermissionManager::instance();
    let names = manager.get_permission_names();

    // Check if any actual tool permissions exist (not just category keys)
    let mut total_allow = 0usize;
    let mut total_ask = 0usize;
    let mut total_deny = 0usize;
    let mut has_any = false;

    for category in &names {
        if let Some(config) = manager.get_permission_config(category) {
            let cat_total =
                config.always_allow.len() + config.ask_before.len() + config.never_allow.len();
            if cat_total > 0 {
                has_any = true;
            }
            total_allow += config.always_allow.len();
            total_ask += config.ask_before.len();
            total_deny += config.never_allow.len();
        }
    }

    if !has_any {
        println!("No tool permissions configured.");
        println!("  Use `goose permissions set <tool> <level>` to configure permissions.");
        println!("  Levels: allow (always allow), ask (ask before use), deny (never allow)");
        return Ok(());
    }

    println!("Tool Permissions");
    println!("{}", "-".repeat(60));

    for category in &names {
        if let Some(config) = manager.get_permission_config(category) {
            let cat_total =
                config.always_allow.len() + config.ask_before.len() + config.never_allow.len();
            if cat_total == 0 {
                continue;
            }
            println!("\n  Category: {}", category);
            for tool in &config.always_allow {
                println!("    [allow]  {} -> always allow", tool);
            }
            for tool in &config.ask_before {
                println!("    [ask]    {} -> ask before", tool);
            }
            for tool in &config.never_allow {
                println!("    [deny]   {} -> never allow", tool);
            }
        }
    }

    println!("\n{}", "-".repeat(60));
    println!(
        "  Total: {} always-allow, {} ask-before, {} never-allow",
        total_allow, total_ask, total_deny
    );

    Ok(())
}

/// Set the permission level for a specific tool
pub async fn handle_permissions_set(tool: String, level: String) -> Result<()> {
    let tool = tool.trim().to_string();
    if tool.is_empty() {
        anyhow::bail!("Tool name cannot be empty");
    }

    let manager = PermissionManager::instance();

    let permission_level = match level.to_lowercase().as_str() {
        "allow" | "always_allow" | "always-allow" => PermissionLevel::AlwaysAllow,
        "ask" | "ask_before" | "ask-before" => PermissionLevel::AskBefore,
        "deny" | "never_allow" | "never-allow" => PermissionLevel::NeverAllow,
        _ => {
            anyhow::bail!(
                "Invalid permission level: '{}'. Valid levels: allow, ask, deny",
                level
            );
        }
    };

    let level_display = match &permission_level {
        PermissionLevel::AlwaysAllow => "always allow",
        PermissionLevel::AskBefore => "ask before",
        PermissionLevel::NeverAllow => "never allow",
    };

    manager.update_user_permission(&tool, permission_level);
    println!("Permission updated: {} -> {}", tool, level_display);

    Ok(())
}

/// Reset all permissions to defaults (clears both in-memory and on-disk state)
pub async fn handle_permissions_reset() -> Result<()> {
    let manager = PermissionManager::instance();
    manager.reset_all();
    println!("All tool permissions have been reset to defaults.");
    Ok(())
}
