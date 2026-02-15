use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Supported GPU job types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum JobType {
    Inference,
    Finetune,
    Benchmark,
    Embedding,
}

impl std::fmt::Display for JobType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JobType::Inference => write!(f, "inference"),
            JobType::Finetune => write!(f, "finetune"),
            JobType::Benchmark => write!(f, "benchmark"),
            JobType::Embedding => write!(f, "embedding"),
        }
    }
}

/// Job lifecycle status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

impl std::fmt::Display for JobStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JobStatus::Queued => write!(f, "queued"),
            JobStatus::Running => write!(f, "running"),
            JobStatus::Completed => write!(f, "completed"),
            JobStatus::Failed => write!(f, "failed"),
            JobStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// A GPU job tracked in-memory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuJob {
    pub id: String,
    pub job_type: JobType,
    pub model: String,
    pub status: JobStatus,
    /// Progress from 0.0 to 1.0.
    pub progress: f32,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
    pub config: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Accumulated stdout/stderr log lines.
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub logs: Vec<String>,
    /// Cancellation token — used to signal the background task to abort.
    /// Skipped during serialization (not meaningful over the wire).
    #[serde(skip)]
    pub cancel_token: CancellationToken,
}

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct LaunchJobRequest {
    pub model: String,
    pub job_type: JobType,
    #[serde(default = "default_config")]
    pub config: serde_json::Value,
}

fn default_config() -> serde_json::Value {
    serde_json::json!({})
}

#[derive(Debug, Clone, Serialize)]
pub struct JobListResponse {
    pub jobs: Vec<GpuJob>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobLogsResponse {
    pub id: String,
    pub logs: Vec<String>,
}

/// Enhanced GPU status with temperature (extends system.rs detection).
#[derive(Debug, Clone, Serialize)]
pub struct EnhancedGpuInfo {
    pub name: String,
    pub memory_total_mb: u64,
    pub memory_used_mb: u64,
    pub memory_free_mb: u64,
    pub utilization_pct: u64,
    pub temperature_c: Option<u64>,
    pub power_draw_w: Option<f64>,
    pub power_limit_w: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnhancedGpuStatus {
    pub detected: bool,
    pub gpus: Vec<EnhancedGpuInfo>,
    pub driver_version: Option<String>,
    pub cuda_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// A locally available model.
#[derive(Debug, Clone, Serialize)]
pub struct LocalModel {
    pub name: String,
    pub size: Option<String>,
    pub provider: String,
    pub quantization: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelsResponse {
    pub models: Vec<LocalModel>,
    pub ollama_running: bool,
}

// ---------------------------------------------------------------------------
// nvidia-smi enhanced parser
// ---------------------------------------------------------------------------

/// Parse enhanced nvidia-smi output with temperature, power, driver info.
pub fn parse_enhanced_nvidia_smi(output: &str) -> Vec<EnhancedGpuInfo> {
    // Expected format: name, memory.total, memory.used, memory.free, utilization.gpu, temperature.gpu, power.draw, power.limit
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let parts: Vec<&str> = line.splitn(8, ',').collect();
            if parts.len() < 6 {
                return None;
            }
            let name = parts[0].trim().to_string();
            let memory_total_mb = parts[1].trim().parse::<u64>().ok()?;
            let memory_used_mb = parts[2].trim().parse::<u64>().ok()?;
            let memory_free_mb = parts[3].trim().parse::<u64>().ok()?;
            let utilization_pct = parts[4].trim().parse::<u64>().ok()?;
            let temperature_c = parts[5].trim().parse::<u64>().ok();
            let power_draw_w = parts.get(6).and_then(|s| s.trim().parse::<f64>().ok());
            let power_limit_w = parts.get(7).and_then(|s| s.trim().parse::<f64>().ok());

            Some(EnhancedGpuInfo {
                name,
                memory_total_mb,
                memory_used_mb,
                memory_free_mb,
                utilization_pct,
                temperature_c,
                power_draw_w,
                power_limit_w,
            })
        })
        .collect()
}

/// Parse `nvidia-smi` output for driver and CUDA version.
/// Looks for lines like: `Driver Version: 550.54.14   CUDA Version: 12.4`
pub fn parse_nvidia_smi_versions(output: &str) -> (Option<String>, Option<String>) {
    let mut driver = None;
    let mut cuda = None;
    for line in output.lines() {
        if let Some(idx) = line.find("Driver Version:") {
            let rest = &line[idx + 15..];
            if let Some(ver) = rest.split_whitespace().next() {
                driver = Some(ver.to_string());
            }
        }
        if let Some(idx) = line.find("CUDA Version:") {
            let rest = &line[idx + 13..];
            if let Some(ver) = rest.split_whitespace().next() {
                cuda = Some(ver.to_string());
            }
        }
    }
    (driver, cuda)
}

// ---------------------------------------------------------------------------
// Ollama detection
// ---------------------------------------------------------------------------

/// Check if Ollama is running on its default port and list models.
async fn detect_ollama_models() -> (bool, Vec<LocalModel>) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap_or_default();

    // Check Ollama API tags endpoint
    let resp = match client.get(format!("{}/api/tags", ollama_base_url())).send().await {
        Ok(r) => r,
        Err(_) => return (false, Vec::new()),
    };

