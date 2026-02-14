use crate::routes::errors::ErrorResponse;
use crate::state::AppState;
use axum::{
    extract::Path,
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
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

// ---------------------------------------------------------------------------
// Data Types
// ---------------------------------------------------------------------------

/// A single stored key entry (persisted to vault.json).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntry {
    /// The key name (e.g. "ANTHROPIC_API_KEY").
    pub name: String,
    /// The provider this key belongs to (e.g. "anthropic").
    pub provider: String,
    /// The full key value (only stored on disk, never returned via API).
    #[serde(default)]
    pub value: String,
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

impl From<&VaultEntry> for VaultEntryResponse {
    fn from(e: &VaultEntry) -> Self {
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
// Vault Store (encrypted JSON file)
// ---------------------------------------------------------------------------

/// On-disk representation of the vault.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct VaultStore {
    /// Version tag for future schema migrations.
    version: u32,
    /// Map from key name to entry.
    entries: HashMap<String, VaultEntry>,
}

/// Path to the vault file: `~/.config/goose/vault.json`
fn vault_path() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("goose");
    config_dir.join("vault.json")
}

/// Derive a 32-byte encryption key from a machine-specific seed.
///
/// Current implementation: XOR a fixed constant with a user/machine identifier
/// derived from the config directory path (which includes the username on all
/// platforms). This is not cryptographically strong — it simply deters casual
/// reading of the vault file.
///
/// TODO: Upgrade to proper HKDF with a real crypto crate (ring / aes-gcm).
fn derive_encryption_key() -> [u8; 32] {
    // Use the config directory path as a machine+user-specific seed.
    // On Windows this is typically `C:\Users\<name>\AppData\Roaming`,
    // on macOS `~/Library/Application Support`, on Linux `~/.config`.
    let seed = dirs::config_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "goose-default-host".to_string());

    // Simple key derivation: pad hostname to 32 bytes, XOR with constant.
    let constant: [u8; 32] = [
        0x6f, 0x9a, 0x3b, 0xd7, 0x12, 0xe4, 0x5c, 0x88,
        0xa1, 0x2f, 0x7d, 0xc3, 0x49, 0x86, 0x0e, 0xf5,
        0x3a, 0xb8, 0x61, 0xd0, 0x17, 0xec, 0x4f, 0x93,
        0xa6, 0x2c, 0x78, 0xc1, 0x55, 0x8a, 0x0d, 0xf2,
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

/// XOR-encrypt / decrypt bytes with a repeating key.
///
/// This is a symmetric cipher — the same function encrypts and decrypts.
/// It is **not** cryptographically strong (no authentication, no IV).
/// TODO: Replace with AES-256-GCM once a crypto crate is added.
fn xor_cipher(data: &[u8], key: &[u8; 32]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % 32])
        .collect()
}

/// Load the vault from disk, decrypting if the file exists.
fn load_vault() -> Result<VaultStore, String> {
    let path = vault_path();
    if !path.exists() {
        return Ok(VaultStore {
            version: 1,
            entries: HashMap::new(),
        });
    }

    let raw = std::fs::read(&path).map_err(|e| format!("Failed to read vault file: {}", e))?;

    let key = derive_encryption_key();
    let decrypted = xor_cipher(&raw, &key);

    let store: VaultStore = serde_json::from_slice(&decrypted)
        .map_err(|e| format!("Failed to parse vault JSON: {}", e))?;

    Ok(store)
}

/// Save the vault to disk, encrypting before write.
fn save_vault(store: &VaultStore) -> Result<(), String> {
    let path = vault_path();

    // Ensure parent directory exists.
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create vault directory: {}", e))?;
    }

    let json =
        serde_json::to_vec_pretty(store).map_err(|e| format!("Failed to serialize vault: {}", e))?;

    let key = derive_encryption_key();
    let encrypted = xor_cipher(&json, &key);

    std::fs::write(&path, &encrypted).map_err(|e| format!("Failed to write vault file: {}", e))?;

    Ok(())
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

