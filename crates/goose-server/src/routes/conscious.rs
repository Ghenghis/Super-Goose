use crate::routes::errors::ErrorResponse;
use crate::state::AppState;
use axum::{
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
    routing::{get, post},
    Json, Router,
};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use utoipa::ToSchema;

// ===========================================================================
// Voice System Types
// ===========================================================================

/// Status of the voice processing system.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VoiceStatus {
    /// Whether the voice system is enabled and available.
    pub enabled: bool,
    /// Currently loaded STT/TTS model identifier.
    pub model: String,
    /// Audio sample rate in Hz.
    pub sample_rate: u32,
    /// Whether a voice session is currently active.
    pub session_active: bool,
    /// Active session ID, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    /// Supported audio formats for input.
    pub supported_formats: Vec<String>,
}

/// Request body for starting a voice session.
#[derive(Deserialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StartVoiceRequest {
    /// Preferred audio format (e.g. "pcm16", "opus", "wav").
    #[serde(default = "default_audio_format")]
    pub format: String,
    /// Preferred sample rate in Hz.
    #[serde(default = "default_sample_rate")]
    pub sample_rate: u32,
    /// Language hint for STT (BCP-47, e.g. "en-US").
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_audio_format() -> String {
    "pcm16".to_string()
}
fn default_sample_rate() -> u32 {
    16000
}
fn default_language() -> String {
    "en-US".to_string()
}

/// Response after starting a voice session.
#[derive(Serialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StartVoiceResponse {
    pub session_id: String,
    pub started: bool,
    pub format: String,
    pub sample_rate: u32,
    pub language: String,
}

/// Response after stopping a voice session.
#[derive(Serialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StopVoiceResponse {
    pub stopped: bool,
    pub session_id: String,
    pub duration_secs: f64,
}

/// Request body for audio transcription.
#[derive(Deserialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeRequest {
    /// Base64-encoded audio data.
    pub audio_data: String,
    /// Audio format of the submitted data.
    #[serde(default = "default_audio_format")]
    pub format: String,
    /// Language hint for transcription.
    #[serde(default = "default_language")]
    pub language: String,
}

/// Transcription result.
#[derive(Serialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeResponse {
    pub text: String,
    pub confidence: f64,
    pub language: String,
    pub duration_secs: f64,
    /// Individual word-level segments with timestamps.
    pub segments: Vec<TranscriptionSegment>,
}

/// A single word/segment within a transcription result.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionSegment {
    pub text: String,
    pub start_secs: f64,
    pub end_secs: f64,
    pub confidence: f64,
}

/// An SSE voice event emitted on the voice stream.
#[derive(Serialize, Clone, Debug, ToSchema)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum VoiceEvent {
    /// Voice activity detected — user started speaking.
    #[serde(rename_all = "camelCase")]
    VoiceActivityStart { timestamp: String },
    /// Voice activity ended — user stopped speaking.
    #[serde(rename_all = "camelCase")]
    VoiceActivityEnd { timestamp: String, duration_secs: f64 },
    /// Partial (interim) transcription while user is speaking.
    #[serde(rename_all = "camelCase")]
    PartialTranscript { text: String, confidence: f64 },
    /// Final transcription for a completed utterance.
    #[serde(rename_all = "camelCase")]
    FinalTranscript {
        text: String,
        confidence: f64,
        duration_secs: f64,
    },
    /// Error in the voice pipeline.
    #[serde(rename_all = "camelCase")]
    #[allow(dead_code)] // Variant reserved for voice error reporting — not yet wired
    VoiceError { message: String, code: Option<String> },
}

// ===========================================================================
// Emotion Detection Types
// ===========================================================================

/// Status of the emotion detection system.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EmotionStatus {
    /// Whether emotion detection is enabled.
    pub enabled: bool,
    /// Detection model name.
    pub model: String,
    /// Which input channels are being analyzed.
    pub channels: Vec<String>,
    /// Current dominant emotion (if detection is running).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_emotion: Option<EmotionReading>,
}

/// A single emotion reading with confidence scores.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EmotionReading {
    /// ISO-8601 timestamp of the reading.
    pub timestamp: String,
    /// Primary detected emotion label.
    pub primary: String,
    /// Confidence for the primary emotion (0.0 .. 1.0).
    pub confidence: f64,
    /// Full emotion score breakdown.
    pub scores: EmotionScores,
    /// Source channel that produced this reading.
    pub source: String,
}

/// Breakdown of emotion confidence scores.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
pub struct EmotionScores {
    pub neutral: f64,
    pub happy: f64,
    pub sad: f64,
    pub angry: f64,
    pub fearful: f64,
    pub surprised: f64,
    pub disgusted: f64,
    pub curious: f64,
}

/// Request body for text-based emotion analysis.
#[derive(Deserialize, Debug, ToSchema)]
pub struct AnalyzeEmotionRequest {
    /// The text content to analyze for emotional signals.
    pub text: String,
    /// Optional context to improve accuracy (e.g. "customer support chat").
    #[serde(default)]
    pub context: Option<String>,
}

/// Response from text-based emotion analysis.
#[derive(Serialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeEmotionResponse {
    pub reading: EmotionReading,
    /// Secondary emotions detected above threshold.
    pub secondary_emotions: Vec<String>,
    /// Suggested response tone.
    pub suggested_tone: String,
}

/// Response for emotion history.
#[derive(Serialize, Debug, ToSchema)]
pub struct EmotionHistoryResponse {
    pub readings: Vec<EmotionReading>,
    pub total: usize,
}

// ===========================================================================
// Consciousness State Types
// ===========================================================================

/// The overall conscious state of the agent.
#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsciousState {
    /// Current attention focus description.
    pub attention_focus: String,
    /// Attention intensity (0.0 = idle .. 1.0 = fully engaged).
    pub attention_level: f64,
    /// Current emotional context summary.
    pub emotional_context: String,
    /// Context awareness breadth (number of tracked context items).
    pub context_items_tracked: u32,
    /// Whether the agent is actively processing.
    pub active: bool,
    /// Agent self-model confidence (0.0 .. 1.0).
    pub self_model_confidence: f64,
    /// Latest emotion reading snapshot.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_emotion: Option<EmotionReading>,
    /// Voice system summary.
    pub voice_active: bool,
    /// Uptime since last state reset.
    pub uptime: String,
}

/// Request body for setting the attention focus.
#[derive(Deserialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetAttentionRequest {
    /// Description of the new attention focus.
    pub focus: String,
    /// Target attention level (0.0 .. 1.0). Optional; defaults to 0.8.
    #[serde(default = "default_attention_level")]
    pub level: f64,
}

fn default_attention_level() -> f64 {
    0.8
}

/// Response after setting the attention focus.
#[derive(Serialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetAttentionResponse {
    pub updated: bool,
    pub focus: String,
    pub level: f64,
}

// ===========================================================================
// In-Memory State
// ===========================================================================

#[derive(Clone)]
struct ConsciousModuleState {
    voice_status: Arc<Mutex<VoiceStatus>>,
    emotion_status: Arc<Mutex<EmotionStatus>>,
    emotion_history: Arc<Mutex<Vec<EmotionReading>>>,
    conscious_state: Arc<Mutex<ConsciousState>>,
}

impl Default for ConsciousModuleState {
    fn default() -> Self {
        Self {
            voice_status: Arc::new(Mutex::new(default_voice_status())),
            emotion_status: Arc::new(Mutex::new(default_emotion_status())),
            emotion_history: Arc::new(Mutex::new(default_emotion_history())),
            conscious_state: Arc::new(Mutex::new(default_conscious_state())),
        }
    }
}

// ---------------------------------------------------------------------------
// Default data — realistic mock values
// ---------------------------------------------------------------------------

fn default_voice_status() -> VoiceStatus {
    VoiceStatus {
        enabled: true,
        model: "whisper-large-v3".to_string(),
        sample_rate: 16000,
        session_active: false,
        session_id: None,
        supported_formats: vec![
            "pcm16".to_string(),
            "opus".to_string(),
            "wav".to_string(),
            "webm".to_string(),
        ],
    }
}