    if !resp.status().is_success() {
        return (false, Vec::new());
    }

    let body: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(_) => return (true, Vec::new()),
    };

    let models = body["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let name = m["name"].as_str()?.to_string();
                    let size = m["size"]
                        .as_u64()
                        .map(|bytes| format_bytes(bytes));
                    let quantization = m["details"]["quantization_level"]
                        .as_str()
                        .map(|s| s.to_string());
                    Some(LocalModel {
                        name,
                        size,
                        provider: "ollama".to_string(),
                        quantization,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    (true, models)
}

/// Format bytes to human-readable size.
fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.1} MB", bytes as f64 / 1_048_576.0)
    } else {
        format!("{} B", bytes)
    }
}

// ---------------------------------------------------------------------------
// Background job execution
// ---------------------------------------------------------------------------

/// Base URL for the local Ollama API.
///
/// Reads `OLLAMA_HOST` at runtime (matching the env var Ollama itself uses).
/// Falls back to `http://127.0.0.1:11434` if unset.
fn ollama_base_url() -> String {
    std::env::var("OLLAMA_HOST").unwrap_or_else(|_| "http://127.0.0.1:11434".to_string())
}

/// Build a `reqwest::Client` with a reasonable timeout for ollama interactions.
fn ollama_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))
}

/// Check whether Ollama is reachable by hitting its `/api/tags` endpoint.
/// Returns `Ok(list_of_model_names)` if reachable, `Err` otherwise.
async fn check_ollama_available() -> Result<Vec<String>, String> {
    let client = ollama_client(5)?;
    let resp = client
        .get(format!("{}/api/tags", ollama_base_url()))
        .send()
        .await
        .map_err(|e| {
            format!(
                "Ollama is not running or unreachable at {}: {}. \
                 Please install/start Ollama first (https://ollama.com).",
                ollama_base_url(), e
            )
        })?;

    if !resp.status().is_success() {
        return Err(format!(
            "Ollama returned HTTP {} from /api/tags",
            resp.status()
        ));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse /api/tags response: {}", e))?;

    let names: Vec<String> = body["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    Ok(names)
}

/// Pull a model from the Ollama registry if it is not already present locally.
/// Logs progress into the job's log lines.
async fn ensure_model_pulled(
    job_id: &str,
    model: &str,
    available_models: &[String],
    state: &Arc<AppState>,
) -> Result<(), String> {
    // Ollama model names may include a tag (e.g. "llama3:8b"). A local model
    // "llama3:latest" matches a request for "llama3". We do a prefix-aware check.
    let already_present = available_models.iter().any(|m| {
        m == model
            || m.split(':').next() == Some(model)
            || model.split(':').next().map(|p| m.starts_with(p)).unwrap_or(false)
    });

    if already_present {
        update_job_progress(job_id, 0.05, &format!("Model '{}' is available locally", model), state).await;
        return Ok(());
    }

    update_job_progress(
        job_id,
        0.05,
        &format!("Model '{}' not found locally — pulling from registry...", model),
        state,
    )
    .await;

    let client = ollama_client(600)?; // models can be large; generous timeout
    let resp = client
        .post(format!("{}/api/pull", ollama_base_url()))
        .json(&serde_json::json!({ "name": model, "stream": false }))
        .send()
        .await
        .map_err(|e| format!("Failed to pull model '{}': {}", model, e))?;

    if !resp.status().is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Ollama pull for '{}' returned error: {}",
            model, body_text
        ));
    }

    update_job_progress(
        job_id,
        0.15,
        &format!("Model '{}' pulled successfully", model),
        state,
    )
    .await;

    Ok(())
}

/// Execute a GPU job in the background.
///
/// Flow:
/// 1. Check Ollama is running (`/api/tags`)
/// 2. Pull model if missing (`/api/pull`)
/// 3. Dispatch to the appropriate job runner (inference, benchmark, simulated)
/// 4. Update final status (Completed / Failed / Cancelled)
async fn run_gpu_job(
    job_id: String,
    job_type: JobType,
    model: String,
    config: serde_json::Value,
    cancel_token: CancellationToken,
    state: Arc<AppState>,
) {
    // Mark as running
    {
        let mut jobs = state.gpu_jobs.write().await;
        if let Some(job) = jobs.get_mut(&job_id) {
            job.status = JobStatus::Running;
            job.started_at = Some(Utc::now());
            job.logs.push(format!(
                "[{}] Starting {} job with model '{}'",
                Utc::now().format("%H:%M:%S"),
                job_type,
                model
            ));
        }
    }

    // Check for early cancellation
    if cancel_token.is_cancelled() {
        finalize_job(&job_id, Err("Job cancelled before start".to_string()), &state).await;
        return;
    }

    // --- Step 1: verify Ollama is running ---
    let available_models = match check_ollama_available().await {
        Ok(models) => {
            update_job_progress(
                &job_id,
                0.02,
                &format!("Ollama is running ({} models available)", models.len()),
                &state,
            )
            .await;
            models
        }
        Err(err) => {
            // For simulated jobs (finetune/embedding) we can proceed without Ollama
            if matches!(job_type, JobType::Finetune | JobType::Embedding) {
                update_job_progress(
                    &job_id,
                    0.02,
                    &format!("Ollama not available ({}); running in simulated mode", err),
                    &state,
                )
                .await;
                Vec::new()
            } else {
                finalize_job(&job_id, Err(err), &state).await;
                return;
            }
        }
    };

    // --- Step 2: pull model if needed ---
    if !available_models.is_empty() || matches!(job_type, JobType::Inference | JobType::Benchmark) {
        if let Err(err) = ensure_model_pulled(&job_id, &model, &available_models, &state).await {
            finalize_job(&job_id, Err(err), &state).await;
            return;
        }
    }

    if cancel_token.is_cancelled() {
        finalize_job(&job_id, Err("Job cancelled during setup".to_string()), &state).await;
        return;
    }

    // Determine steps based on job type
    let total_steps: u32 = match job_type {
        JobType::Inference => 10,
        JobType::Finetune => 50,
        JobType::Benchmark => 20,
        JobType::Embedding => 15,
    };

    // --- Step 3: dispatch to the appropriate runner ---
    let result = match job_type {
        JobType::Inference => {
            run_inference_job(&job_id, &model, &config, total_steps, &cancel_token, &state).await
        }
        JobType::Benchmark => {
            run_benchmark_job(&job_id, &model, total_steps, &cancel_token, &state).await
        }
        _ => {
            // Finetune / Embedding: simulated progress
            run_simulated_job(&job_id, &job_type, total_steps, &cancel_token, &state).await
        }
    };

    // --- Step 4: finalize ---
    finalize_job(&job_id, result, &state).await;
}

