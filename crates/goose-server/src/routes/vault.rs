use crate::routes::errors::ErrorResponse;
use crate::state::AppState;
use axum::{
    extract::Path,
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use goose::config::Config;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Known Providers
// ---------------------------------------------------------------------------

/// Well-known provider definitions mapping environment variable names to
/// human-readable provider labels and validation URL prefixes.
const KNOWN_PROVIDERS: &[(&str, &str, &str)] = &[
    ("ANTHROPIC_API_KEY", "anthropic", "https://api.anthropic.com"),
    ("OPENAI_API_KEY", "openai", "https://api.openai.com"),
    ("GOOGLE_API_KEY", "google", "https://generativelanguage.googleapis.com"),
    ("DATABRICKS_TOKEN", "databricks", ""),
    ("OLLAMA_HOST", "ollama", ""),
];

/// Config key under which vault metadata is stored in config.yaml.
const VAULT_CONFIG_KEY: &str = "vault_entries";

// ---------------------------------------------------------------------------
// Data Types
// ---------------------------------------------------------------------------

/// Metadata for a stored key entry (persisted to config.yaml — no raw values).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntryMeta {
    /// The key name (e.g. "ANTHROPIC_API_KEY").
    pub name: String,
    /// The provider this key belongs to (e.g. "anthropic").
    pub provider: String,
    /// Masked version shown in API responses (e.g. "sk-...abc123").
    #[serde(default)]
    pub masked_value: String,
    /// When the key was first stored.
    pub created_at: DateTime<Utc>,
    /// When the key was last used (if ever).
    pub last_used: Option<DateTime<Utc>>,
    /// Whether the last validation check passed.
    pub is_valid: Option<bool>,
}

/// What we return in list responses — never includes the raw value.
#[derive(Debug, Clone, Serialize)]
pub struct VaultEntryResponse {
    pub name: String,
    pub provider: String,
    pub masked_value: String,
    pub created_at: DateTime<Utc>,
    pub last_used: Option<DateTime<Utc>>,
    pub is_valid: Option<bool>,
}

impl From<&VaultEntryMeta> for VaultEntryResponse {
    fn from(e: &VaultEntryMeta) -> Self {
        Self {
            name: e.name.clone(),
            provider: e.provider.clone(),
            masked_value: e.masked_value.clone(),
            created_at: e.created_at,
            last_used: e.last_used,
            is_valid: e.is_valid,
        }
    }
}

/// Request to store a new API key.
#[derive(Debug, Deserialize)]
pub struct StoreKeyRequest {
    pub name: String,
    pub value: String,
    pub provider: String,
}

/// Request to rotate an existing key.
#[derive(Debug, Deserialize)]
pub struct RotateKeyRequest {
    pub name: String,
    pub new_value: String,
}

/// Provider status summary.
#[derive(Debug, Clone, Serialize)]
pub struct ProviderStatus {
    pub name: String,
    pub env_var: String,
    pub has_key: bool,
    pub key_source: Option<String>,
    pub is_valid: Option<bool>,
}

/// Response from provider test.
#[derive(Debug, Serialize)]
pub struct ProviderTestResponse {
    pub provider: String,
    pub reachable: bool,
    pub message: String,
}

// ---------------------------------------------------------------------------
// Vault Persistence via goose Config system
// ---------------------------------------------------------------------------

/// The vault key name used in the goose secret store for each API key.
/// We prefix with `vault_` to avoid collisions with other secrets.
fn vault_secret_key(name: &str) -> String {
    format!("vault_{}", name)
}

/// Load all vault entry metadata from config.yaml.
fn load_vault_metadata() -> Result<HashMap<String, VaultEntryMeta>, String> {
    let config = Config::global();

    match config.get_param::<HashMap<String, VaultEntryMeta>>(VAULT_CONFIG_KEY) {
        Ok(entries) => Ok(entries),
        Err(goose::config::ConfigError::NotFound(_)) => Ok(HashMap::new()),
        Err(e) => Err(format!("Failed to load vault metadata: {}", e)),
    }
}