fn default_emotion_status() -> EmotionStatus {
    EmotionStatus {
        enabled: true,
        model: "emotion-bert-base".to_string(),
        channels: vec!["text".to_string(), "voice-prosody".to_string()],
        current_emotion: Some(EmotionReading {
            timestamp: "2026-02-14T10:30:00Z".to_string(),
            primary: "neutral".to_string(),
            confidence: 0.72,
            scores: EmotionScores {
                neutral: 0.72,
                happy: 0.12,
                sad: 0.02,
                angry: 0.01,
                fearful: 0.01,
                surprised: 0.05,
                disgusted: 0.00,
                curious: 0.07,
            },
            source: "text".to_string(),
        }),
    }
}

fn default_emotion_history() -> Vec<EmotionReading> {
    vec![
        EmotionReading {
            timestamp: "2026-02-14T10:30:00Z".to_string(),
            primary: "neutral".to_string(),
            confidence: 0.72,
            scores: EmotionScores {
                neutral: 0.72,
                happy: 0.12,
                sad: 0.02,
                angry: 0.01,
                fearful: 0.01,
                surprised: 0.05,
                disgusted: 0.00,
                curious: 0.07,
            },
            source: "text".to_string(),
        },
        EmotionReading {
            timestamp: "2026-02-14T10:25:00Z".to_string(),
            primary: "curious".to_string(),
            confidence: 0.65,
            scores: EmotionScores {
                neutral: 0.18,
                happy: 0.08,
                sad: 0.01,
                angry: 0.00,
                fearful: 0.02,
                surprised: 0.06,
                disgusted: 0.00,
                curious: 0.65,
            },
            source: "text".to_string(),
        },
        EmotionReading {
            timestamp: "2026-02-14T10:20:00Z".to_string(),
            primary: "happy".to_string(),
            confidence: 0.58,
            scores: EmotionScores {
                neutral: 0.25,
                happy: 0.58,
                sad: 0.01,
                angry: 0.00,
                fearful: 0.00,
                surprised: 0.10,
                disgusted: 0.00,
                curious: 0.06,
            },
            source: "voice-prosody".to_string(),
        },
        EmotionReading {
            timestamp: "2026-02-14T10:15:00Z".to_string(),
            primary: "surprised".to_string(),
            confidence: 0.61,
            scores: EmotionScores {
                neutral: 0.15,
                happy: 0.10,
                sad: 0.00,
                angry: 0.00,
                fearful: 0.04,
                surprised: 0.61,
                disgusted: 0.00,
                curious: 0.10,
            },
            source: "text".to_string(),
        },
        EmotionReading {
            timestamp: "2026-02-14T10:10:00Z".to_string(),
            primary: "neutral".to_string(),
            confidence: 0.80,
            scores: EmotionScores {
                neutral: 0.80,
                happy: 0.08,
                sad: 0.03,
                angry: 0.01,
                fearful: 0.01,
                surprised: 0.02,
                disgusted: 0.00,
                curious: 0.05,
            },
            source: "text".to_string(),
        },
    ]
}

fn default_conscious_state() -> ConsciousState {
    ConsciousState {
        attention_focus: "general awareness".to_string(),
        attention_level: 0.5,
        emotional_context: "Neutral and attentive. No strong emotional signals detected.".to_string(),
        context_items_tracked: 12,
        active: true,
        self_model_confidence: 0.78,
        current_emotion: Some(EmotionReading {
            timestamp: "2026-02-14T10:30:00Z".to_string(),
            primary: "neutral".to_string(),
            confidence: 0.72,
            scores: EmotionScores {
                neutral: 0.72,
                happy: 0.12,
                sad: 0.02,
                angry: 0.01,
                fearful: 0.01,
                surprised: 0.05,
                disgusted: 0.00,
                curious: 0.07,
            },
            source: "text".to_string(),
        }),
        voice_active: false,
        uptime: "2h 14m".to_string(),
    }
}

// Global state instance
static STATE: Lazy<ConsciousModuleState> = Lazy::new(ConsciousModuleState::default);

// ===========================================================================
// Voice Handlers
// ===========================================================================

/// `GET /api/conscious/voice/status`
///
/// Returns the current voice system status including model, sample rate,
/// and whether a session is active.
#[utoipa::path(
    get,
    path = "/api/conscious/voice/status",
    responses(
        (status = 200, description = "Voice system status", body = VoiceStatus),
        (status = 500, description = "Internal server error")
    ),
    tag = "Conscious"
)]
async fn get_voice_status() -> Result<Json<VoiceStatus>, ErrorResponse> {
    tracing::debug!("GET /api/conscious/voice/status");
    let status = STATE
        .voice_status
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?
        .clone();
    Ok(Json(status))
}

/// `POST /api/conscious/voice/start`
///
/// Start a new voice session. Returns a session ID that can be used to
/// send audio data and receive transcriptions.
#[utoipa::path(
    post,
    path = "/api/conscious/voice/start",
    request_body = StartVoiceRequest,
    responses(
        (status = 200, description = "Voice session started", body = StartVoiceResponse),
        (status = 409, description = "Session already active"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Conscious"
)]
async fn start_voice_session(
    Json(body): Json<StartVoiceRequest>,
) -> Result<Json<StartVoiceResponse>, ErrorResponse> {
    tracing::info!(
        format = %body.format,
        sample_rate = body.sample_rate,
        language = %body.language,
        "POST /api/conscious/voice/start"
    );

    let mut status = STATE
        .voice_status
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    if status.session_active {
        return Err(ErrorResponse::bad_request(
            "A voice session is already active. Stop it before starting a new one.",
        ));
    }

    let session_id = format!("voice-{}", uuid_v4_mock());
    status.session_active = true;
    status.session_id = Some(session_id.clone());

    // Also update conscious state
    if let Ok(mut cs) = STATE.conscious_state.lock() {
        cs.voice_active = true;
    }

    Ok(Json(StartVoiceResponse {
        session_id,
        started: true,
        format: body.format,
        sample_rate: body.sample_rate,
        language: body.language,
    }))
}

/// `POST /api/conscious/voice/stop`
///
/// Stop the currently active voice session.
#[utoipa::path(
    post,
    path = "/api/conscious/voice/stop",
    responses(
        (status = 200, description = "Voice session stopped", body = StopVoiceResponse),
        (status = 404, description = "No active session"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Conscious"
)]
async fn stop_voice_session() -> Result<Json<StopVoiceResponse>, ErrorResponse> {
    tracing::info!("POST /api/conscious/voice/stop");

    let mut status = STATE
        .voice_status
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    if !status.session_active {
        return Err(ErrorResponse::not_found("No active voice session to stop."));
    }

    let session_id = status.session_id.clone().unwrap_or_default();
    status.session_active = false;
    status.session_id = None;

    // Also update conscious state
    if let Ok(mut cs) = STATE.conscious_state.lock() {
        cs.voice_active = false;
    }

    // Mock duration — in production this would be tracked from session start.
    Ok(Json(StopVoiceResponse {
        stopped: true,
        session_id,
        duration_secs: 42.5,
    }))
}

/// `POST /api/conscious/voice/transcribe`
///
/// Accept base64-encoded audio data and return a transcription result.
/// In this mock implementation, we return a realistic placeholder.
#[utoipa::path(
    post,
    path = "/api/conscious/voice/transcribe",
    request_body = TranscribeRequest,
    responses(
        (status = 200, description = "Transcription result", body = TranscribeResponse),
        (status = 400, description = "Invalid audio data"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Conscious"
)]
async fn transcribe_audio(
    Json(body): Json<TranscribeRequest>,
) -> Result<Json<TranscribeResponse>, ErrorResponse> {
    tracing::info!(
        format = %body.format,
        language = %body.language,
        data_len = body.audio_data.len(),
        "POST /api/conscious/voice/transcribe"
    );

    if body.audio_data.is_empty() {
        return Err(ErrorResponse::bad_request("audio_data cannot be empty"));
    }

    // Mock transcription result
    Ok(Json(TranscribeResponse {
        text: "Hello, I would like to start a new coding session for the authentication module."
            .to_string(),
        confidence: 0.94,
        language: body.language,
        duration_secs: 3.2,
        segments: vec![
            TranscriptionSegment {
                text: "Hello".to_string(),
                start_secs: 0.0,
                end_secs: 0.4,
                confidence: 0.98,
            },
            TranscriptionSegment {
                text: "I would like to start".to_string(),
                start_secs: 0.5,
                end_secs: 1.2,
                confidence: 0.95,
            },
            TranscriptionSegment {
                text: "a new coding session".to_string(),
                start_secs: 1.3,
                end_secs: 2.1,
                confidence: 0.93,
            },
            TranscriptionSegment {
                text: "for the authentication module".to_string(),
                start_secs: 2.2,
                end_secs: 3.2,
                confidence: 0.91,
            },
        ],
    }))
}