/// Write the final status of a job (Completed / Failed).
/// Does nothing if the job was already cancelled.
async fn finalize_job(
    job_id: &str,
    result: Result<serde_json::Value, String>,
    state: &Arc<AppState>,
) {
    let mut jobs = state.gpu_jobs.write().await;
    if let Some(job) = jobs.get_mut(job_id) {
        // Only update if not already cancelled
        if job.status == JobStatus::Running {
            match result {
                Ok(res) => {
                    job.status = JobStatus::Completed;
                    job.progress = 1.0;
                    job.result = Some(res);
                    job.completed_at = Some(Utc::now());
                    job.logs.push(format!(
                        "[{}] Job completed successfully",
                        Utc::now().format("%H:%M:%S")
                    ));
                }
                Err(err) => {
                    job.status = JobStatus::Failed;
                    job.error = Some(err.clone());
                    job.completed_at = Some(Utc::now());
                    job.logs.push(format!(
                        "[{}] Job failed: {}",
                        Utc::now().format("%H:%M:%S"),
                        err
                    ));
                }
            }
        }
    }
}

/// Run an inference job by calling Ollama's generate or chat API.
///
/// If `config.messages` is present (array of `{role, content}` objects), uses
/// the `/api/chat` endpoint.  Otherwise falls back to `/api/generate` with
/// `config.prompt` (or a default prompt).
async fn run_inference_job(
    job_id: &str,
    model: &str,
    config: &serde_json::Value,
    total_steps: u32,
    cancel_token: &CancellationToken,
    state: &Arc<AppState>,
) -> Result<serde_json::Value, String> {
    let use_chat = config.get("messages").and_then(|v| v.as_array()).is_some();

    update_job_progress(
        job_id,
        0.2,
        &format!(
            "Sending request to Ollama ({})...",
            if use_chat { "/api/chat" } else { "/api/generate" }
        ),
        state,
    )
    .await;

    let client = ollama_client(300)?; // inference can take a while for large models

    let (url, body) = if use_chat {
        let messages = config["messages"].clone();
        (
            format!("{}/api/chat", ollama_base_url()),
            serde_json::json!({
                "model": model,
                "messages": messages,
                "stream": false,
            }),
        )
    } else {
        let prompt = config["prompt"]
            .as_str()
            .unwrap_or("Hello, who are you?")
            .to_string();
        (
            format!("{}/api/generate", ollama_base_url()),
            serde_json::json!({
                "model": model,
                "prompt": prompt,
                "stream": false,
            }),
        )
    };

    update_job_progress(job_id, 0.3, "Waiting for model response...", state).await;

    // Race the HTTP request against cancellation
    let resp = tokio::select! {
        r = client.post(&url).json(&body).send() => {
            r.map_err(|e| format!("Ollama request failed: {}. Is Ollama running?", e))?
        }
        _ = cancel_token.cancelled() => {
            return Err("Job cancelled by user".to_string());
        }
    };

    update_job_progress(job_id, 0.8, "Processing response...", state).await;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama returned HTTP {}: {}", status, body_text));
    }

    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    // Final progress ticks
    for step in 0..total_steps {
        if cancel_token.is_cancelled() {
            return Err("Job cancelled by user".to_string());
        }
        let progress = 0.8 + (step as f32 / total_steps as f32) * 0.2;
        update_job_progress(job_id, progress.min(0.99), "Finalizing...", state).await;
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    // Build result depending on which API we called
    if use_chat {
        Ok(serde_json::json!({
            "message": result["message"],
            "model": model,
            "total_duration_ns": result["total_duration"],
            "eval_count": result["eval_count"],
        }))
    } else {
        Ok(serde_json::json!({
            "response": result["response"],
            "model": model,
            "total_duration_ns": result["total_duration"],
            "eval_count": result["eval_count"],
        }))
    }
}