/// Save all vault entry metadata to config.yaml.
fn save_vault_metadata(entries: &HashMap<String, VaultEntryMeta>) -> Result<(), String> {
    let config = Config::global();
    config
        .set_param(VAULT_CONFIG_KEY, entries)
        .map_err(|e| format!("Failed to save vault metadata: {}", e))
}

/// Store an API key value in the goose secret store (keyring with file fallback).
fn store_secret_value(name: &str, value: &str) -> Result<(), String> {
    let config = Config::global();
    let key = vault_secret_key(name);
    config
        .set_secret(&key, &value.to_string())
        .map_err(|e| format!("Failed to store secret '{}': {}", name, e))
}

/// Retrieve an API key value from the goose secret store.
fn get_secret_value(name: &str) -> Option<String> {
    let config = Config::global();
    let key = vault_secret_key(name);
    config.get_secret::<String>(&key).ok()
}

/// Delete an API key value from the goose secret store.
fn delete_secret_value(name: &str) -> Result<(), String> {
    let config = Config::global();
    let key = vault_secret_key(name);
    config
        .delete_secret(&key)
        .map_err(|e| format!("Failed to delete secret '{}': {}", name, e))
}

/// Mask a key value for display purposes.
///
/// Rules:
/// - Keys shorter than 8 chars: show `***`
/// - Keys starting with a known prefix (e.g. `sk-`): show prefix + `...` + last 6 chars
/// - Otherwise: show first 4 chars + `...` + last 6 chars
pub fn mask_key(value: &str) -> String {
    if value.len() < 8 {
        return "***".to_string();
    }

    // Check for known prefixes
    let prefixes = ["sk-", "pk-", "key-", "dapi-", "gsk_", "xai-"];
    for prefix in &prefixes {
        if value.starts_with(prefix) {
            let suffix_start = value.len().saturating_sub(6);
            return format!("{}...{}", prefix, &value[suffix_start..]);
        }
    }

    // Generic masking: first 4 + ... + last 6
    let suffix_start = value.len().saturating_sub(6);
    format!("{}...{}", &value[..4], &value[suffix_start..])
}

/// Attempt to read a key value, checking the goose secret store first, then
/// environment variables.
fn resolve_key_value(name: &str) -> Option<(String, String)> {
    // 1. Check the goose secret store.
    if let Some(val) = get_secret_value(name) {
        if !val.is_empty() {
            return Some((val, "vault".to_string()));
        }
    }

    // 2. Fall back to environment variable.
    if let Ok(val) = std::env::var(name) {
        if !val.is_empty() {
            return Some((val, "environment".to_string()));
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Migration from legacy vault.json
// ---------------------------------------------------------------------------

/// One-time migration from the legacy encrypted vault.json to the goose Config
/// system. Runs silently on first access; if vault.json does not exist or has
/// already been migrated, this is a no-op.
fn maybe_migrate_legacy_vault() {
    let legacy_path = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("goose")
        .join("vault.json");

    if !legacy_path.exists() {
        return;
    }

    // Check if we already migrated (marker in config.yaml).
    let config = Config::global();
    if let Ok(true) = config.get_param::<bool>("vault_legacy_migrated") {
        return;
    }

    tracing::info!("Migrating legacy vault.json to goose Config system...");

    // Attempt to read and decrypt.
    let raw = match std::fs::read(&legacy_path) {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("Could not read legacy vault.json: {}", e);
            return;
        }
    };

    let key = derive_legacy_encryption_key();
    let decrypted = legacy_xor_cipher(&raw, &key);

    #[derive(Deserialize)]
    struct LegacyVaultStore {
        #[allow(dead_code)]
        version: u32,
        entries: HashMap<String, LegacyVaultEntry>,
    }
    #[derive(Deserialize)]
    struct LegacyVaultEntry {
        name: String,
        provider: String,
        value: String,
        masked_value: String,
        created_at: DateTime<Utc>,
        last_used: Option<DateTime<Utc>>,
        is_valid: Option<bool>,
    }

    let store: LegacyVaultStore = match serde_json::from_slice(&decrypted) {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("Could not parse legacy vault.json: {}", e);
            return;
        }
    };

    // Migrate each entry.
    let mut metadata = load_vault_metadata().unwrap_or_default();

    for (key_name, entry) in &store.entries {
        // Store the secret value.
        if let Err(e) = store_secret_value(key_name, &entry.value) {
            tracing::warn!("Failed to migrate secret '{}': {}", key_name, e);
            continue;
        }

        // Store the metadata.
        metadata.insert(
            key_name.clone(),
            VaultEntryMeta {
                name: entry.name.clone(),
                provider: entry.provider.clone(),
                masked_value: entry.masked_value.clone(),
                created_at: entry.created_at,
                last_used: entry.last_used,
                is_valid: entry.is_valid,
            },
        );
    }

    if let Err(e) = save_vault_metadata(&metadata) {
        tracing::warn!("Failed to save migrated vault metadata: {}", e);
        return;
    }

    // Mark migration as complete.
    let _ = config.set_param("vault_legacy_migrated", true);

    tracing::info!(
        "Successfully migrated {} keys from legacy vault.json",
        store.entries.len()
    );
}

/// Legacy XOR cipher for reading old vault.json files during migration.
fn legacy_xor_cipher(data: &[u8], key: &[u8; 32]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % 32])
        .collect()
}

