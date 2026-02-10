"""Conscious Bridge — Integration bridge for the Conscious voice AI companion.

Wraps the Conscious REST API (port 8999) to expose voice engine control,
emotion detection, personality management, GooseBridge routing, and
memory queries as async functions callable from the Super-Goose tool
registry.

Conscious is a voice-first AI companion built on:
  - Kyutai Moshi 7B native speech-to-speech engine (<200ms latency)
  - Wav2Vec2 emotion detection (8 emotions, 85-90% accuracy)
  - 13 personality profiles with 20+ behavioural sliders
  - GooseBridge HTTP client to goosed server (port 7878)
  - Intent routing (CHAT vs ACTION classification)
  - Memory system (ConversationHistory + future Mem0/Qdrant)
  - Device control (SSH, 3D printer, network scanning)

Architecture::

    Super-Goose ToolRegistry
         |
         v
    conscious_bridge (this module)
         | aiohttp HTTP calls
         v
    Conscious AgentAPI  (port 8999)
         |
         +---> MoshiServerManager -> Moshi voice engine (port 8998)
         +---> EmotionDetector -> EmotionTracker -> EmotionResponder
         +---> PersonalitySwitcher -> PersonalityModulator
         +---> GooseBridge -> goosed server (port 7878)
         +---> ConversationHistory / MemoryManager
         +---> DeviceManager, AICreator, WakeVAD, UIBridge

Usage from the ToolRegistry::

    registry = ToolRegistry()
    registry.load_config("config/external_tools.toml")
    result = await registry.execute("conscious", "start_voice")
    result = await registry.execute("conscious", "get_emotion")
    result = await registry.execute("conscious", "set_personality", {"name": "spark"})
"""

import asyncio
import base64
import logging
import os
import threading
from typing import Any, Optional

try:
    import aiohttp
except ImportError:
    aiohttp = None  # type: ignore[assignment]

from integrations.registry import ToolStatus
from integrations.resource_coordinator import get_coordinator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

#: Base URL for the Conscious API server.
CONSCIOUS_API_URL: str = os.environ.get(
    "CONSCIOUS_API_URL", "http://127.0.0.1:8999"
)

#: Default timeout for HTTP requests to the Conscious API (seconds).
DEFAULT_TIMEOUT_S: float = float(os.environ.get("CONSCIOUS_BRIDGE_TIMEOUT", "30"))

#: Timeout for long-running operations like starting the voice engine.
LONG_TIMEOUT_S: float = float(os.environ.get("CONSCIOUS_BRIDGE_LONG_TIMEOUT", "120"))

# ---------------------------------------------------------------------------
# Module-level state (lazy-initialized)
# ---------------------------------------------------------------------------

_session: Optional["aiohttp.ClientSession"] = None
_initialized: bool = False
_init_lock = threading.Lock()


# ═══════════════════════════════════════════════════════════════════════════
# Lifecycle
# ═══════════════════════════════════════════════════════════════════════════


async def init() -> None:
    """Initialize the Conscious bridge module.

    Creates a shared aiohttp ClientSession for connection pooling.  Safe to
    call multiple times -- subsequent calls are no-ops if the session is
    still open.

    This function is called lazily by the ToolRegistry on first use, or
    can be called explicitly during application startup.
    """
    global _session, _initialized

    with _init_lock:
        if aiohttp is None:
            raise ImportError(
                "aiohttp is required for the Conscious bridge. "
                "Install it with: pip install aiohttp"
            )

        if _session is None or _session.closed:
            _session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=DEFAULT_TIMEOUT_S),
            )
            logger.info(
                "Conscious bridge initialised (api_url=%s, timeout=%ss)",
                CONSCIOUS_API_URL,
                DEFAULT_TIMEOUT_S,
            )

        _initialized = True


async def shutdown() -> None:
    """Gracefully close the shared HTTP session.

    Should be called during application teardown.  Safe to call even if
    ``init()`` was never invoked.
    """
    global _session, _initialized

    if _session is not None and not _session.closed:
        await _session.close()
        logger.info("Conscious bridge session closed")

    _session = None
    _initialized = False


def status() -> ToolStatus:
    """Return the current health status of the Conscious bridge.

    Performs a *synchronous* best-effort check.  For a full async health
    probe that actually contacts the Conscious server, use
    :func:`health_check`.

    Returns:
        ToolStatus with availability and health information.
    """
    if aiohttp is None:
        return ToolStatus(
            name="conscious",
            available=False,
            healthy=False,
            error="aiohttp is not installed (pip install aiohttp)",
        )

    if not _initialized or _session is None or _session.closed:
        return ToolStatus(
            name="conscious",
            available=True,
            healthy=False,
            error="Bridge not initialised -- call init() first",
        )

    return ToolStatus(
        name="conscious",
        available=True,
        healthy=True,
        version="1.0.0",
    )