/// Run a benchmark job -- times a short inference request.
async fn run_benchmark_job(
    job_id: &str,
    model: &str,
    total_steps: u32,
    cancel_token: &CancellationToken,
    state: &Arc<AppState>,
) -> Result<serde_json::Value, String> {
    let prompts = vec![
        "Write a short poem about AI.",
        "Explain quantum computing in one sentence.",
        "What is the meaning of life?",
    ];
    let mut results = Vec::new();
    let client = ollama_client(60)?;

    for (i, prompt) in prompts.iter().enumerate() {
        if cancel_token.is_cancelled() {
            return Err("Job cancelled by user".to_string());
        }

        let progress = i as f32 / prompts.len() as f32;
        update_job_progress(
            job_id,
            progress,
            &format!("Benchmark {}/{}: running...", i + 1, prompts.len()),
            state,
        )
        .await;

        let start = std::time::Instant::now();

        let body = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false
        });

        let resp = tokio::select! {
            r = client.post(format!("{}/api/generate", ollama_base_url())).json(&body).send() => {
                r.map_err(|e| format!("Ollama request failed: {}. Is Ollama running?", e))?
            }
            _ = cancel_token.cancelled() => {
                return Err("Job cancelled by user".to_string());
            }
        };

        let elapsed_ms = start.elapsed().as_millis();

        if resp.status().is_success() {
            let resp_body: serde_json::Value =
                resp.json().await.unwrap_or(serde_json::json!({}));
            let eval_count = resp_body["eval_count"].as_u64().unwrap_or(0);
            let tokens_per_sec = if elapsed_ms > 0 {
                eval_count as f64 / (elapsed_ms as f64 / 1000.0)
            } else {
                0.0
            };
            results.push(serde_json::json!({
                "prompt": prompt,
                "elapsed_ms": elapsed_ms,
                "eval_count": eval_count,
                "tokens_per_sec": tokens_per_sec,
            }));
        } else {
            results.push(serde_json::json!({
                "prompt": prompt,
                "elapsed_ms": elapsed_ms,
                "error": format!("HTTP {}", resp.status()),
            }));
        }
    }

    // Final progress simulation
    for step in 0..total_steps {
        if cancel_token.is_cancelled() {
            return Err("Job cancelled by user".to_string());
        }
        let progress = 0.9 + (step as f32 / total_steps as f32) * 0.1;
        update_job_progress(job_id, progress.min(0.99), "Computing statistics...", state).await;
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    }

    // Compute averages
    let total_ms: u128 = results
        .iter()
        .filter_map(|r| r["elapsed_ms"].as_u64().map(|v| v as u128))
        .sum();
    let avg_ms = if !results.is_empty() {
        total_ms / results.len() as u128
    } else {
        0
    };

    Ok(serde_json::json!({
        "model": model,
        "benchmarks": results,
        "average_ms": avg_ms,
        "runs": results.len(),
    }))
}

/// Run a simulated job with progress ticks (finetune, embedding).
async fn run_simulated_job(
    job_id: &str,
    job_type: &JobType,
    total_steps: u32,
    cancel_token: &CancellationToken,
    state: &Arc<AppState>,
) -> Result<serde_json::Value, String> {
    for step in 0..total_steps {
        if cancel_token.is_cancelled() {
            return Err("Job cancelled by user".to_string());
        }

        let progress = (step + 1) as f32 / total_steps as f32;
        let msg = format!(
            "Step {}/{} -- {} in progress...",
            step + 1,
            total_steps,
            job_type
        );
        update_job_progress(job_id, progress.min(0.99), &msg, state).await;

        // Sleep to simulate work, but respect cancellation
        tokio::select! {
            _ = tokio::time::sleep(std::time::Duration::from_millis(200)) => {}
            _ = cancel_token.cancelled() => {
                return Err("Job cancelled by user".to_string());
            }
        }
    }

    Ok(serde_json::json!({
        "message": format!("{} job completed (simulated)", job_type),
        "steps": total_steps,
    }))
}

/// Helper to update progress and append a log line.
async fn update_job_progress(
    job_id: &str,
    progress: f32,
    message: &str,
    state: &Arc<AppState>,
) {
    let mut jobs = state.gpu_jobs.write().await;
    if let Some(job) = jobs.get_mut(job_id) {
        job.progress = progress;
        job.logs.push(format!(
            "[{}] ({:.0}%) {}",
            Utc::now().format("%H:%M:%S"),
            progress * 100.0,
            message
        ));
    }
}

// ---------------------------------------------------------------------------
// Handlers — Job Management
// ---------------------------------------------------------------------------

/// `GET /api/gpu/jobs` — list all GPU jobs.
async fn list_jobs(State(state): State<Arc<AppState>>) -> Json<JobListResponse> {
    let jobs = state.gpu_jobs.read().await;
    let mut job_list: Vec<GpuJob> = jobs.values().cloned().collect();
    // Most recent first
    job_list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    let total = job_list.len();
    Json(JobListResponse {
        jobs: job_list,
        total,
    })
}

