//! DSPy Compiled Prompt Loader — Loads optimized prompts from disk.
//!
//! Checks `~/.config/goose/dspy/compiled_prompts.json` for optimized
//! system prompt instructions produced by the DSPy bridge.
//! Returns `None` if the file doesn't exist or is unparseable
//! (silent fallback to static prompts).

use std::path::PathBuf;
use tracing::{debug, info};

/// Load DSPy-compiled prompt prefix from disk.
///
/// Checks `~/.config/goose/dspy/compiled_prompts.json` for a
/// `system_prompt_prefix` field containing optimized instructions.
pub fn load_dspy_prompt_prefix() -> Option<String> {
    let config_dir = dirs::config_dir()?;
    let path = config_dir
        .join("goose")
        .join("dspy")
        .join("compiled_prompts.json");

    if !path.exists() {
        debug!(path = %path.display(), "No DSPy compiled prompts found");
        return None;
    }

    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => {
            debug!(
                path = %path.display(),
                error = %e,
                "Failed to read DSPy compiled prompts"
            );
            return None;
        }
    };

    let parsed: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            debug!(
                path = %path.display(),
                error = %e,
                "Failed to parse DSPy compiled prompts JSON"
            );
            return None;
        }
    };

    let prefix = parsed
        .get("system_prompt_prefix")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())?;

    info!(
        path = %path.display(),
        prefix_len = prefix.len(),
        "Loaded DSPy compiled prompt prefix"
    );

    Some(prefix)
}

/// Get the path where DSPy compiled prompts are stored.
pub fn compiled_prompts_path() -> Option<PathBuf> {
    let config_dir = dirs::config_dir()?;
    Some(
        config_dir
            .join("goose")
            .join("dspy")
            .join("compiled_prompts.json"),
    )
}