/// Legacy key derivation for reading old vault.json files during migration.
fn derive_legacy_encryption_key() -> [u8; 32] {
    let seed = dirs::config_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "goose-default-host".to_string());

    let constant: [u8; 32] = [
        0x6f, 0x9a, 0x3b, 0xd7, 0x12, 0xe4, 0x5c, 0x88, 0xa1, 0x2f, 0x7d, 0xc3, 0x49, 0x86,
        0x0e, 0xf5, 0x3a, 0xb8, 0x61, 0xd0, 0x17, 0xec, 0x4f, 0x93, 0xa6, 0x2c, 0x78, 0xc1,
        0x55, 0x8a, 0x0d, 0xf2,
    ];

    let mut key = [0u8; 32];
    let seed_bytes = seed.as_bytes();
    for i in 0..32 {
        let h = if i < seed_bytes.len() {
            seed_bytes[i]
        } else {
            (i as u8).wrapping_mul(0x37)
        };
        key[i] = h ^ constant[i];
    }
    key
}

// ---------------------------------------------------------------------------
// Key Management Handlers
// ---------------------------------------------------------------------------

/// `GET /api/vault/keys` — List all stored keys (masked values only).
async fn list_keys() -> Result<Json<Vec<VaultEntryResponse>>, ErrorResponse> {
    // Migrate legacy data on first access.
    maybe_migrate_legacy_vault();

    let metadata = load_vault_metadata().map_err(ErrorResponse::internal)?;

    let mut entries: Vec<VaultEntryResponse> =
        metadata.values().map(VaultEntryResponse::from).collect();

    // Also include keys detected from environment that are NOT in the vault.
    for &(env_var, provider, _) in KNOWN_PROVIDERS {
        if !metadata.contains_key(env_var) {
            if let Ok(val) = std::env::var(env_var) {
                if !val.is_empty() {
                    entries.push(VaultEntryResponse {
                        name: env_var.to_string(),
                        provider: provider.to_string(),
                        masked_value: mask_key(&val),
                        created_at: Utc::now(),
                        last_used: None,
                        is_valid: None,
                    });
                }
            }
        }
    }

    // Sort by name for consistent ordering.
    entries.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(Json(entries))
}