/// `GET /api/conscious/voice/stream`
///
/// Server-Sent Events stream of voice pipeline events. The client connects
/// once and receives real-time voice activity, partial/final transcripts,
/// and errors.
///
/// In this mock implementation we emit a few sample events then keep the
/// connection alive with heartbeats.
#[utoipa::path(
    get,
    path = "/api/conscious/voice/stream",
    responses(
        (status = 200, description = "SSE voice event stream")
    ),
    tag = "Conscious"
)]
async fn voice_event_stream(
    State(_state): State<Arc<AppState>>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    tracing::info!("GET /api/conscious/voice/stream — client connected");

    // Produce a finite sequence of mock events followed by keep-alive.
    let events = vec![
        VoiceEvent::VoiceActivityStart {
            timestamp: "2026-02-14T10:30:05Z".to_string(),
        },
        VoiceEvent::PartialTranscript {
            text: "Hello I would".to_string(),
            confidence: 0.70,
        },
        VoiceEvent::PartialTranscript {
            text: "Hello I would like to start".to_string(),
            confidence: 0.82,
        },
        VoiceEvent::FinalTranscript {
            text: "Hello, I would like to start a new coding session.".to_string(),
            confidence: 0.94,
            duration_secs: 3.2,
        },
        VoiceEvent::VoiceActivityEnd {
            timestamp: "2026-02-14T10:30:08Z".to_string(),
            duration_secs: 3.2,
        },
    ];

    let stream = tokio_stream::iter(events.into_iter().map(|evt| {
        let data = serde_json::to_string(&evt).unwrap_or_default();
        Ok::<_, Infallible>(Event::default().data(data))
    }));

    Sse::new(stream).keep_alive(KeepAlive::default())
}

// ===========================================================================
// Emotion Detection Handlers
// ===========================================================================

/// `GET /api/conscious/emotion/status`
///
/// Returns the current emotion detection system status.
#[utoipa::path(
    get,
    path = "/api/conscious/emotion/status",
    responses(
        (status = 200, description = "Emotion detection status", body = EmotionStatus),
        (status = 500, description = "Internal server error")
    ),
    tag = "Conscious"
)]
async fn get_emotion_status() -> Result<Json<EmotionStatus>, ErrorResponse> {
    tracing::debug!("GET /api/conscious/emotion/status");
    let status = STATE
        .emotion_status
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?
        .clone();
    Ok(Json(status))
}

/// `POST /api/conscious/emotion/analyze`
///
/// Analyze text content for emotional signals. Returns a full emotion
/// reading with scores and a suggested response tone.
#[utoipa::path(
    post,
    path = "/api/conscious/emotion/analyze",
    request_body = AnalyzeEmotionRequest,
    responses(
        (status = 200, description = "Emotion analysis result", body = AnalyzeEmotionResponse),
        (status = 400, description = "Empty text"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Conscious"
)]
async fn analyze_emotion(
    Json(body): Json<AnalyzeEmotionRequest>,
) -> Result<Json<AnalyzeEmotionResponse>, ErrorResponse> {
    tracing::info!(
        text_len = body.text.len(),
        context = ?body.context,
        "POST /api/conscious/emotion/analyze"
    );

    if body.text.is_empty() {
        return Err(ErrorResponse::bad_request("text cannot be empty"));
    }

    // Simple heuristic mock: pick emotion based on keywords.
    let text_lower = body.text.to_lowercase();
    let (primary, confidence, scores, secondary, tone) = if text_lower.contains("frustrated")
        || text_lower.contains("angry")
        || text_lower.contains("annoyed")
    {
        (
            "angry",
            0.73,
            EmotionScores {
                neutral: 0.10,
                happy: 0.02,
                sad: 0.05,
                angry: 0.73,
                fearful: 0.03,
                surprised: 0.01,
                disgusted: 0.04,
                curious: 0.02,
            },
            vec!["sad".to_string(), "disgusted".to_string()],
            "empathetic and calm",
        )
    } else if text_lower.contains("happy")
        || text_lower.contains("great")
        || text_lower.contains("wonderful")
        || text_lower.contains("love")
    {
        (
            "happy",
            0.81,
            EmotionScores {
                neutral: 0.08,
                happy: 0.81,
                sad: 0.00,
                angry: 0.00,
                fearful: 0.00,
                surprised: 0.06,
                disgusted: 0.00,
                curious: 0.05,
            },
            vec!["surprised".to_string()],
            "enthusiastic and supportive",
        )
    } else if text_lower.contains("worried")
        || text_lower.contains("scared")
        || text_lower.contains("afraid")
    {
        (
            "fearful",
            0.68,
            EmotionScores {
                neutral: 0.12,
                happy: 0.01,
                sad: 0.10,
                angry: 0.02,
                fearful: 0.68,
                surprised: 0.03,
                disgusted: 0.00,
                curious: 0.04,
            },
            vec!["sad".to_string()],
            "reassuring and steady",
        )
    } else if text_lower.contains('?')
        || text_lower.contains("how")
        || text_lower.contains("why")
        || text_lower.contains("curious")
    {
        (
            "curious",
            0.66,
            EmotionScores {
                neutral: 0.18,
                happy: 0.06,
                sad: 0.01,
                angry: 0.00,
                fearful: 0.02,
                surprised: 0.07,
                disgusted: 0.00,
                curious: 0.66,
            },
            vec!["surprised".to_string()],
            "informative and engaging",
        )
    } else {
        (
            "neutral",
            0.75,
            EmotionScores {
                neutral: 0.75,
                happy: 0.10,
                sad: 0.02,
                angry: 0.01,
                fearful: 0.01,
                surprised: 0.04,
                disgusted: 0.00,
                curious: 0.07,
            },
            vec![],
            "balanced and clear",
        )
    };

    let reading = EmotionReading {
        timestamp: chrono::Utc::now().to_rfc3339(),
        primary: primary.to_string(),
        confidence,
        scores: scores.clone(),
        source: "text".to_string(),
    };

    // Record in history
    if let Ok(mut history) = STATE.emotion_history.lock() {
        history.insert(0, reading.clone());
    }

    // Update current emotion
    if let Ok(mut es) = STATE.emotion_status.lock() {
        es.current_emotion = Some(reading.clone());
    }
    if let Ok(mut cs) = STATE.conscious_state.lock() {
        cs.current_emotion = Some(reading.clone());
        cs.emotional_context = format!(
            "Detected {} emotion (confidence {:.0}%). Suggested tone: {}.",
            primary,
            confidence * 100.0,
            tone
        );
    }

    Ok(Json(AnalyzeEmotionResponse {
        reading,
        secondary_emotions: secondary,
        suggested_tone: tone.to_string(),
    }))
}

/// `GET /api/conscious/emotion/history`
///
/// Returns the recent emotion reading history.
#[utoipa::path(
    get,
    path = "/api/conscious/emotion/history",
    responses(
        (status = 200, description = "Emotion reading history", body = EmotionHistoryResponse),
        (status = 500, description = "Internal server error")
    ),
    tag = "Conscious"
)]
async fn get_emotion_history() -> Result<Json<EmotionHistoryResponse>, ErrorResponse> {
    tracing::debug!("GET /api/conscious/emotion/history");
    let readings = STATE
        .emotion_history
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?
        .clone();
    let total = readings.len();
    Ok(Json(EmotionHistoryResponse { readings, total }))
}