/// Attempt to read a key value, checking vault first, then environment variables.
fn resolve_key_value(name: &str) -> Option<(String, String)> {
    // 1. Check the vault.
    if let Ok(store) = load_vault() {
        if let Some(entry) = store.entries.get(name) {
            return Some((entry.value.clone(), "vault".to_string()));
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
// Key Management Handlers
// ---------------------------------------------------------------------------

/// `GET /api/vault/keys` — List all stored keys (masked values only).
async fn list_keys() -> Result<Json<Vec<VaultEntryResponse>>, ErrorResponse> {
    let store = load_vault().map_err(ErrorResponse::internal)?;

    let mut entries: Vec<VaultEntryResponse> = store
        .entries
        .values()
        .map(VaultEntryResponse::from)
        .collect();

    // Also include keys detected from environment that are NOT in the vault.
    for &(env_var, provider, _) in KNOWN_PROVIDERS {
        if !store.entries.contains_key(env_var) {
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

    let mut store = load_vault().map_err(ErrorResponse::internal)?;

    let masked = mask_key(&request.value);
    let entry = VaultEntry {
        name: request.name.clone(),
        provider: request.provider.clone(),
        value: request.value,
        masked_value: masked,
        created_at: Utc::now(),
        last_used: None,
        is_valid: None,
    };

    store.entries.insert(request.name.clone(), entry.clone());
    save_vault(&store).map_err(ErrorResponse::internal)?;

    Ok(Json(VaultEntryResponse::from(&entry)))
}

/// `DELETE /api/vault/keys/{name}` — Remove a stored key.
async fn delete_key(
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, ErrorResponse> {
    let mut store = load_vault().map_err(ErrorResponse::internal)?;

    if store.entries.remove(&name).is_none() {
        return Err(ErrorResponse::not_found(format!(
            "Key '{}' not found in vault",
            name
        )));
    }

    save_vault(&store).map_err(ErrorResponse::internal)?;

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

    // Update the vault entry if it exists.
    if source == "vault" {
        if let Ok(mut store) = load_vault() {
            if let Some(entry) = store.entries.get_mut(&name) {
                entry.is_valid = Some(is_valid);
                entry.last_used = Some(Utc::now());
                let _ = save_vault(&store);
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

    let mut store = load_vault().map_err(ErrorResponse::internal)?;

    let entry = store.entries.get_mut(&request.name).ok_or_else(|| {
        ErrorResponse::not_found(format!("Key '{}' not found in vault", request.name))
    })?;

    entry.value = request.new_value.clone();
    entry.masked_value = mask_key(&request.new_value);
    entry.is_valid = None; // Reset validation after rotation.

    let response = VaultEntryResponse::from(&*entry);
    save_vault(&store).map_err(ErrorResponse::internal)?;

    Ok(Json(response))
}

// ---------------------------------------------------------------------------
// Provider Handlers
// ---------------------------------------------------------------------------

/// `GET /api/vault/providers` — List known providers with key availability status.
async fn list_providers() -> Result<Json<Vec<ProviderStatus>>, ErrorResponse> {
    let store = load_vault().map_err(ErrorResponse::internal)?;

    let providers: Vec<ProviderStatus> = KNOWN_PROVIDERS
        .iter()
        .map(|(env_var, name, _)| {
            // Check vault first, then env.
            let (has_key, key_source, is_valid) =
                if let Some(entry) = store.entries.get(*env_var) {
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

    // --- VaultEntry serialization tests ---

    #[test]
    fn test_vault_entry_serialization() {
        let entry = VaultEntry {
            name: "OPENAI_API_KEY".to_string(),
            provider: "openai".to_string(),
            value: "sk-live-abcdefghijklmnop".to_string(),
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
    }

    #[test]
    fn test_vault_entry_response_omits_value() {
        let entry = VaultEntry {
            name: "ANTHROPIC_API_KEY".to_string(),
            provider: "anthropic".to_string(),
            value: "sk-ant-secret-value-do-not-leak".to_string(),
            masked_value: "sk-...t-leak".to_string(),
            created_at: Utc::now(),
            last_used: None,
            is_valid: None,
        };

        let response = VaultEntryResponse::from(&entry);
        let json_str = serde_json::to_string(&response).unwrap();

        // The response must NOT contain the raw value.
        assert!(!json_str.contains("secret-value-do-not-leak"));
        assert!(json_str.contains("sk-...t-leak"));
        assert!(json_str.contains("ANTHROPIC_API_KEY"));
    }

    // --- VaultStore tests ---

    #[test]
    fn test_vault_store_default() {
        let store = VaultStore::default();
        assert_eq!(store.version, 0);
        assert!(store.entries.is_empty());
    }

    #[test]
    fn test_vault_store_round_trip() {
        let mut store = VaultStore {
            version: 1,
            entries: HashMap::new(),
        };

        store.entries.insert(
            "TEST_KEY".to_string(),
            VaultEntry {
                name: "TEST_KEY".to_string(),
                provider: "test".to_string(),
                value: "secret123".to_string(),
                masked_value: "***".to_string(),
                created_at: Utc::now(),
                last_used: None,
                is_valid: None,
            },
        );

        let json = serde_json::to_string(&store).unwrap();
        let restored: VaultStore = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.version, 1);
        assert_eq!(restored.entries.len(), 1);
        assert!(restored.entries.contains_key("TEST_KEY"));
        assert_eq!(restored.entries["TEST_KEY"].value, "secret123");
    }

    // --- XOR cipher tests ---

    #[test]
    fn test_xor_cipher_round_trip() {
        let key = derive_encryption_key();
        let plaintext = b"Hello, vault! This is a secret key value.";

        let encrypted = xor_cipher(plaintext, &key);
        assert_ne!(encrypted.as_slice(), plaintext.as_slice());

        let decrypted = xor_cipher(&encrypted, &key);
        assert_eq!(decrypted.as_slice(), plaintext.as_slice());
    }

    #[test]
    fn test_xor_cipher_empty_input() {
        let key = derive_encryption_key();
        let encrypted = xor_cipher(b"", &key);
        assert!(encrypted.is_empty());
    }

    #[test]
    fn test_xor_cipher_deterministic() {
        let key = derive_encryption_key();
        let data = b"consistent output test";

        let enc1 = xor_cipher(data, &key);
        let enc2 = xor_cipher(data, &key);
        assert_eq!(enc1, enc2, "Same input + key must produce same output");
    }

    // --- derive_encryption_key tests ---

    #[test]
    fn test_derive_encryption_key_is_32_bytes() {
        let key = derive_encryption_key();
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn test_derive_encryption_key_deterministic() {
        let k1 = derive_encryption_key();
        let k2 = derive_encryption_key();
        assert_eq!(k1, k2, "Key derivation must be deterministic");
    }

    #[test]
    fn test_derive_encryption_key_not_all_zeros() {
        let key = derive_encryption_key();
        assert!(key.iter().any(|&b| b != 0), "Key should not be all zeros");
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

    // --- vault_path test ---

    #[test]
    fn test_vault_path_ends_with_vault_json() {
        let path = vault_path();
        assert!(
            path.ends_with("goose/vault.json"),
            "Expected path ending with goose/vault.json, got: {:?}",
            path
        );
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

    // --- Integration-style: full store/load cycle via in-memory JSON ---

    #[test]
    fn test_vault_store_json_cycle() {
        let mut store = VaultStore {
            version: 1,
            entries: HashMap::new(),
        };

        // Store multiple keys.
        for (env_var, provider, _) in KNOWN_PROVIDERS {
            store.entries.insert(
                env_var.to_string(),
                VaultEntry {
                    name: env_var.to_string(),
                    provider: provider.to_string(),
                    value: format!("fake-{}-key-value", provider),
                    masked_value: mask_key(&format!("fake-{}-key-value", provider)),
                    created_at: Utc::now(),
                    last_used: None,
                    is_valid: None,
                },
            );
        }

        // Serialize then encrypt.
        let json = serde_json::to_vec_pretty(&store).unwrap();
        let key = derive_encryption_key();
        let encrypted = xor_cipher(&json, &key);

        // Decrypt then deserialize.
        let decrypted = xor_cipher(&encrypted, &key);
        let restored: VaultStore = serde_json::from_slice(&decrypted).unwrap();

        assert_eq!(restored.version, 1);
        assert_eq!(restored.entries.len(), 5);
        assert_eq!(
            restored.entries["OPENAI_API_KEY"].provider,
            "openai"
        );
        assert_eq!(
            restored.entries["ANTHROPIC_API_KEY"].provider,
            "anthropic"
        );

        // Verify none of the response conversions leak the raw value.
        for entry in restored.entries.values() {
            let resp = VaultEntryResponse::from(entry);
            let json_str = serde_json::to_string(&resp).unwrap();
            assert!(
                !json_str.contains(&entry.value),
                "Response must not contain raw key value for {}",
                entry.name
            );
        }
    }
}