/// `POST /api/gpu/jobs` — launch a new GPU job.
async fn launch_job(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LaunchJobRequest>,
) -> Result<(StatusCode, Json<GpuJob>), (StatusCode, Json<serde_json::Value>)> {
    // Validate model name is non-empty
    if req.model.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "model name is required" })),
        ));
    }

    let job_id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now();

    let cancel_token = CancellationToken::new();

    let job = GpuJob {
        id: job_id.clone(),
        job_type: req.job_type.clone(),
        model: req.model.clone(),
        status: JobStatus::Queued,
        progress: 0.0,
        created_at: now,
        started_at: None,
        completed_at: None,
        config: req.config.clone(),
        result: None,
        error: None,
        logs: vec![format!(
            "[{}] Job queued: {} with model '{}'",
            now.format("%H:%M:%S"),
            req.job_type,
            req.model
        )],
        cancel_token: cancel_token.clone(),
    };

    // Store the job
    {
        let mut jobs = state.gpu_jobs.write().await;
        jobs.insert(job_id.clone(), job.clone());
    }

    // Spawn background task
    let bg_state = state.clone();
    let bg_job_type = req.job_type.clone();
    let bg_model = req.model.clone();
    let bg_config = req.config.clone();
    let bg_id = job_id.clone();
    let bg_token = cancel_token;
    tokio::spawn(async move {
        run_gpu_job(bg_id, bg_job_type, bg_model, bg_config, bg_token, bg_state).await;
    });

    Ok((StatusCode::CREATED, Json(job)))
}

/// `GET /api/gpu/jobs/:id` — get job details.
async fn get_job(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<GpuJob>, StatusCode> {
    let jobs = state.gpu_jobs.read().await;
    jobs.get(&id).cloned().map(Json).ok_or(StatusCode::NOT_FOUND)
}

/// `DELETE /api/gpu/jobs/:id` — cancel a running or queued job.
async fn cancel_job(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<GpuJob>, (StatusCode, Json<serde_json::Value>)> {
    let mut jobs = state.gpu_jobs.write().await;
    let job = jobs.get_mut(&id).ok_or((
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({ "error": "job not found" })),
    ))?;

    match job.status {
        JobStatus::Queued | JobStatus::Running => {
            // Signal the background task to stop via the CancellationToken
            job.cancel_token.cancel();
            job.status = JobStatus::Cancelled;
            job.completed_at = Some(Utc::now());
            job.logs.push(format!(
                "[{}] Job cancelled by user",
                Utc::now().format("%H:%M:%S")
            ));
            Ok(Json(job.clone()))
        }
        _ => Err((
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "error": format!("Cannot cancel job with status '{}'", job.status)
            })),
        )),
    }
}

/// `GET /api/gpu/jobs/:id/logs` — get job logs.
async fn get_job_logs(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<JobLogsResponse>, StatusCode> {
    let jobs = state.gpu_jobs.read().await;
    let job = jobs.get(&id).ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(JobLogsResponse {
        id: id.clone(),
        logs: job.logs.clone(),
    }))
}

// ---------------------------------------------------------------------------
// Handlers — GPU Resources
// ---------------------------------------------------------------------------

/// `GET /api/gpu/status` — enhanced GPU status with temperature, power.
async fn get_gpu_status() -> Json<EnhancedGpuStatus> {
    // First get the simple header output for driver/CUDA version
    let versions = match tokio::process::Command::new("nvidia-smi")
        .output()
        .await
    {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            parse_nvidia_smi_versions(&stdout)
        }
        Err(_) => (None, None),
    };

    // Then get detailed per-GPU data
    let output = tokio::process::Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,power.draw,power.limit",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let gpus = parse_enhanced_nvidia_smi(&stdout);
            Json(EnhancedGpuStatus {
                detected: !gpus.is_empty(),
                gpus,
                driver_version: versions.0,
                cuda_version: versions.1,
                error: None,
            })
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            Json(EnhancedGpuStatus {
                detected: false,
                gpus: Vec::new(),
                driver_version: None,
                cuda_version: None,
                error: Some(format!("nvidia-smi failed: {}", stderr.trim())),
            })
        }
        Err(e) => Json(EnhancedGpuStatus {
            detected: false,
            gpus: Vec::new(),
            driver_version: None,
            cuda_version: None,
            error: Some(format!("Failed to run nvidia-smi: {}", e)),
        }),
    }
}