// ===========================================================================
// Consciousness State Handlers
// ===========================================================================

/// `GET /api/conscious/state`
///
/// Returns the overall conscious state including attention focus,
/// emotional context, and system awareness.
#[utoipa::path(
    get,
    path = "/api/conscious/state",
    responses(
        (status = 200, description = "Conscious state", body = ConsciousState),
        (status = 500, description = "Internal server error")
    ),
    tag = "Conscious"
)]
async fn get_conscious_state() -> Result<Json<ConsciousState>, ErrorResponse> {
    tracing::debug!("GET /api/conscious/state");
    let state = STATE
        .conscious_state
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?
        .clone();
    Ok(Json(state))
}

/// `POST /api/conscious/state/attention`
///
/// Set the agent's attention focus and optional intensity level.
#[utoipa::path(
    post,
    path = "/api/conscious/state/attention",
    request_body = SetAttentionRequest,
    responses(
        (status = 200, description = "Attention focus updated", body = SetAttentionResponse),
        (status = 400, description = "Invalid attention level"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Conscious"
)]
async fn set_attention_focus(
    Json(body): Json<SetAttentionRequest>,
) -> Result<Json<SetAttentionResponse>, ErrorResponse> {
    tracing::info!(
        focus = %body.focus,
        level = body.level,
        "POST /api/conscious/state/attention"
    );

    if body.level < 0.0 || body.level > 1.0 {
        return Err(ErrorResponse::bad_request(format!(
            "Attention level must be between 0.0 and 1.0, got {}",
            body.level
        )));
    }

    let mut state = STATE
        .conscious_state
        .lock()
        .map_err(|e| ErrorResponse::internal(format!("Lock poisoned: {}", e)))?;

    state.attention_focus = body.focus.clone();
    state.attention_level = body.level;

    Ok(Json(SetAttentionResponse {
        updated: true,
        focus: body.focus,
        level: body.level,
    }))
}

// ===========================================================================
// Helpers
// ===========================================================================

/// Simple mock UUID generator (deterministic in tests, random-ish in prod).
fn uuid_v4_mock() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:016x}-{:04x}", ts, ts as u16)
}

// ===========================================================================
// Voice Pipeline Bridge Forwarding
// ===========================================================================

/// Default port for the conscious/voice Python bridge server.
/// Override with the `CONSCIOUS_BRIDGE_PORT` environment variable.
const DEFAULT_BRIDGE_PORT: u16 = 8400;

/// Request body for text-to-speech synthesis via the bridge.
#[derive(Deserialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SynthesizeRequest {
    /// Text to synthesize into speech.
    pub text: String,
    /// Output audio format (e.g. "wav", "mp3", "opus").
    #[serde(default = "default_synth_format")]
    pub format: String,
    /// Speech rate (words per minute). Defaults to 175.
    #[serde(default = "default_speech_rate")]
    pub rate: u32,
    /// Volume level (0.0 to 1.0). Defaults to 0.9.
    #[serde(default = "default_volume")]
    pub volume: f64,
}

fn default_synth_format() -> String {
    "wav".to_string()
}
fn default_speech_rate() -> u32 {
    175
}
fn default_volume() -> f64 {
    0.9
}

/// Response from text-to-speech synthesis.
#[derive(Serialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SynthesizeResponse {
    /// Base64-encoded audio data (if bridge is available), or empty if mock.
    pub audio_data: String,
    /// Audio format of the returned data.
    pub format: String,
    /// Length of the synthesized text.
    pub text_length: usize,
    /// Whether the result came from the live bridge or is a mock.
    pub from_bridge: bool,
    /// Duration estimate in seconds.
    pub duration_secs: f64,
}

/// Request body for the full voice pipeline (STT -> process -> TTS).
#[derive(Deserialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VoicePipelineRequest {
    /// Base64-encoded audio input.
    pub audio_data: String,
    /// Input audio format.
    #[serde(default = "default_audio_format")]
    pub input_format: String,
    /// Language hint for STT.
    #[serde(default = "default_language")]
    pub language: String,
    /// Whether to synthesize a spoken response.
    #[serde(default = "default_synthesize_response")]
    pub synthesize_response: bool,
}

fn default_synthesize_response() -> bool {
    true
}

/// Response from the full voice pipeline.
#[derive(Serialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VoicePipelineResponse {
    /// Transcribed text from the input audio.
    pub transcript: String,
    /// Confidence of the transcription.
    pub transcript_confidence: f64,
    /// Agent's text response to the transcribed input.
    pub response_text: String,
    /// Base64-encoded synthesized audio of the response (if requested).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_audio: Option<String>,
    /// Whether the result came from the live bridge.
    pub from_bridge: bool,
    /// Total pipeline duration in seconds.
    pub pipeline_duration_secs: f64,
}

/// Health status of the bridge server.
#[derive(Serialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct BridgeHealthResponse {
    /// Whether the bridge server is reachable.
    pub reachable: bool,
    /// Bridge server base URL.
    pub bridge_url: String,
    /// Bridge server version (if reachable).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Available bridge capabilities.
    pub capabilities: Vec<String>,
    /// Human-readable status message.
    pub message: String,
}

/// Get the bridge base URL from environment or default.
fn bridge_base_url() -> String {
    let port = std::env::var("CONSCIOUS_BRIDGE_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(DEFAULT_BRIDGE_PORT);
    format!("http://127.0.0.1:{}", port)
}

/// Build an HTTP client for bridge communication with a short timeout.
fn bridge_client(timeout_secs: u64) -> Result<reqwest::Client, ErrorResponse> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| ErrorResponse::internal(format!("Failed to build HTTP client: {}", e)))
}

/// Check if the bridge server is reachable by hitting its health endpoint.
#[allow(dead_code)]
async fn check_bridge_reachable() -> bool {
    let client = match bridge_client(3) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let url = format!("{}/health", bridge_base_url());
    matches!(client.get(&url).send().await, Ok(r) if r.status().is_success())
}