/// `POST /api/vault/keys` — Store a new API key.
async fn store_key(
    Json(request): Json<StoreKeyRequest>,
) -> Result<Json<VaultEntryResponse>, ErrorResponse> {
    if request.name.is_empty() {
        return Err(ErrorResponse::bad_request("Key name cannot be empty"));
    }
    if request.value.is_empty() {
        return Err(ErrorResponse::bad_request("Key value cannot be empty"));
    }
    if request.provider.is_empty() {
        return Err(ErrorResponse::bad_request("Provider cannot be empty"));
    }

    // Migrate legacy data on first write too.
    maybe_migrate_legacy_vault();

    // Store the raw key value in the goose secret store (keyring/file).
    store_secret_value(&request.name, &request.value).map_err(ErrorResponse::internal)?;

    // Store metadata in config.yaml (no raw key value).
    let mut metadata = load_vault_metadata().map_err(ErrorResponse::internal)?;

    let masked = mask_key(&request.value);
    let entry_meta = VaultEntryMeta {
        name: request.name.clone(),
        provider: request.provider.clone(),
        masked_value: masked,
        created_at: Utc::now(),
        last_used: None,
        is_valid: None,
    };

    metadata.insert(request.name.clone(), entry_meta.clone());
    save_vault_metadata(&metadata).map_err(ErrorResponse::internal)?;

    Ok(Json(VaultEntryResponse::from(&entry_meta)))
}