def capabilities() -> list[str]:
    """Return the list of operations this bridge supports.

    Returns:
        List of operation names that can be passed to :func:`execute`.
    """
    return [
        "start_voice",
        "stop_voice",
        "voice_status",
        "send_audio",
        "get_emotion",
        "set_personality",
        "list_personalities",
        "send_to_goose",
        "get_memory",
        "health_check",
    ]


# ═══════════════════════════════════════════════════════════════════════════
# Generic dispatcher (used by ToolRegistry.execute)
# ═══════════════════════════════════════════════════════════════════════════


async def execute(operation: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Dispatch an operation by name with the given parameters.

    This is the primary entry point used by :class:`ToolRegistry` when it
    calls ``await registry.execute("conscious", operation, params)``.

    Args:
        operation: One of the names returned by :func:`capabilities`.
        params: Keyword arguments forwarded to the operation function.

    Returns:
        A dict with at least ``{"success": bool}`` plus operation-specific
        keys.  On failure, includes an ``"error"`` key.
    """
    await _ensure_session()

    dispatch: dict[str, Any] = {
        "start_voice": start_voice,
        "stop_voice": stop_voice,
        "voice_status": voice_status,
        "send_audio": send_audio,
        "get_emotion": get_emotion,
        "set_personality": set_personality,
        "list_personalities": list_personalities,
        "send_to_goose": send_to_goose,
        "get_memory": get_memory,
        "health_check": health_check,
    }

    func = dispatch.get(operation)
    if func is None:
        return {
            "success": False,
            "error": (
                f"Unknown operation '{operation}'. "
                f"Available: {', '.join(dispatch)}"
            ),
        }

    async def _do_operation():
        return await func(**(params or {}))

    coordinator = get_coordinator()
    try:
        async with coordinator.acquire("conscious", "process"):
            return await _do_operation()
    except Exception as coord_err:
        logger.warning(
            "ResourceCoordinator unavailable, running without coordination: %s",
            coord_err,
        )
        try:
            return await _do_operation()
        except Exception as exc:
            logger.error("Conscious bridge execute(%s) failed: %s", operation, exc, exc_info=True)
            return {"success": False, "error": str(exc)}


# ═══════════════════════════════════════════════════════════════════════════
# Voice Engine
# ═══════════════════════════════════════════════════════════════════════════


async def start_voice() -> dict[str, Any]:
    """Start the Moshi voice engine and connect the agent.

    Sends ``POST /api/voice/start`` which launches the Moshi subprocess,
    waits for the model to load, and connects the agent WebSocket.

    This is a long-running operation: the Moshi model load can take up
    to several minutes on first run.

    Returns:
        Server status dict including ``server``, ``agent``, and
        ``recent_text`` fields on success.
    """
    return await _post("/api/voice/start", timeout=LONG_TIMEOUT_S)


async def stop_voice() -> dict[str, Any]:
    """Stop the Moshi voice engine and disconnect the agent.

    Sends ``POST /api/voice/stop`` which tears down the agent connection,
    stops the Moshi server subprocess, and saves conversation history.

    Returns:
        ``{"success": True}`` on clean shutdown.
    """
    return await _post("/api/voice/stop")


async def voice_status() -> dict[str, Any]:
    """Get the current status of the voice engine, agent, and subsystems.

    Sends ``GET /api/voice/status`` which returns server status, agent
    state, connection stats, and the recent text transcript buffer.

    Returns:
        Dict with ``server``, ``agent``, and ``recent_text`` keys.
    """
    return await _get("/api/voice/status")


async def send_audio(audio_data: bytes) -> dict[str, Any]:
    """Send raw PCM audio data to the Moshi voice engine for processing.

    The audio should be **float32 PCM at 24 kHz mono**.  It will be
    base64-encoded and sent via ``POST /api/voice/audio``.

    The audio is fed into both the Moshi speech-to-speech engine and the
    Wav2Vec2 emotion detector.  Moshi's response audio is streamed back
    to connected WebSocket clients.

    Args:
        audio_data: Raw PCM bytes (float32, 24 kHz, mono).

    Returns:
        Dict with ``success``, ``samples_sent``, and ``duration_ms``.
    """
    if not isinstance(audio_data, (bytes, bytearray)):
        return {"success": False, "error": "audio_data must be bytes"}

    if len(audio_data) == 0:
        return {"success": False, "error": "audio_data is empty"}

    payload = {"audio": base64.b64encode(audio_data).decode("ascii")}
    return await _post("/api/voice/audio", json_body=payload)


# ═══════════════════════════════════════════════════════════════════════════
# Emotion Detection
# ═══════════════════════════════════════════════════════════════════════════


async def get_emotion() -> dict[str, Any]:
    """Get the current detected emotion state from the Wav2Vec2 engine.

    Sends ``GET /api/emotion/status`` which returns the emotion engine
    status, the latest classified emotion, conversation mood summary
    (dominant emotion, trend, valence), and response modulation hints.

    The emotion engine classifies user audio into 8 emotions:
    happy, sad, angry, fearful, disgusted, surprised, neutral, frustrated.

    Returns:
        Dict with ``enabled``, ``model_loaded``, ``mood``, ``latest``,
        ``modulation``, and ``should_offer_break`` fields.
    """
    return await _get("/api/emotion/status")


# ═══════════════════════════════════════════════════════════════════════════
# Personality Management
# ═══════════════════════════════════════════════════════════════════════════


async def set_personality(name: str) -> dict[str, Any]:
    """Switch to a named personality profile.

    Conscious supports 13 personality profiles with 20+ behavioural
    sliders controlling formality, verbosity, humour, empathy, and more.
    This call sends ``POST /api/personality/switch`` to change the
    active profile.

    Personality changes affect all subsequent responses from the voice
    engine, GooseBridge prompt wrapping, and result modulation.

    Args:
        name: Profile name (e.g. ``"conscious"``, ``"spark"``,
              ``"professor"``).  Case-sensitive.

    Returns:
        Dict with ``switched_to`` containing the new profile details,
        or an ``error`` if the profile is unknown or content-blocked.
    """
    if not name or not isinstance(name, str):
        return {"success": False, "error": "'name' must be a non-empty string"}

    if len(name) > 200:
        return {"success": False, "error": "'name' too long (max 200 characters)"}

    return await _post("/api/personality/switch", json_body={"name": name})


async def list_personalities() -> dict[str, Any]:
    """List all available personality profiles.

    Sends ``GET /api/personality/list`` which returns profiles filtered
    by the current content rating setting (mature profiles are excluded
    unless explicitly enabled on the Conscious server).

    Returns:
        Dict with ``profiles`` list, each containing name, description,
        content_rating, and slider values.
    """
    return await _get("/api/personality/list")


# ═══════════════════════════════════════════════════════════════════════════
# GooseBridge (routing to goosed)
# ═══════════════════════════════════════════════════════════════════════════


async def send_to_goose(text: str) -> dict[str, Any]:
    """Route a text command to the goosed server via Conscious's agentic layer.

    Sends ``POST /api/agentic/execute`` which passes the text through
    Conscious's IntentRouter, GooseBridge, and PersonalityModulator
    pipeline:

    1. The text is classified as CHAT or ACTION by the IntentRouter.
    2. ACTION intents are mapped to goosed tool prompts and sent via HTTP.
    3. goosed streams back SSE events with the tool execution result.
    4. The result is modulated by the active personality profile.
    5. The ResultSpeaker converts it to speech-friendly text.

    Args:
        text: The natural-language command or question to send to goosed
              (e.g. ``"run my tests"``, ``"what files are in src/"``).

    Returns:
        Dict with ``success``, ``speech`` (personality-modulated result),
        ``raw`` (unmodulated result), and ``elapsed_s``.
    """
    if not text or not isinstance(text, str):
        return {"success": False, "error": "'text' must be a non-empty string"}

    if len(text) > 10_000:
        return {"success": False, "error": "'text' too long (max 10000 characters)"}

    return await _post(
        "/api/agentic/execute",
        json_body={"text": text, "action": "freeform"},
    )


# ═══════════════════════════════════════════════════════════════════════════
# Memory / Conversation History
# ═══════════════════════════════════════════════════════════════════════════


async def get_memory(query: str = "") -> dict[str, Any]:
    """Query conversation memory and session history.

    Sends ``GET /api/memory/status`` which returns the current session
    summary (entry count, duration, speaker counts), recent transcript
    text, and summaries of up to 3 previous sessions.

    The ``query`` parameter is reserved for future semantic memory search
    (Mem0 + Qdrant integration) and is currently unused by the API.

    Args:
        query: Optional search query for semantic memory retrieval
               (future feature -- currently returns full session state).

    Returns:
        Dict with ``session``, ``recent_transcript``, and
        ``previous_sessions`` fields.
    """
    # The Conscious API does not yet support query-based memory search.
    # When semantic memory (Mem0/Qdrant) is integrated, this will pass
    # the query parameter to a search endpoint.
    result = await _get("/api/memory/status")

    # Annotate with the query for transparency.
    if isinstance(result, dict) and query:
        result["query"] = query

    return result


# ═══════════════════════════════════════════════════════════════════════════
# Health & Diagnostics
# ═══════════════════════════════════════════════════════════════════════════


async def health_check() -> dict[str, Any]:
    """Run a comprehensive health check against the Conscious server.

    Sends ``GET /api/health`` which probes all subsystems: the HTTP API,
    Moshi server, Moshi agent, goosed reachability, UI Bridge, emotion
    model, and action queue.

    Returns:
        Dict with ``status`` (``"healthy"`` or ``"degraded"``),
        ``version``, and a ``checks`` dict with per-subsystem booleans.
    """
    return await _get("/api/health")


# ═══════════════════════════════════════════════════════════════════════════
# Internal HTTP helpers
# ═══════════════════════════════════════════════════════════════════════════


async def _ensure_session() -> "aiohttp.ClientSession":
    """Ensure the shared session is initialised and return it.

    Automatically calls :func:`init` if the session does not exist.

    Returns:
        The shared aiohttp ClientSession.

    Raises:
        ImportError: If aiohttp is not installed.
        RuntimeError: If session creation fails.
    """
    global _session

    if _session is None or _session.closed:
        await init()

    if _session is None:
        raise RuntimeError("Failed to initialise Conscious bridge session")

    return _session


async def _get(path: str, timeout: float | None = None) -> dict[str, Any]:
    """Send an HTTP GET request to the Conscious API.

    Args:
        path: API path (e.g. ``"/api/voice/status"``).
        timeout: Optional per-request timeout override (seconds).

    Returns:
        Parsed JSON response as a dict.  On connection failure, returns
        ``{"success": False, "error": "..."}`` instead of raising.
    """
    session = await _ensure_session()
    url = f"{CONSCIOUS_API_URL}{path}"

    request_timeout = (
        aiohttp.ClientTimeout(total=timeout)
        if timeout is not None
        else None
    )

    try:
        async with session.get(url, timeout=request_timeout) as resp:
            if resp.content_type == "application/json":
                data = await resp.json()
            else:
                text = await resp.text()
                data = {"raw_response": text}

            if resp.status >= 400:
                data.setdefault("success", False)
                data.setdefault("error", f"HTTP {resp.status}")
                logger.warning(
                    "Conscious API GET %s returned %d: %s",
                    path, resp.status, data.get("error"),
                )
            else:
                data.setdefault("success", True)

            return data

    except aiohttp.ClientConnectorError:
        msg = (
            f"Cannot connect to Conscious API at {CONSCIOUS_API_URL}. "
            "Is the Conscious server running? "
            "Start it with: python -m conscious.voice.agent_api --auto-start"
        )
        logger.warning(msg)
        return {"success": False, "error": msg}

    except asyncio.TimeoutError:
        msg = f"Conscious API GET {path} timed out after {timeout or DEFAULT_TIMEOUT_S}s"
        logger.warning(msg)
        return {"success": False, "error": msg}

    except Exception as exc:
        logger.error("Conscious API GET %s unexpected error: %s", path, exc, exc_info=True)
        return {"success": False, "error": str(exc)}


async def _post(
    path: str,
    json_body: dict[str, Any] | None = None,
    timeout: float | None = None,
) -> dict[str, Any]:
    """Send an HTTP POST request to the Conscious API.

    Args:
        path: API path (e.g. ``"/api/voice/start"``).
        json_body: Optional JSON payload.
        timeout: Optional per-request timeout override (seconds).

    Returns:
        Parsed JSON response as a dict.  On connection failure, returns
        ``{"success": False, "error": "..."}`` instead of raising.
    """
    session = await _ensure_session()
    url = f"{CONSCIOUS_API_URL}{path}"

    request_timeout = (
        aiohttp.ClientTimeout(total=timeout)
        if timeout is not None
        else None
    )

    try:
        async with session.post(
            url,
            json=json_body,
            timeout=request_timeout,
        ) as resp:
            if resp.content_type == "application/json":
                data = await resp.json()
            else:
                text = await resp.text()
                data = {"raw_response": text}

            if resp.status >= 400:
                data.setdefault("success", False)
                data.setdefault("error", f"HTTP {resp.status}")
                logger.warning(
                    "Conscious API POST %s returned %d: %s",
                    path, resp.status, data.get("error"),
                )
            else:
                data.setdefault("success", True)

            return data

    except aiohttp.ClientConnectorError:
        msg = (
            f"Cannot connect to Conscious API at {CONSCIOUS_API_URL}. "
            "Is the Conscious server running? "
            "Start it with: python -m conscious.voice.agent_api --auto-start"
        )
        logger.warning(msg)
        return {"success": False, "error": msg}

    except asyncio.TimeoutError:
        msg = f"Conscious API POST {path} timed out after {timeout or DEFAULT_TIMEOUT_S}s"
        logger.warning(msg)
        return {"success": False, "error": msg}

    except Exception as exc:
        logger.error("Conscious API POST %s unexpected error: %s", path, exc, exc_info=True)
        return {"success": False, "error": str(exc)}