/// Helper: build the "bridge not running" error message with instructions.
fn bridge_not_running_error() -> ErrorResponse {
    let port = std::env::var("CONSCIOUS_BRIDGE_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(DEFAULT_BRIDGE_PORT);
    ErrorResponse::service_unavailable(format!(
        "Voice bridge server is not running on port {}. \
         Start it with: python crates/goose-mcp/src/bridges/voice_bridge_server.py --port {} \
         (or set CONSCIOUS_BRIDGE_PORT env var to a custom port). \
         Install dependencies: pip install pyttsx3 SpeechRecognition",
        port, port
    ))
}

/// `POST /api/conscious/voice/transcribe-bridge`
///
/// Forward audio transcription to the Python voice bridge server.
/// If the bridge is not running, returns a 503 with instructions.
#[utoipa::path(
    post,
    path = "/api/conscious/voice/transcribe-bridge",
    request_body = TranscribeRequest,
    responses(
        (status = 200, description = "Bridge transcription result", body = TranscribeResponse),
        (status = 400, description = "Invalid audio data"),
        (status = 503, description = "Bridge server not running")
    ),
    tag = "Conscious"
)]
async fn transcribe_via_bridge(
    Json(body): Json<TranscribeRequest>,
) -> Result<Json<TranscribeResponse>, ErrorResponse> {
    tracing::info!(
        format = %body.format,
        language = %body.language,
        data_len = body.audio_data.len(),
        "POST /api/conscious/voice/transcribe-bridge"
    );

    if body.audio_data.is_empty() {
        return Err(ErrorResponse::bad_request("audio_data cannot be empty"));
    }

    let client = bridge_client(30)?;
    let url = format!("{}/transcribe", bridge_base_url());

    let bridge_payload = serde_json::json!({
        "audio_data": body.audio_data,
        "format": body.format,
        "language": body.language,
    });

    let resp = client
        .post(&url)
        .json(&bridge_payload)
        .send()
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "Bridge transcribe request failed");
            bridge_not_running_error()
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        tracing::warn!(status = %status, body = %body_text, "Bridge returned error");
        return Err(ErrorResponse::internal(format!(
            "Bridge returned HTTP {}: {}",
            status,
            body_text.chars().take(200).collect::<String>()
        )));
    }

    let bridge_result: serde_json::Value = resp.json().await.map_err(|e| {
        ErrorResponse::internal(format!("Failed to parse bridge response: {}", e))
    })?;

    // Map bridge response to our TranscribeResponse type
    Ok(Json(TranscribeResponse {
        text: bridge_result["transcript"]
            .as_str()
            .or_else(|| bridge_result["text"].as_str())
            .unwrap_or("(no transcript)")
            .to_string(),
        confidence: bridge_result["confidence"]
            .as_f64()
            .unwrap_or(0.0),
        language: bridge_result["language"]
            .as_str()
            .unwrap_or(&body.language)
            .to_string(),
        duration_secs: bridge_result["duration_secs"]
            .as_f64()
            .or_else(|| bridge_result["durationSecs"].as_f64())
            .unwrap_or(0.0),
        segments: bridge_result["segments"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| {
                        Some(TranscriptionSegment {
                            text: s["text"].as_str()?.to_string(),
                            start_secs: s["start_secs"]
                                .as_f64()
                                .or_else(|| s["startSecs"].as_f64())
                                .unwrap_or(0.0),
                            end_secs: s["end_secs"]
                                .as_f64()
                                .or_else(|| s["endSecs"].as_f64())
                                .unwrap_or(0.0),
                            confidence: s["confidence"].as_f64().unwrap_or(0.0),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default(),
    }))
}

/// `POST /api/conscious/voice/synthesize`
///
/// Convert text to speech via the Python voice bridge server.
/// If the bridge is not running, returns a 503 with instructions.
#[utoipa::path(
    post,
    path = "/api/conscious/voice/synthesize",
    request_body = SynthesizeRequest,
    responses(
        (status = 200, description = "Synthesized audio", body = SynthesizeResponse),
        (status = 400, description = "Empty text"),
        (status = 503, description = "Bridge server not running")
    ),
    tag = "Conscious"
)]
async fn synthesize_speech(
    Json(body): Json<SynthesizeRequest>,
) -> Result<Json<SynthesizeResponse>, ErrorResponse> {
    tracing::info!(
        text_len = body.text.len(),
        format = %body.format,
        rate = body.rate,
        "POST /api/conscious/voice/synthesize"
    );

    if body.text.is_empty() {
        return Err(ErrorResponse::bad_request("text cannot be empty"));
    }

    let client = bridge_client(30)?;
    let url = format!("{}/synthesize", bridge_base_url());

    let bridge_payload = serde_json::json!({
        "text": body.text,
        "format": body.format,
        "rate": body.rate,
        "volume": body.volume,
    });

    let resp = client
        .post(&url)
        .json(&bridge_payload)
        .send()
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "Bridge synthesize request failed");
            bridge_not_running_error()
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        tracing::warn!(status = %status, body = %body_text, "Bridge synthesize returned error");
        return Err(ErrorResponse::internal(format!(
            "Bridge returned HTTP {}: {}",
            status,
            body_text.chars().take(200).collect::<String>()
        )));
    }

    let bridge_result: serde_json::Value = resp.json().await.map_err(|e| {
        ErrorResponse::internal(format!("Failed to parse bridge response: {}", e))
    })?;

    Ok(Json(SynthesizeResponse {
        audio_data: bridge_result["audio_data"]
            .as_str()
            .or_else(|| bridge_result["audioData"].as_str())
            .unwrap_or("")
            .to_string(),
        format: bridge_result["format"]
            .as_str()
            .unwrap_or(&body.format)
            .to_string(),
        text_length: body.text.len(),
        from_bridge: true,
        duration_secs: bridge_result["duration_secs"]
            .as_f64()
            .or_else(|| bridge_result["durationSecs"].as_f64())
            .unwrap_or(0.0),
    }))
}

/// `POST /api/conscious/voice/pipeline`
///
/// Full voice pipeline: speech-to-text -> agent processing -> text-to-speech.
/// Forwards to the Python bridge for STT/TTS, with agent response generation.
/// If the bridge is not running, returns a 503 with instructions.
#[utoipa::path(
    post,
    path = "/api/conscious/voice/pipeline",
    request_body = VoicePipelineRequest,
    responses(
        (status = 200, description = "Pipeline result", body = VoicePipelineResponse),
        (status = 400, description = "Invalid input"),
        (status = 503, description = "Bridge server not running")
    ),
    tag = "Conscious"
)]
async fn voice_pipeline(
    Json(body): Json<VoicePipelineRequest>,
) -> Result<Json<VoicePipelineResponse>, ErrorResponse> {
    tracing::info!(
        data_len = body.audio_data.len(),
        language = %body.language,
        synthesize = body.synthesize_response,
        "POST /api/conscious/voice/pipeline"
    );

    if body.audio_data.is_empty() {
        return Err(ErrorResponse::bad_request("audio_data cannot be empty"));
    }

    let client = bridge_client(60)?;
    let url = format!("{}/pipeline", bridge_base_url());

    let bridge_payload = serde_json::json!({
        "audio_data": body.audio_data,
        "input_format": body.input_format,
        "language": body.language,
        "synthesize_response": body.synthesize_response,
    });

    let resp = client
        .post(&url)
        .json(&bridge_payload)
        .send()
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "Bridge pipeline request failed");
            bridge_not_running_error()
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        tracing::warn!(status = %status, body = %body_text, "Bridge pipeline returned error");
        return Err(ErrorResponse::internal(format!(
            "Bridge returned HTTP {}: {}",
            status,
            body_text.chars().take(200).collect::<String>()
        )));
    }

    let bridge_result: serde_json::Value = resp.json().await.map_err(|e| {
        ErrorResponse::internal(format!("Failed to parse bridge response: {}", e))
    })?;

    Ok(Json(VoicePipelineResponse {
        transcript: bridge_result["transcript"]
            .as_str()
            .unwrap_or("(no transcript)")
            .to_string(),
        transcript_confidence: bridge_result["transcript_confidence"]
            .as_f64()
            .or_else(|| bridge_result["transcriptConfidence"].as_f64())
            .unwrap_or(0.0),
        response_text: bridge_result["response_text"]
            .as_str()
            .or_else(|| bridge_result["responseText"].as_str())
            .unwrap_or("(no response)")
            .to_string(),
        response_audio: bridge_result["response_audio"]
            .as_str()
            .or_else(|| bridge_result["responseAudio"].as_str())
            .map(|s| s.to_string()),
        from_bridge: true,
        pipeline_duration_secs: bridge_result["pipeline_duration_secs"]
            .as_f64()
            .or_else(|| bridge_result["pipelineDurationSecs"].as_f64())
            .unwrap_or(0.0),
    }))
}