/// `GET /api/gpu/models` — list available local models.
async fn get_models() -> Json<ModelsResponse> {
    let (ollama_running, ollama_models) = detect_ollama_models().await;

    // Future: also scan for lm-studio, llama.cpp models, etc.
    // For now, Ollama is the primary detection target.
    let mut models = ollama_models;

    // Check for LM Studio on default port 1234
    let lm_studio_running = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .ok()
        .map(|c| async move {
            c.get("http://127.0.0.1:1234/v1/models")
                .send()
                .await
                .ok()
                .filter(|r| r.status().is_success())
        });

    if let Some(fut) = lm_studio_running {
        if let Some(resp) = fut.await {
            if let Ok(body) = resp.json::<serde_json::Value>().await {
                if let Some(arr) = body["data"].as_array() {
                    for m in arr {
                        if let Some(id) = m["id"].as_str() {
                            models.push(LocalModel {
                                name: id.to_string(),
                                size: None,
                                provider: "lm-studio".to_string(),
                                quantization: None,
                            });
                        }
                    }
                }
            }
        }
    }

    Json(ModelsResponse {
        models,
        ollama_running,
    })
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        // Job management
        .route("/api/gpu/jobs", get(list_jobs).post(launch_job))
        .route("/api/gpu/jobs/{id}", get(get_job).delete(cancel_job))
        .route("/api/gpu/jobs/{id}/logs", get(get_job_logs))
        // GPU resources
        .route("/api/gpu/status", get(get_gpu_status))
        .route("/api/gpu/models", get(get_models))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Type serialization ---------------------------------------------------

    #[test]
    fn test_job_type_display() {
        assert_eq!(format!("{}", JobType::Inference), "inference");
        assert_eq!(format!("{}", JobType::Finetune), "finetune");
        assert_eq!(format!("{}", JobType::Benchmark), "benchmark");
        assert_eq!(format!("{}", JobType::Embedding), "embedding");
    }

    #[test]
    fn test_job_status_display() {
        assert_eq!(format!("{}", JobStatus::Queued), "queued");
        assert_eq!(format!("{}", JobStatus::Running), "running");
        assert_eq!(format!("{}", JobStatus::Completed), "completed");
        assert_eq!(format!("{}", JobStatus::Failed), "failed");
        assert_eq!(format!("{}", JobStatus::Cancelled), "cancelled");
    }

    #[test]
    fn test_job_type_serialization() {
        let json = serde_json::to_string(&JobType::Inference).unwrap();
        assert_eq!(json, "\"inference\"");

        let json = serde_json::to_string(&JobType::Finetune).unwrap();
        assert_eq!(json, "\"finetune\"");

        let json = serde_json::to_string(&JobType::Benchmark).unwrap();
        assert_eq!(json, "\"benchmark\"");

        let json = serde_json::to_string(&JobType::Embedding).unwrap();
        assert_eq!(json, "\"embedding\"");
    }

    #[test]
    fn test_job_type_deserialization() {
        let t: JobType = serde_json::from_str("\"inference\"").unwrap();
        assert_eq!(t, JobType::Inference);

        let t: JobType = serde_json::from_str("\"finetune\"").unwrap();
        assert_eq!(t, JobType::Finetune);

        let t: JobType = serde_json::from_str("\"benchmark\"").unwrap();
        assert_eq!(t, JobType::Benchmark);

        let t: JobType = serde_json::from_str("\"embedding\"").unwrap();
        assert_eq!(t, JobType::Embedding);
    }

    #[test]
    fn test_job_status_serialization() {
        let json = serde_json::to_string(&JobStatus::Queued).unwrap();
        assert_eq!(json, "\"queued\"");

        let json = serde_json::to_string(&JobStatus::Running).unwrap();
        assert_eq!(json, "\"running\"");

        let json = serde_json::to_string(&JobStatus::Completed).unwrap();
        assert_eq!(json, "\"completed\"");

        let json = serde_json::to_string(&JobStatus::Failed).unwrap();
        assert_eq!(json, "\"failed\"");

        let json = serde_json::to_string(&JobStatus::Cancelled).unwrap();
        assert_eq!(json, "\"cancelled\"");
    }

    // -- GpuJob serialization -------------------------------------------------

    #[test]
    fn test_gpu_job_serialization_minimal() {
        let job = GpuJob {
            id: "abc-123".to_string(),
            job_type: JobType::Inference,
            model: "llama3".to_string(),
            status: JobStatus::Queued,
            progress: 0.0,
            created_at: DateTime::parse_from_rfc3339("2026-02-14T10:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            started_at: None,
            completed_at: None,
            config: serde_json::json!({}),
            result: None,
            error: None,
            logs: Vec::new(),
            cancel_token: CancellationToken::new(),
        };

        let json = serde_json::to_string(&job).unwrap();
        assert!(json.contains("\"id\":\"abc-123\""));
        assert!(json.contains("\"job_type\":\"inference\""));
        assert!(json.contains("\"model\":\"llama3\""));
        assert!(json.contains("\"status\":\"queued\""));
        assert!(json.contains("\"progress\":0.0"));
        // Optional None fields should be absent
        assert!(!json.contains("\"started_at\""));
        assert!(!json.contains("\"completed_at\""));
        assert!(!json.contains("\"result\""));
        assert!(!json.contains("\"error\""));
        assert!(!json.contains("\"logs\""));
        // cancel_token is #[serde(skip)] so must not appear
        assert!(!json.contains("\"cancel_token\""));
    }

    #[test]
    fn test_gpu_job_serialization_full() {
        let now = Utc::now();
        let job = GpuJob {
            id: "xyz-789".to_string(),
            job_type: JobType::Benchmark,
            model: "mistral:7b".to_string(),
            status: JobStatus::Completed,
            progress: 1.0,
            created_at: now,
            started_at: Some(now),
            completed_at: Some(now),
            config: serde_json::json!({ "iterations": 3 }),
            result: Some(serde_json::json!({ "avg_ms": 250 })),
            error: None,
            logs: vec!["step 1".to_string(), "step 2".to_string()],
            cancel_token: CancellationToken::new(),
        };

        let json = serde_json::to_string_pretty(&job).unwrap();
        assert!(json.contains("\"id\": \"xyz-789\""));
        assert!(json.contains("\"job_type\": \"benchmark\""));
        assert!(json.contains("\"status\": \"completed\""));
        assert!(json.contains("\"started_at\""));
        assert!(json.contains("\"completed_at\""));
        assert!(json.contains("\"iterations\": 3"));
        assert!(json.contains("\"avg_ms\": 250"));
        assert!(json.contains("step 1"));
        assert!(json.contains("step 2"));
    }

    #[test]
    fn test_gpu_job_deserialization() {
        let json = r#"{
            "id": "test-1",
            "job_type": "embedding",
            "model": "nomic-embed",
            "status": "running",
            "progress": 0.5,
            "created_at": "2026-02-14T10:00:00Z",
            "started_at": "2026-02-14T10:00:01Z",
            "config": {"batch_size": 32},
            "logs": ["started"]
        }"#;

        let job: GpuJob = serde_json::from_str(json).unwrap();
        assert_eq!(job.id, "test-1");
        assert_eq!(job.job_type, JobType::Embedding);
        assert_eq!(job.model, "nomic-embed");
        assert_eq!(job.status, JobStatus::Running);
        assert!((job.progress - 0.5).abs() < f32::EPSILON);
        assert!(job.started_at.is_some());
        assert_eq!(job.config["batch_size"], 32);
        assert_eq!(job.logs.len(), 1);
        // cancel_token defaults to a fresh (non-cancelled) token via #[serde(skip)]
        assert!(!job.cancel_token.is_cancelled());
    }

    // -- CancellationToken integration ----------------------------------------

    #[test]
    fn test_cancel_token_is_skipped_in_serialization() {
        let token = CancellationToken::new();
        token.cancel();
        let job = GpuJob {
            id: "ct-1".to_string(),
            job_type: JobType::Inference,
            model: "test".to_string(),
            status: JobStatus::Running,
            progress: 0.5,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            config: serde_json::json!({}),
            result: None,
            error: None,
            logs: Vec::new(),
            cancel_token: token,
        };
        let json = serde_json::to_string(&job).unwrap();
        assert!(!json.contains("cancel_token"));
    }

    #[test]
    fn test_cancel_token_clone_shares_state() {
        let token = CancellationToken::new();
        let cloned = token.clone();
        assert!(!cloned.is_cancelled());
        token.cancel();
        assert!(cloned.is_cancelled());
    }

    // -- ollama_client helper -------------------------------------------------

    #[test]
    fn test_ollama_client_creation() {
        let client = ollama_client(10);
        assert!(client.is_ok());
    }

    // -- LaunchJobRequest deserialization --------------------------------------

    #[test]
    fn test_launch_request_deserialization() {
        let json = r#"{"model": "llama3:8b", "job_type": "inference", "config": {"prompt": "Hello"}}"#;
        let req: LaunchJobRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.model, "llama3:8b");
        assert_eq!(req.job_type, JobType::Inference);
        assert_eq!(req.config["prompt"], "Hello");
    }

    #[test]
    fn test_launch_request_default_config() {
        let json = r#"{"model": "llama3", "job_type": "benchmark"}"#;
        let req: LaunchJobRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.model, "llama3");
        assert_eq!(req.job_type, JobType::Benchmark);
        assert_eq!(req.config, serde_json::json!({}));
    }

    // -- Enhanced GPU parsing -------------------------------------------------

    #[test]
    fn test_parse_enhanced_nvidia_smi_full() {
        let output =
            "NVIDIA GeForce RTX 4090, 24564, 2048, 22516, 35, 52, 120.5, 350.0\n";
        let gpus = parse_enhanced_nvidia_smi(output);
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].name, "NVIDIA GeForce RTX 4090");
        assert_eq!(gpus[0].memory_total_mb, 24564);
        assert_eq!(gpus[0].memory_used_mb, 2048);
        assert_eq!(gpus[0].memory_free_mb, 22516);
        assert_eq!(gpus[0].utilization_pct, 35);
        assert_eq!(gpus[0].temperature_c, Some(52));
        assert!((gpus[0].power_draw_w.unwrap() - 120.5).abs() < 0.01);
        assert!((gpus[0].power_limit_w.unwrap() - 350.0).abs() < 0.01);
    }

    #[test]
    fn test_parse_enhanced_nvidia_smi_minimal() {
        // Only 6 fields (no power data)
        let output = "RTX 3080, 10240, 512, 9728, 10, 45\n";
        let gpus = parse_enhanced_nvidia_smi(output);
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].name, "RTX 3080");
        assert_eq!(gpus[0].memory_free_mb, 9728);
        assert_eq!(gpus[0].temperature_c, Some(45));
        assert!(gpus[0].power_draw_w.is_none());
        assert!(gpus[0].power_limit_w.is_none());
    }

    #[test]
    fn test_parse_enhanced_nvidia_smi_multiple() {
        let output = "\
NVIDIA GeForce RTX 4090, 24564, 2048, 22516, 35, 52, 120.5, 350.0
NVIDIA GeForce RTX 3080, 10240, 512, 9728, 10, 40, 80.0, 320.0
";
        let gpus = parse_enhanced_nvidia_smi(output);
        assert_eq!(gpus.len(), 2);
        assert_eq!(gpus[0].name, "NVIDIA GeForce RTX 4090");
        assert_eq!(gpus[1].name, "NVIDIA GeForce RTX 3080");
    }

    #[test]
    fn test_parse_enhanced_nvidia_smi_empty() {
        let gpus = parse_enhanced_nvidia_smi("");
        assert!(gpus.is_empty());

        let gpus = parse_enhanced_nvidia_smi("   \n  \n");
        assert!(gpus.is_empty());
    }

    #[test]
    fn test_parse_enhanced_nvidia_smi_malformed() {
        let output = "not,enough,fields\n";
        let gpus = parse_enhanced_nvidia_smi(output);
        assert!(gpus.is_empty());
    }

    // -- Version parsing ------------------------------------------------------

    #[test]
    fn test_parse_nvidia_smi_versions() {
        let output = "\
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 550.54.14       Driver Version: 550.54.14   CUDA Version: 12.4  |
+-----------------------------------------------------------------------------+
";
        let (driver, cuda) = parse_nvidia_smi_versions(output);
        assert_eq!(driver, Some("550.54.14".to_string()));
        assert_eq!(cuda, Some("12.4".to_string()));
    }

    #[test]
    fn test_parse_nvidia_smi_versions_missing() {
        let (driver, cuda) = parse_nvidia_smi_versions("No relevant info here");
        assert!(driver.is_none());
        assert!(cuda.is_none());
    }

    #[test]
    fn test_parse_nvidia_smi_versions_partial() {
        let output = "Driver Version: 535.129.03";
        let (driver, cuda) = parse_nvidia_smi_versions(output);
        assert_eq!(driver, Some("535.129.03".to_string()));
        assert!(cuda.is_none());
    }

    // -- EnhancedGpuStatus serialization --------------------------------------

    #[test]
    fn test_enhanced_gpu_status_serialization() {
        let status = EnhancedGpuStatus {
            detected: true,
            gpus: vec![EnhancedGpuInfo {
                name: "RTX 4090".to_string(),
                memory_total_mb: 24564,
                memory_used_mb: 2048,
                memory_free_mb: 22516,
                utilization_pct: 35,
                temperature_c: Some(52),
                power_draw_w: Some(120.5),
                power_limit_w: Some(350.0),
            }],
            driver_version: Some("550.54.14".to_string()),
            cuda_version: Some("12.4".to_string()),
            error: None,
        };

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"detected\":true"));
        assert!(json.contains("RTX 4090"));
        assert!(json.contains("\"memory_free_mb\":22516"));
        assert!(json.contains("\"temperature_c\":52"));
        assert!(json.contains("\"driver_version\":\"550.54.14\""));
        assert!(json.contains("\"cuda_version\":\"12.4\""));
        // Error should not appear when None
        assert!(!json.contains("\"error\""));
    }

    #[test]
    fn test_enhanced_gpu_status_not_detected() {
        let status = EnhancedGpuStatus {
            detected: false,
            gpus: Vec::new(),
            driver_version: None,
            cuda_version: None,
            error: Some("nvidia-smi not found".to_string()),
        };

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"detected\":false"));
        assert!(json.contains("\"gpus\":[]"));
        assert!(json.contains("nvidia-smi not found"));
    }

    // -- ModelsResponse -------------------------------------------------------

    #[test]
    fn test_models_response_serialization() {
        let resp = ModelsResponse {
            models: vec![
                LocalModel {
                    name: "llama3:8b".to_string(),
                    size: Some("4.7 GB".to_string()),
                    provider: "ollama".to_string(),
                    quantization: Some("Q4_K_M".to_string()),
                },
                LocalModel {
                    name: "mistral-7b".to_string(),
                    size: None,
                    provider: "lm-studio".to_string(),
                    quantization: None,
                },
            ],
            ollama_running: true,
        };

        let json = serde_json::to_string_pretty(&resp).unwrap();
        assert!(json.contains("\"ollama_running\": true"));
        assert!(json.contains("llama3:8b"));
        assert!(json.contains("4.7 GB"));
        assert!(json.contains("\"provider\": \"ollama\""));
        assert!(json.contains("Q4_K_M"));
        assert!(json.contains("mistral-7b"));
        assert!(json.contains("\"provider\": \"lm-studio\""));
    }

    // -- JobListResponse ------------------------------------------------------

    #[test]
    fn test_job_list_response_serialization() {
        let resp = JobListResponse {
            jobs: vec![],
            total: 0,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"jobs\":[]"));
        assert!(json.contains("\"total\":0"));
    }

    // -- JobLogsResponse ------------------------------------------------------

    #[test]
    fn test_job_logs_response_serialization() {
        let resp = JobLogsResponse {
            id: "test-1".to_string(),
            logs: vec!["line 1".to_string(), "line 2".to_string()],
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"id\":\"test-1\""));
        assert!(json.contains("line 1"));
        assert!(json.contains("line 2"));
    }

    // -- format_bytes ---------------------------------------------------------

    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(500), "500 B");
        assert_eq!(format_bytes(1_048_576), "1.0 MB");
        assert_eq!(format_bytes(5_242_880), "5.0 MB");
        assert_eq!(format_bytes(1_073_741_824), "1.0 GB");
        assert_eq!(format_bytes(4_831_838_208), "4.5 GB");
    }

    // -- Routes creation ------------------------------------------------------

    #[test]
    fn test_routes_creation() {
        let _router_fn: fn(Arc<AppState>) -> Router = routes;
    }
}