/// `DELETE /api/vault/keys/{name}` — Remove a stored key.
async fn delete_key(
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, ErrorResponse> {
    let mut metadata = load_vault_metadata().map_err(ErrorResponse::internal)?;

    if metadata.remove(&name).is_none() {
        return Err(ErrorResponse::not_found(format!(
            "Key '{}' not found in vault",
            name
        )));
    }

    // Remove the secret from the goose secret store.
    if let Err(e) = delete_secret_value(&name) {
        tracing::warn!("Failed to delete secret for '{}': {}", name, e);
        // Continue — metadata removal is the critical path.
    }

    save_vault_metadata(&metadata).map_err(ErrorResponse::internal)?;

    Ok(Json(serde_json::json!({
        "message": format!("Key '{}' removed successfully", name),
    })))
}

/// `GET /api/vault/keys/{name}/status` — Check if a key is valid by testing it.
async fn key_status(
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, ErrorResponse> {
    let (value, source) = resolve_key_value(&name).ok_or_else(|| {
        ErrorResponse::not_found(format!("Key '{}' not found in vault or environment", name))
    })?;

    // Find the provider for this key name.
    let provider = KNOWN_PROVIDERS
        .iter()
        .find(|(env_var, _, _)| *env_var == name.as_str())
        .map(|(_, p, _)| *p)
        .unwrap_or("unknown");

    let is_valid = test_key_validity(&name, &value, provider).await;

    // Update the vault metadata if this key is from the vault.
    if source == "vault" {
        if let Ok(mut metadata) = load_vault_metadata() {
            if let Some(entry) = metadata.get_mut(&name) {
                entry.is_valid = Some(is_valid);
                entry.last_used = Some(Utc::now());
                let _ = save_vault_metadata(&metadata);
            }
        }
    }

    Ok(Json(serde_json::json!({
        "name": name,
        "provider": provider,
        "source": source,
        "is_valid": is_valid,
        "checked_at": Utc::now().to_rfc3339(),
    })))
}

/// `POST /api/vault/keys/rotate` — Rotate a key (replace old value with new).
async fn rotate_key(
    Json(request): Json<RotateKeyRequest>,
) -> Result<Json<VaultEntryResponse>, ErrorResponse> {
    if request.name.is_empty() {
        return Err(ErrorResponse::bad_request("Key name cannot be empty"));
    }
    if request.new_value.is_empty() {
        return Err(ErrorResponse::bad_request("New key value cannot be empty"));
    }

    let mut metadata = load_vault_metadata().map_err(ErrorResponse::internal)?;

    let entry = metadata.get_mut(&request.name).ok_or_else(|| {
        ErrorResponse::not_found(format!("Key '{}' not found in vault", request.name))
    })?;

    // Update the secret value.
    store_secret_value(&request.name, &request.new_value).map_err(ErrorResponse::internal)?;

    // Update metadata.
    entry.masked_value = mask_key(&request.new_value);
    entry.is_valid = None; // Reset validation after rotation.

    let response = VaultEntryResponse::from(&*entry);
    save_vault_metadata(&metadata).map_err(ErrorResponse::internal)?;

    Ok(Json(response))
}

// ---------------------------------------------------------------------------
// Provider Handlers
// ---------------------------------------------------------------------------

/// `GET /api/vault/providers` — List known providers with key availability status.
async fn list_providers() -> Result<Json<Vec<ProviderStatus>>, ErrorResponse> {
    // Migrate legacy data on first access.
    maybe_migrate_legacy_vault();

    let metadata = load_vault_metadata().map_err(ErrorResponse::internal)?;

    let providers: Vec<ProviderStatus> = KNOWN_PROVIDERS
        .iter()
        .map(|(env_var, name, _)| {
            // Check vault metadata first, then env.
            let (has_key, key_source, is_valid) =
                if let Some(entry) = metadata.get(*env_var) {
                    (true, Some("vault".to_string()), entry.is_valid)
                } else if std::env::var(env_var).map(|v| !v.is_empty()).unwrap_or(false) {
                    (true, Some("environment".to_string()), None)
                } else {
                    (false, None, None)
                };

            ProviderStatus {
                name: name.to_string(),
                env_var: env_var.to_string(),
                has_key,
                key_source,
                is_valid,
            }
        })
        .collect();

    Ok(Json(providers))
}

/// `POST /api/vault/providers/{name}/test` — Test connectivity for a provider.
async fn test_provider(
    Path(name): Path<String>,
) -> Result<Json<ProviderTestResponse>, ErrorResponse> {
    // Find the provider definition.
    let (env_var, provider_name, test_url) = KNOWN_PROVIDERS
        .iter()
        .find(|(_, p, _)| *p == name.as_str())
        .ok_or_else(|| {
            ErrorResponse::not_found(format!("Unknown provider '{}'", name))
        })?;

    // Resolve the key for this provider.
    let key_value = resolve_key_value(env_var);

    if test_url.is_empty() {
        // Providers without a test URL (databricks, ollama) get a basic check.
        let has_key = key_value.is_some();
        return Ok(Json(ProviderTestResponse {
            provider: provider_name.to_string(),
            reachable: has_key,
            message: if has_key {
                format!("Key for '{}' is configured (connectivity test not available)", provider_name)
            } else {
                format!("No key configured for '{}'", provider_name)
            },
        }));
    }

    let (api_key, _source) = match key_value {
        Some(kv) => kv,
        None => {
            return Ok(Json(ProviderTestResponse {
                provider: provider_name.to_string(),
                reachable: false,
                message: format!("No API key found for '{}' — set {} in vault or environment", provider_name, env_var),
            }));
        }
    };

    // Perform a lightweight HTTP request to the provider.
    let result = test_provider_connectivity(provider_name, test_url, &api_key).await;

    Ok(Json(ProviderTestResponse {
        provider: provider_name.to_string(),
        reachable: result.is_ok(),
        message: match result {
            Ok(msg) => msg,
            Err(msg) => msg,
        },
    }))
}

// ---------------------------------------------------------------------------
// Key Validation Helpers
// ---------------------------------------------------------------------------

/// Test whether a key is valid by making a lightweight API call to the provider.
async fn test_key_validity(name: &str, value: &str, provider: &str) -> bool {
    let test_url = KNOWN_PROVIDERS
        .iter()
        .find(|(env, _, _)| *env == name || provider == *env)
        .map(|(_, _, url)| *url)
        .unwrap_or("");

    if test_url.is_empty() {
        // Cannot validate keys without a test URL — assume valid if non-empty.
        return !value.is_empty();
    }

    test_provider_connectivity(provider, test_url, value)
        .await
        .is_ok()
}

/// Make a lightweight HTTP request to verify provider connectivity.
///
/// For each provider we hit a minimal endpoint:
/// - Anthropic: POST /v1/messages with empty body (expect 400, not 401)
/// - OpenAI: GET /v1/models
/// - Google: GET /v1beta/models
async fn test_provider_connectivity(
    provider: &str,
    base_url: &str,
    api_key: &str,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    match provider {
        "anthropic" => {
            let resp = client
                .post(format!("{}/v1/messages", base_url))
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .body("{}")
                .send()
                .await
                .map_err(|e| format!("Connection failed: {}", e))?;

            let status = resp.status().as_u16();
            // 400 = bad request (key is valid, body was empty)
            // 401 = unauthorized (key is invalid)
            if status == 401 {
                Err("Authentication failed — invalid API key".to_string())
            } else {
                Ok(format!("Anthropic API reachable (status {})", status))
            }
        }
        "openai" => {
            let resp = client
                .get(format!("{}/v1/models", base_url))
                .header("Authorization", format!("Bearer {}", api_key))
                .send()
                .await
                .map_err(|e| format!("Connection failed: {}", e))?;

            let status = resp.status().as_u16();
            if status == 401 {
                Err("Authentication failed — invalid API key".to_string())
            } else {
                Ok(format!("OpenAI API reachable (status {})", status))
            }
        }
        "google" => {
            let resp = client
                .get(format!("{}/v1beta/models?key={}", base_url, api_key))
                .send()
                .await
                .map_err(|e| format!("Connection failed: {}", e))?;

            let status = resp.status().as_u16();
            if status == 400 || status == 403 {
                Err("Authentication failed — invalid API key".to_string())
            } else {
                Ok(format!("Google AI API reachable (status {})", status))
            }
        }
        _ => {
            // Generic check: just see if the base URL is reachable.
            let resp = client
                .get(base_url)
                .send()
                .await
                .map_err(|e| format!("Connection failed: {}", e))?;

            Ok(format!("Provider reachable (status {})", resp.status().as_u16()))
        }
    }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        // Key management — register fixed paths before wildcard `/{name}` paths.
        .route("/api/vault/keys", get(list_keys))
        .route("/api/vault/keys", post(store_key))
        .route("/api/vault/keys/rotate", post(rotate_key))
        .route("/api/vault/keys/{name}", delete(delete_key))
        .route("/api/vault/keys/{name}/status", get(key_status))
        // Provider status.
        .route("/api/vault/providers", get(list_providers))
        .route("/api/vault/providers/{name}/test", post(test_provider))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // --- mask_key tests ---

    #[test]
    fn test_mask_short_key() {
        assert_eq!(mask_key("abc"), "***");
        assert_eq!(mask_key("1234567"), "***");
        assert_eq!(mask_key(""), "***");
    }

    #[test]
    fn test_mask_sk_prefix() {
        let key = "sk-ant-api03-abcdef123456789";
        let masked = mask_key(key);
        assert!(masked.starts_with("sk-..."), "Got: {}", masked);
        assert!(masked.ends_with("456789"), "Got: {}", masked);
        assert!(!masked.contains("abcdef"), "Masked key should not contain middle chars");
    }

    #[test]
    fn test_mask_generic_key() {
        let key = "abcdefghijklmnopqrstuvwxyz";
        let masked = mask_key(key);
        assert!(masked.starts_with("abcd..."), "Got: {}", masked);
        assert!(masked.ends_with("uvwxyz"), "Got: {}", masked);
    }

    #[test]
    fn test_mask_dapi_prefix() {
        let key = "dapi-somethinglong123456";
        let masked = mask_key(key);
        assert!(masked.starts_with("dapi-..."), "Got: {}", masked);
        assert!(masked.ends_with("123456"), "Got: {}", masked);
    }

    #[test]
    fn test_mask_eight_char_key() {
        let key = "12345678";
        let masked = mask_key(key);
        // 8 chars, no known prefix -> "1234...345678"
        assert!(masked.starts_with("1234..."), "Got: {}", masked);
        assert!(masked.ends_with("345678"), "Got: {}", masked);
    }

    // --- VaultEntryMeta serialization tests ---

    #[test]
    fn test_vault_entry_meta_serialization() {
        let entry = VaultEntryMeta {
            name: "OPENAI_API_KEY".to_string(),
            provider: "openai".to_string(),
            masked_value: "sk-...lmnop".to_string(),
            created_at: Utc::now(),
            last_used: None,
            is_valid: Some(true),
        };

        let json_str = serde_json::to_string(&entry).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        assert_eq!(parsed["name"], "OPENAI_API_KEY");
        assert_eq!(parsed["provider"], "openai");
        assert_eq!(parsed["is_valid"], true);
        // Metadata struct should never contain a raw "value" field.
        assert!(parsed.get("value").is_none());
    }

    #[test]
    fn test_vault_entry_response_from_meta() {
        let meta = VaultEntryMeta {
            name: "ANTHROPIC_API_KEY".to_string(),
            provider: "anthropic".to_string(),
            masked_value: "sk-...t-leak".to_string(),
            created_at: Utc::now(),
            last_used: None,
            is_valid: None,
        };

        let response = VaultEntryResponse::from(&meta);
        let json_str = serde_json::to_string(&response).unwrap();

        assert!(json_str.contains("sk-...t-leak"));
        assert!(json_str.contains("ANTHROPIC_API_KEY"));
        // No raw value field in the response.
        assert!(!json_str.contains("\"value\""));
    }

    // --- StoreKeyRequest deserialization ---

    #[test]
    fn test_store_key_request_deserialization() {
        let raw = json!({
            "name": "OPENAI_API_KEY",
            "value": "sk-live-abc123",
            "provider": "openai"
        });

        let request: StoreKeyRequest = serde_json::from_value(raw).unwrap();
        assert_eq!(request.name, "OPENAI_API_KEY");
        assert_eq!(request.value, "sk-live-abc123");
        assert_eq!(request.provider, "openai");
    }

    #[test]
    fn test_rotate_key_request_deserialization() {
        let raw = json!({
            "name": "ANTHROPIC_API_KEY",
            "new_value": "sk-ant-new-key-value"
        });

        let request: RotateKeyRequest = serde_json::from_value(raw).unwrap();
        assert_eq!(request.name, "ANTHROPIC_API_KEY");
        assert_eq!(request.new_value, "sk-ant-new-key-value");
    }

    // --- ProviderStatus tests ---

    #[test]
    fn test_provider_status_serialization() {
        let status = ProviderStatus {
            name: "openai".to_string(),
            env_var: "OPENAI_API_KEY".to_string(),
            has_key: true,
            key_source: Some("vault".to_string()),
            is_valid: Some(true),
        };

        let json_str = serde_json::to_string(&status).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        assert_eq!(parsed["name"], "openai");
        assert_eq!(parsed["env_var"], "OPENAI_API_KEY");
        assert_eq!(parsed["has_key"], true);
        assert_eq!(parsed["key_source"], "vault");
        assert_eq!(parsed["is_valid"], true);
    }

    #[test]
    fn test_provider_status_no_key() {
        let status = ProviderStatus {
            name: "databricks".to_string(),
            env_var: "DATABRICKS_TOKEN".to_string(),
            has_key: false,
            key_source: None,
            is_valid: None,
        };

        let json_str = serde_json::to_string(&status).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        assert_eq!(parsed["name"], "databricks");
        assert_eq!(parsed["has_key"], false);
        assert!(parsed["key_source"].is_null());
        assert!(parsed["is_valid"].is_null());
    }

    // --- ProviderTestResponse tests ---

    #[test]
    fn test_provider_test_response_serialization() {
        let resp = ProviderTestResponse {
            provider: "anthropic".to_string(),
            reachable: true,
            message: "Anthropic API reachable (status 400)".to_string(),
        };

        let json_str = serde_json::to_string(&resp).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        assert_eq!(parsed["provider"], "anthropic");
        assert_eq!(parsed["reachable"], true);
        assert!(parsed["message"].as_str().unwrap().contains("reachable"));
    }

    // --- KNOWN_PROVIDERS tests ---

    #[test]
    fn test_known_providers_complete() {
        assert_eq!(KNOWN_PROVIDERS.len(), 5);

        let names: Vec<&str> = KNOWN_PROVIDERS.iter().map(|(_, name, _)| *name).collect();
        assert!(names.contains(&"anthropic"));
        assert!(names.contains(&"openai"));
        assert!(names.contains(&"google"));
        assert!(names.contains(&"databricks"));
        assert!(names.contains(&"ollama"));
    }

    #[test]
    fn test_known_providers_env_vars() {
        let env_vars: Vec<&str> = KNOWN_PROVIDERS.iter().map(|(env, _, _)| *env).collect();
        assert!(env_vars.contains(&"ANTHROPIC_API_KEY"));
        assert!(env_vars.contains(&"OPENAI_API_KEY"));
        assert!(env_vars.contains(&"GOOGLE_API_KEY"));
        assert!(env_vars.contains(&"DATABRICKS_TOKEN"));
        assert!(env_vars.contains(&"OLLAMA_HOST"));
    }

    // --- vault_secret_key tests ---

    #[test]
    fn test_vault_secret_key_format() {
        assert_eq!(vault_secret_key("OPENAI_API_KEY"), "vault_OPENAI_API_KEY");
        assert_eq!(vault_secret_key("test"), "vault_test");
    }

    // --- Route creation test ---

    #[test]
    fn test_routes_creation() {
        let _router_fn: fn(Arc<AppState>) -> Router = routes;
    }

    // --- Mask edge cases ---

    #[test]
    fn test_mask_key_prefix() {
        let key = "key-abcdefghijklmnop";
        let masked = mask_key(key);
        assert!(masked.starts_with("key-..."), "Got: {}", masked);
    }

    #[test]
    fn test_mask_gsk_prefix() {
        let key = "gsk_abcdefghijklmnopqrstuv";
        let masked = mask_key(key);
        assert!(masked.starts_with("gsk_..."), "Got: {}", masked);
    }

    #[test]
    fn test_mask_xai_prefix() {
        let key = "xai-abcdefghijklmnopqrstuv";
        let masked = mask_key(key);
        assert!(masked.starts_with("xai-..."), "Got: {}", masked);
    }

    // --- Legacy migration helpers ---

    #[test]
    fn test_legacy_xor_cipher_round_trip() {
        let key = derive_legacy_encryption_key();
        let plaintext = b"Hello, vault! This is a secret key value.";

        let encrypted = legacy_xor_cipher(plaintext, &key);
        assert_ne!(encrypted.as_slice(), plaintext.as_slice());

        let decrypted = legacy_xor_cipher(&encrypted, &key);
        assert_eq!(decrypted.as_slice(), plaintext.as_slice());
    }

    #[test]
    fn test_legacy_encryption_key_is_32_bytes() {
        let key = derive_legacy_encryption_key();
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn test_legacy_encryption_key_deterministic() {
        let k1 = derive_legacy_encryption_key();
        let k2 = derive_legacy_encryption_key();
        assert_eq!(k1, k2, "Key derivation must be deterministic");
    }

    #[test]
    fn test_legacy_encryption_key_not_all_zeros() {
        let key = derive_legacy_encryption_key();
        assert!(key.iter().any(|&b| b != 0), "Key should not be all zeros");
    }
}