/// `GET /api/conscious/bridge/health`
///
/// Check if the Python voice/conscious bridge server is reachable
/// and report its capabilities.
#[utoipa::path(
    get,
    path = "/api/conscious/bridge/health",
    responses(
        (status = 200, description = "Bridge health status", body = BridgeHealthResponse)
    ),
    tag = "Conscious"
)]
async fn bridge_health() -> Json<BridgeHealthResponse> {
    tracing::debug!("GET /api/conscious/bridge/health");

    let base = bridge_base_url();
    let client = match bridge_client(5) {
        Ok(c) => c,
        Err(_) => {
            return Json(BridgeHealthResponse {
                reachable: false,
                bridge_url: base,
                version: None,
                capabilities: vec![],
                message: "Failed to build HTTP client".to_string(),
            });
        }
    };

    let url = format!("{}/health", base);
    match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let body: serde_json::Value = resp.json().await.unwrap_or_default();
            let version = body["version"].as_str().map(|s| s.to_string());
            let capabilities = body["capabilities"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_else(|| vec!["transcribe".to_string(), "synthesize".to_string(), "pipeline".to_string()]);

            Json(BridgeHealthResponse {
                reachable: true,
                bridge_url: base,
                version,
                capabilities,
                message: "Bridge server is running and reachable".to_string(),
            })
        }
        Ok(resp) => {
            let status = resp.status();
            Json(BridgeHealthResponse {
                reachable: false,
                bridge_url: base,
                version: None,
                capabilities: vec![],
                message: format!(
                    "Bridge responded with HTTP {} — check bridge logs. \
                     Start with: python crates/goose-mcp/src/bridges/voice_bridge_server.py --port {}",
                    status,
                    std::env::var("CONSCIOUS_BRIDGE_PORT")
                        .ok()
                        .and_then(|p| p.parse::<u16>().ok())
                        .unwrap_or(DEFAULT_BRIDGE_PORT)
                ),
            })
        }
        Err(e) => {
            let port = std::env::var("CONSCIOUS_BRIDGE_PORT")
                .ok()
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(DEFAULT_BRIDGE_PORT);
            Json(BridgeHealthResponse {
                reachable: false,
                bridge_url: base,
                version: None,
                capabilities: vec![],
                message: format!(
                    "Bridge server not reachable ({}). \
                     Start it with: python crates/goose-mcp/src/bridges/voice_bridge_server.py --port {}. \
                     Install deps: pip install pyttsx3 SpeechRecognition",
                    e, port
                ),
            })
        }
    }
}

// ===========================================================================
// Router
// ===========================================================================

pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        // Voice
        .route(
            "/api/conscious/voice/status",
            get(get_voice_status),
        )
        .route(
            "/api/conscious/voice/start",
            post(start_voice_session),
        )
        .route(
            "/api/conscious/voice/stop",
            post(stop_voice_session),
        )
        .route(
            "/api/conscious/voice/transcribe",
            post(transcribe_audio),
        )
        .route(
            "/api/conscious/voice/stream",
            get(voice_event_stream),
        )
        // Voice Pipeline Bridge
        .route(
            "/api/conscious/voice/transcribe-bridge",
            post(transcribe_via_bridge),
        )
        .route(
            "/api/conscious/voice/synthesize",
            post(synthesize_speech),
        )
        .route(
            "/api/conscious/voice/pipeline",
            post(voice_pipeline),
        )
        .route(
            "/api/conscious/bridge/health",
            get(bridge_health),
        )
        // Emotion
        .route(
            "/api/conscious/emotion/status",
            get(get_emotion_status),
        )
        .route(
            "/api/conscious/emotion/analyze",
            post(analyze_emotion),
        )
        .route(
            "/api/conscious/emotion/history",
            get(get_emotion_history),
        )
        // Consciousness State
        .route(
            "/api/conscious/state",
            get(get_conscious_state),
        )
        .route(
            "/api/conscious/state/attention",
            post(set_attention_focus),
        )
        .with_state(state)
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Router signature
    // -----------------------------------------------------------------------

    #[test]
    fn test_routes_creation() {
        let _router_fn: fn(Arc<AppState>) -> Router = routes;
    }

    // -----------------------------------------------------------------------
    // Voice types
    // -----------------------------------------------------------------------

    #[test]
    fn test_voice_status_serialization() {
        let status = default_voice_status();
        let json = serde_json::to_string(&status).expect("serialize voice status");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse JSON");

        assert_eq!(parsed["enabled"], true);
        assert_eq!(parsed["model"], "whisper-large-v3");
        assert_eq!(parsed["sampleRate"], 16000);
        assert_eq!(parsed["sessionActive"], false);
        assert!(parsed["sessionId"].is_null() || parsed.get("sessionId").is_none());
        assert!(parsed["supportedFormats"].is_array());
        assert_eq!(parsed["supportedFormats"].as_array().unwrap().len(), 4);
    }

    #[test]
    fn test_voice_status_camel_case() {
        let status = default_voice_status();
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"sampleRate\""));
        assert!(json.contains("\"sessionActive\""));
        assert!(json.contains("\"supportedFormats\""));
        assert!(!json.contains("sample_rate"));
        assert!(!json.contains("session_active"));
    }

    #[test]
    fn test_start_voice_request_defaults() {
        let json = r#"{}"#;
        let req: StartVoiceRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.format, "pcm16");
        assert_eq!(req.sample_rate, 16000);
        assert_eq!(req.language, "en-US");
    }

    #[test]
    fn test_start_voice_request_custom() {
        let json = r#"{"format": "opus", "sampleRate": 48000, "language": "de-DE"}"#;
        let req: StartVoiceRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.format, "opus");
        assert_eq!(req.sample_rate, 48000);
        assert_eq!(req.language, "de-DE");
    }

    #[test]
    fn test_start_voice_response_serialization() {
        let resp = StartVoiceResponse {
            session_id: "voice-abc123".to_string(),
            started: true,
            format: "pcm16".to_string(),
            sample_rate: 16000,
            language: "en-US".to_string(),
        };
        let json = serde_json::to_string(&resp).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["sessionId"], "voice-abc123");
        assert_eq!(parsed["started"], true);
        assert_eq!(parsed["sampleRate"], 16000);
    }

    #[test]
    fn test_stop_voice_response_serialization() {
        let resp = StopVoiceResponse {
            stopped: true,
            session_id: "voice-xyz".to_string(),
            duration_secs: 120.5,
        };
        let json = serde_json::to_string(&resp).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["stopped"], true);
        assert_eq!(parsed["sessionId"], "voice-xyz");
        assert_eq!(parsed["durationSecs"], 120.5);
    }

    #[test]
    fn test_transcribe_request_deserialization() {
        let json = r#"{
            "audioData": "SGVsbG8gV29ybGQ=",
            "format": "wav",
            "language": "fr-FR"
        }"#;
        let req: TranscribeRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.audio_data, "SGVsbG8gV29ybGQ=");
        assert_eq!(req.format, "wav");
        assert_eq!(req.language, "fr-FR");
    }

    #[test]
    fn test_transcribe_response_serialization() {
        let resp = TranscribeResponse {
            text: "Hello world".to_string(),
            confidence: 0.95,
            language: "en-US".to_string(),
            duration_secs: 1.5,
            segments: vec![TranscriptionSegment {
                text: "Hello world".to_string(),
                start_secs: 0.0,
                end_secs: 1.5,
                confidence: 0.95,
            }],
        };
        let json = serde_json::to_string(&resp).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["text"], "Hello world");
        assert_eq!(parsed["confidence"], 0.95);
        assert_eq!(parsed["durationSecs"], 1.5);
        assert_eq!(parsed["segments"].as_array().unwrap().len(), 1);
        assert_eq!(parsed["segments"][0]["startSecs"], 0.0);
        assert_eq!(parsed["segments"][0]["endSecs"], 1.5);
    }

    #[test]
    fn test_voice_event_serialization() {
        let evt = VoiceEvent::VoiceActivityStart {
            timestamp: "2026-02-14T10:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&evt).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");
        assert_eq!(parsed["type"], "voiceActivityStart");
        assert_eq!(parsed["timestamp"], "2026-02-14T10:00:00Z");

        let evt2 = VoiceEvent::FinalTranscript {
            text: "test".to_string(),
            confidence: 0.9,
            duration_secs: 2.0,
        };
        let json2 = serde_json::to_string(&evt2).expect("serialize");
        let parsed2: serde_json::Value = serde_json::from_str(&json2).expect("parse");
        assert_eq!(parsed2["type"], "finalTranscript");
        assert_eq!(parsed2["text"], "test");
        assert_eq!(parsed2["confidence"], 0.9);
        assert_eq!(parsed2["durationSecs"], 2.0);
    }

    // -----------------------------------------------------------------------
    // Emotion types
    // -----------------------------------------------------------------------

    #[test]
    fn test_emotion_status_serialization() {
        let status = default_emotion_status();
        let json = serde_json::to_string(&status).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["enabled"], true);
        assert_eq!(parsed["model"], "emotion-bert-base");
        assert!(parsed["channels"].is_array());
        assert_eq!(parsed["channels"].as_array().unwrap().len(), 2);
        assert!(parsed["currentEmotion"].is_object());
        assert_eq!(parsed["currentEmotion"]["primary"], "neutral");
    }

    #[test]
    fn test_emotion_reading_roundtrip() {
        let original = EmotionReading {
            timestamp: "2026-02-14T12:00:00Z".to_string(),
            primary: "happy".to_string(),
            confidence: 0.85,
            scores: EmotionScores {
                neutral: 0.10,
                happy: 0.85,
                sad: 0.00,
                angry: 0.00,
                fearful: 0.00,
                surprised: 0.03,
                disgusted: 0.00,
                curious: 0.02,
            },
            source: "voice-prosody".to_string(),
        };

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: EmotionReading = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.primary, original.primary);
        assert_eq!(deserialized.confidence, original.confidence);
        assert_eq!(deserialized.source, original.source);
        assert_eq!(deserialized.scores.happy, original.scores.happy);
        assert_eq!(deserialized.scores.neutral, original.scores.neutral);
    }

    #[test]
    fn test_analyze_emotion_request_deserialization() {
        let json = r#"{"text": "I feel great!", "context": "casual chat"}"#;
        let req: AnalyzeEmotionRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.text, "I feel great!");
        assert_eq!(req.context.as_deref(), Some("casual chat"));

        // Without optional context
        let json2 = r#"{"text": "Hello"}"#;
        let req2: AnalyzeEmotionRequest = serde_json::from_str(json2).expect("deserialize");
        assert_eq!(req2.text, "Hello");
        assert!(req2.context.is_none());
    }

    #[test]
    fn test_analyze_emotion_response_serialization() {
        let resp = AnalyzeEmotionResponse {
            reading: EmotionReading {
                timestamp: "2026-02-14T12:00:00Z".to_string(),
                primary: "neutral".to_string(),
                confidence: 0.75,
                scores: EmotionScores {
                    neutral: 0.75,
                    happy: 0.10,
                    sad: 0.02,
                    angry: 0.01,
                    fearful: 0.01,
                    surprised: 0.04,
                    disgusted: 0.00,
                    curious: 0.07,
                },
                source: "text".to_string(),
            },
            secondary_emotions: vec!["happy".to_string()],
            suggested_tone: "balanced and clear".to_string(),
        };
        let json = serde_json::to_string(&resp).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert!(parsed["reading"].is_object());
        assert_eq!(parsed["reading"]["primary"], "neutral");
        assert_eq!(parsed["secondaryEmotions"][0], "happy");
        assert_eq!(parsed["suggestedTone"], "balanced and clear");
    }

    #[test]
    fn test_default_emotion_history() {
        let history = default_emotion_history();
        assert_eq!(history.len(), 5, "Expected 5 default emotion readings");

        // Verify chronological ordering (newest first)
        assert_eq!(history[0].primary, "neutral");
        assert_eq!(history[1].primary, "curious");
        assert_eq!(history[2].primary, "happy");
        assert_eq!(history[3].primary, "surprised");
        assert_eq!(history[4].primary, "neutral");

        // Verify all have sources
        for r in &history {
            assert!(
                r.source == "text" || r.source == "voice-prosody",
                "Unexpected source: {}",
                r.source
            );
        }
    }

    #[test]
    fn test_emotion_history_response_serialization() {
        let readings = vec![EmotionReading {
            timestamp: "2026-02-14T12:00:00Z".to_string(),
            primary: "happy".to_string(),
            confidence: 0.80,
            scores: EmotionScores {
                neutral: 0.10,
                happy: 0.80,
                sad: 0.00,
                angry: 0.00,
                fearful: 0.00,
                surprised: 0.05,
                disgusted: 0.00,
                curious: 0.05,
            },
            source: "text".to_string(),
        }];
        let resp = EmotionHistoryResponse {
            total: 1,
            readings,
        };
        let json = serde_json::to_string(&resp).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["total"], 1);
        assert_eq!(parsed["readings"].as_array().unwrap().len(), 1);
        assert_eq!(parsed["readings"][0]["primary"], "happy");
    }

    // -----------------------------------------------------------------------
    // Consciousness State types
    // -----------------------------------------------------------------------

    #[test]
    fn test_conscious_state_serialization() {
        let state = default_conscious_state();
        let json = serde_json::to_string(&state).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["attentionFocus"], "general awareness");
        assert_eq!(parsed["attentionLevel"], 0.5);
        assert!(parsed["emotionalContext"].as_str().unwrap().contains("Neutral"));
        assert_eq!(parsed["contextItemsTracked"], 12);
        assert_eq!(parsed["active"], true);
        assert_eq!(parsed["selfModelConfidence"], 0.78);
        assert!(parsed["currentEmotion"].is_object());
        assert_eq!(parsed["voiceActive"], false);
        assert_eq!(parsed["uptime"], "2h 14m");
    }

    #[test]
    fn test_conscious_state_camel_case() {
        let state = default_conscious_state();
        let json = serde_json::to_string(&state).unwrap();
        assert!(json.contains("\"attentionFocus\""));
        assert!(json.contains("\"attentionLevel\""));
        assert!(json.contains("\"emotionalContext\""));
        assert!(json.contains("\"contextItemsTracked\""));
        assert!(json.contains("\"selfModelConfidence\""));
        assert!(json.contains("\"voiceActive\""));
        assert!(!json.contains("attention_focus"));
        assert!(!json.contains("attention_level"));
    }

    #[test]
    fn test_set_attention_request_deserialization() {
        let json = r#"{"focus": "code review", "level": 0.9}"#;
        let req: SetAttentionRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.focus, "code review");
        assert_eq!(req.level, 0.9);

        // With default level
        let json2 = r#"{"focus": "debugging"}"#;
        let req2: SetAttentionRequest = serde_json::from_str(json2).expect("deserialize");
        assert_eq!(req2.focus, "debugging");
        assert_eq!(req2.level, 0.8);
    }

    #[test]
    fn test_set_attention_response_serialization() {
        let resp = SetAttentionResponse {
            updated: true,
            focus: "code review".to_string(),
            level: 0.9,
        };
        let json = serde_json::to_string(&resp).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");

        assert_eq!(parsed["updated"], true);
        assert_eq!(parsed["focus"], "code review");
        assert_eq!(parsed["level"], 0.9);
    }

    // -----------------------------------------------------------------------
    // State initialization
    // -----------------------------------------------------------------------

    #[test]
    fn test_conscious_module_state_initialization() {
        let state = ConsciousModuleState::default();

        let voice = state.voice_status.lock().unwrap();
        assert!(voice.enabled);
        assert!(!voice.session_active);
        assert_eq!(voice.model, "whisper-large-v3");
        drop(voice);

        let emotion = state.emotion_status.lock().unwrap();
        assert!(emotion.enabled);
        assert_eq!(emotion.model, "emotion-bert-base");
        assert!(emotion.current_emotion.is_some());
        drop(emotion);

        let history = state.emotion_history.lock().unwrap();
        assert_eq!(history.len(), 5);
        drop(history);

        let conscious = state.conscious_state.lock().unwrap();
        assert!(conscious.active);
        assert_eq!(conscious.attention_focus, "general awareness");
        assert!(!conscious.voice_active);
    }

    // -----------------------------------------------------------------------
    // Emotion scores validation
    // -----------------------------------------------------------------------

    #[test]
    fn test_emotion_scores_sum_approximately_one() {
        let scores = EmotionScores {
            neutral: 0.72,
            happy: 0.12,
            sad: 0.02,
            angry: 0.01,
            fearful: 0.01,
            surprised: 0.05,
            disgusted: 0.00,
            curious: 0.07,
        };
        let sum = scores.neutral
            + scores.happy
            + scores.sad
            + scores.angry
            + scores.fearful
            + scores.surprised
            + scores.disgusted
            + scores.curious;
        assert!(
            (sum - 1.0).abs() < 0.01,
            "Emotion scores should sum to approximately 1.0, got {}",
            sum
        );
    }

    // -----------------------------------------------------------------------
    // UUID mock helper
    // -----------------------------------------------------------------------

    #[test]
    fn test_uuid_v4_mock_format() {
        let id = uuid_v4_mock();
        assert!(id.contains('-'), "UUID mock should contain a hyphen");
        assert!(id.len() > 10, "UUID mock should be reasonably long");
    }

    #[test]
    fn test_uuid_v4_mock_uniqueness() {
        let id1 = uuid_v4_mock();
        std::thread::sleep(std::time::Duration::from_millis(1));
        let id2 = uuid_v4_mock();
        // Not strictly guaranteed but very likely with nanosecond timestamps
        assert_ne!(id1, id2, "Two UUIDs generated with delay should differ");
    }

    // -----------------------------------------------------------------------
    // TranscriptionSegment roundtrip
    // -----------------------------------------------------------------------

    #[test]
    fn test_transcription_segment_roundtrip() {
        let original = TranscriptionSegment {
            text: "Hello".to_string(),
            start_secs: 0.1,
            end_secs: 0.5,
            confidence: 0.98,
        };
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: TranscriptionSegment = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.text, original.text);
        assert_eq!(deserialized.start_secs, original.start_secs);
        assert_eq!(deserialized.end_secs, original.end_secs);
        assert_eq!(deserialized.confidence, original.confidence);
    }

    // -----------------------------------------------------------------------
    // VoiceEvent variants coverage
    // -----------------------------------------------------------------------

    #[test]
    fn test_voice_event_all_variants_serialize() {
        let events = vec![
            VoiceEvent::VoiceActivityStart {
                timestamp: "2026-02-14T10:00:00Z".to_string(),
            },
            VoiceEvent::VoiceActivityEnd {
                timestamp: "2026-02-14T10:00:03Z".to_string(),
                duration_secs: 3.0,
            },
            VoiceEvent::PartialTranscript {
                text: "Hello".to_string(),
                confidence: 0.7,
            },
            VoiceEvent::FinalTranscript {
                text: "Hello world".to_string(),
                confidence: 0.95,
                duration_secs: 1.5,
            },
            VoiceEvent::VoiceError {
                message: "Microphone disconnected".to_string(),
                code: Some("MIC_LOST".to_string()),
            },
        ];

        for evt in &events {
            let json = serde_json::to_string(evt).expect("All voice event variants must serialize");
            let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");
            assert!(parsed["type"].is_string(), "All events must have a 'type' field");
        }
    }

    // -----------------------------------------------------------------------
    // Default data completeness
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // Voice Pipeline Bridge types
    // -----------------------------------------------------------------------

    #[test]
    fn test_synthesize_request_defaults() {
        let json = r#"{"text": "Hello world"}"#;
        let req: SynthesizeRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.text, "Hello world");
        assert_eq!(req.format, "wav");
        assert_eq!(req.rate, 175);
        assert!((req.volume - 0.9).abs() < 0.01);
    }

    #[test]
    fn test_synthesize_request_custom() {
        let json = r#"{"text": "Hello", "format": "opus", "rate": 200, "volume": 0.5}"#;
        let req: SynthesizeRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.format, "opus");
        assert_eq!(req.rate, 200);
        assert!((req.volume - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_synthesize_response_serialization() {
        let resp = SynthesizeResponse {
            audio_data: "base64data==".to_string(),
            format: "wav".to_string(),
            text_length: 11,
            from_bridge: true,
            duration_secs: 1.5,
        };
        let json = serde_json::to_string(&resp).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");
        assert_eq!(parsed["audioData"], "base64data==");
        assert_eq!(parsed["format"], "wav");
        assert_eq!(parsed["textLength"], 11);
        assert_eq!(parsed["fromBridge"], true);
        assert_eq!(parsed["durationSecs"], 1.5);
    }

    #[test]
    fn test_voice_pipeline_request_defaults() {
        let json = r#"{"audioData": "SGVsbG8="}"#;
        let req: VoicePipelineRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.audio_data, "SGVsbG8=");
        assert_eq!(req.input_format, "pcm16");
        assert_eq!(req.language, "en-US");
        assert!(req.synthesize_response);
    }

    #[test]
    fn test_voice_pipeline_request_custom() {
        let json = r#"{
            "audioData": "data==",
            "inputFormat": "opus",
            "language": "ja-JP",
            "synthesizeResponse": false
        }"#;
        let req: VoicePipelineRequest = serde_json::from_str(json).expect("deserialize");
        assert_eq!(req.input_format, "opus");
        assert_eq!(req.language, "ja-JP");
        assert!(!req.synthesize_response);
    }

    #[test]
    fn test_voice_pipeline_response_serialization() {
        let resp = VoicePipelineResponse {
            transcript: "Hello world".to_string(),
            transcript_confidence: 0.95,
            response_text: "Hi there!".to_string(),
            response_audio: Some("audiodata==".to_string()),
            from_bridge: true,
            pipeline_duration_secs: 2.5,
        };
        let json = serde_json::to_string(&resp).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");
        assert_eq!(parsed["transcript"], "Hello world");
        assert_eq!(parsed["transcriptConfidence"], 0.95);
        assert_eq!(parsed["responseText"], "Hi there!");
        assert_eq!(parsed["responseAudio"], "audiodata==");
        assert_eq!(parsed["fromBridge"], true);
        assert_eq!(parsed["pipelineDurationSecs"], 2.5);
    }

    #[test]
    fn test_voice_pipeline_response_without_audio() {
        let resp = VoicePipelineResponse {
            transcript: "Test".to_string(),
            transcript_confidence: 0.8,
            response_text: "Response".to_string(),
            response_audio: None,
            from_bridge: false,
            pipeline_duration_secs: 1.0,
        };
        let json = serde_json::to_string(&resp).expect("serialize");
        assert!(!json.contains("responseAudio"), "None fields should be skipped");
    }

    #[test]
    fn test_bridge_health_response_serialization() {
        let resp = BridgeHealthResponse {
            reachable: true,
            bridge_url: "http://127.0.0.1:8400".to_string(),
            version: Some("0.1.0".to_string()),
            capabilities: vec!["transcribe".to_string(), "synthesize".to_string()],
            message: "Bridge is running".to_string(),
        };
        let json = serde_json::to_string(&resp).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");
        assert_eq!(parsed["reachable"], true);
        assert_eq!(parsed["bridgeUrl"], "http://127.0.0.1:8400");
        assert_eq!(parsed["version"], "0.1.0");
        assert_eq!(parsed["capabilities"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_bridge_health_response_without_version() {
        let resp = BridgeHealthResponse {
            reachable: false,
            bridge_url: "http://127.0.0.1:8400".to_string(),
            version: None,
            capabilities: vec![],
            message: "Not reachable".to_string(),
        };
        let json = serde_json::to_string(&resp).expect("serialize");
        assert!(!json.contains("\"version\""), "None version should be skipped");
    }

    #[test]
    fn test_bridge_base_url_default() {
        // Without env var, should use default port
        let url = bridge_base_url();
        assert!(url.starts_with("http://127.0.0.1:"));
    }

    #[test]
    fn test_bridge_client_creation() {
        let client = bridge_client(5);
        assert!(client.is_ok(), "Bridge client should be constructable");
    }

    // -----------------------------------------------------------------------
    // Emotion scores validation
    // -----------------------------------------------------------------------

    #[test]
    fn test_all_default_emotion_readings_have_valid_scores() {
        let history = default_emotion_history();
        for reading in &history {
            let sum = reading.scores.neutral
                + reading.scores.happy
                + reading.scores.sad
                + reading.scores.angry
                + reading.scores.fearful
                + reading.scores.surprised
                + reading.scores.disgusted
                + reading.scores.curious;
            assert!(
                (sum - 1.0).abs() < 0.02,
                "Reading '{}' scores sum to {}, expected ~1.0",
                reading.primary,
                sum
            );
            assert!(
                reading.confidence > 0.0 && reading.confidence <= 1.0,
                "Confidence must be in (0,1] range"
            );
            assert!(
                !reading.timestamp.is_empty(),
                "Timestamp must not be empty"
            );
        }
    }
}
