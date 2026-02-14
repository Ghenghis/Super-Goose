use crate::state::AppState;
use axum::{routing::get, Json, Router};
use serde::Serialize;
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct GpuInfo {
    pub name: String,
    pub memory_total_mb: u64,
    pub memory_used_mb: u64,
    pub utilization_pct: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct GpuResponse {
    pub detected: bool,
    pub gpus: Vec<GpuInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/// Parse the CSV output from `nvidia-smi --query-gpu=... --format=csv,noheader,nounits`.
///
/// Each line looks like:
///   `NVIDIA GeForce RTX 3090 Ti, 24564, 1234, 15`
///
/// Returns a vec of parsed GPU info entries. Lines that cannot be parsed are
/// silently skipped.
pub fn parse_nvidia_smi_output(output: &str) -> Vec<GpuInfo> {
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let parts: Vec<&str> = line.splitn(4, ',').collect();
            if parts.len() < 4 {
                return None;
            }
            let name = parts[0].trim().to_string();
            let memory_total_mb = parts[1].trim().parse::<u64>().ok()?;
            let memory_used_mb = parts[2].trim().parse::<u64>().ok()?;
            let utilization_pct = parts[3].trim().parse::<u64>().ok()?;
            Some(GpuInfo {
                name,
                memory_total_mb,
                memory_used_mb,
                utilization_pct,
            })
        })
        .collect()
}

/// Run `nvidia-smi` and return parsed GPU information.
async fn query_nvidia_smi() -> Result<Vec<GpuInfo>, String> {
    let output = tokio::process::Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total,memory.used,utilization.gpu",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run nvidia-smi: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "nvidia-smi exited with code {}: {}",
            output.status.code().unwrap_or(-1),
            stderr.trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let gpus = parse_nvidia_smi_output(&stdout);
    if gpus.is_empty() {
        return Err("nvidia-smi returned no GPU data".to_string());
    }
    Ok(gpus)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `GET /api/system/gpu` — detect local NVIDIA GPUs via nvidia-smi.
async fn get_gpu_info() -> Json<GpuResponse> {
    match query_nvidia_smi().await {
        Ok(gpus) => Json(GpuResponse {
            detected: true,
            gpus,
            error: None,
        }),
        Err(err) => Json(GpuResponse {
            detected: false,
            gpus: Vec::new(),
            error: Some(err),
        }),
    }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/system/gpu", get(get_gpu_info))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_single_gpu() {
        let output = "NVIDIA GeForce RTX 3090 Ti, 24564, 1234, 15\n";
        let gpus = parse_nvidia_smi_output(output);
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].name, "NVIDIA GeForce RTX 3090 Ti");
        assert_eq!(gpus[0].memory_total_mb, 24564);
        assert_eq!(gpus[0].memory_used_mb, 1234);
        assert_eq!(gpus[0].utilization_pct, 15);
    }

    #[test]
    fn test_parse_multiple_gpus() {
        let output = "\
NVIDIA GeForce RTX 4090, 24564, 2048, 35
NVIDIA GeForce RTX 3080, 10240, 512, 10
";
        let gpus = parse_nvidia_smi_output(output);
        assert_eq!(gpus.len(), 2);
        assert_eq!(gpus[0].name, "NVIDIA GeForce RTX 4090");
        assert_eq!(gpus[0].memory_total_mb, 24564);
        assert_eq!(gpus[0].memory_used_mb, 2048);
        assert_eq!(gpus[0].utilization_pct, 35);
        assert_eq!(gpus[1].name, "NVIDIA GeForce RTX 3080");
        assert_eq!(gpus[1].memory_total_mb, 10240);
        assert_eq!(gpus[1].memory_used_mb, 512);
        assert_eq!(gpus[1].utilization_pct, 10);
    }

    #[test]
    fn test_parse_empty_output() {
        let gpus = parse_nvidia_smi_output("");
        assert!(gpus.is_empty());
    }

    #[test]
    fn test_parse_whitespace_only() {
        let gpus = parse_nvidia_smi_output("   \n  \n");
        assert!(gpus.is_empty());
    }

    #[test]
    fn test_parse_malformed_line_skipped() {
        let output = "\
NVIDIA GeForce RTX 3090 Ti, 24564, 1234, 15
this is not valid csv
NVIDIA GeForce RTX 4090, 24564, 2048, 35
";
        let gpus = parse_nvidia_smi_output(output);
        // The malformed line is silently skipped
        assert_eq!(gpus.len(), 2);
        assert_eq!(gpus[0].name, "NVIDIA GeForce RTX 3090 Ti");
        assert_eq!(gpus[1].name, "NVIDIA GeForce RTX 4090");
    }

    #[test]
    fn test_parse_non_numeric_fields() {
        let output = "NVIDIA GPU, abc, 1234, 15\n";
        let gpus = parse_nvidia_smi_output(output);
        assert!(gpus.is_empty(), "Non-numeric memory_total should cause skip");
    }

    #[test]
    fn test_parse_trailing_whitespace() {
        let output = "  NVIDIA GeForce RTX 3090 Ti , 24564 , 1234 , 15  \n";
        let gpus = parse_nvidia_smi_output(output);
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].name, "NVIDIA GeForce RTX 3090 Ti");
        assert_eq!(gpus[0].memory_total_mb, 24564);
    }

    #[test]
    fn test_gpu_response_serialization_detected() {
        let response = GpuResponse {
            detected: true,
            gpus: vec![GpuInfo {
                name: "NVIDIA GeForce RTX 3090 Ti".to_string(),
                memory_total_mb: 24564,
                memory_used_mb: 1234,
                utilization_pct: 15,
            }],
            error: None,
        };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"detected\":true"));
        assert!(json.contains("RTX 3090 Ti"));
        assert!(json.contains("\"memory_total_mb\":24564"));
        // error field should be absent when None (skip_serializing_if)
        assert!(!json.contains("\"error\""));
    }

    #[test]
    fn test_gpu_response_serialization_not_detected() {
        let response = GpuResponse {
            detected: false,
            gpus: Vec::new(),
            error: Some("nvidia-smi not found".to_string()),
        };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"detected\":false"));
        assert!(json.contains("\"gpus\":[]"));
        assert!(json.contains("nvidia-smi not found"));
    }

    #[test]
    fn test_routes_creation() {
        // Verify the routes function compiles and has the correct signature.
        let _router_fn: fn(Arc<AppState>) -> Router = routes;
    }
}
