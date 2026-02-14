#!/usr/bin/env python3
"""
Voice/TTS MCP Bridge Server for Super-Goose.

Wraps text-to-speech and speech-to-text engines for voice interaction,
audio generation, and transcription via MCP stdio protocol.

Install: pip install mcp pyttsx3 SpeechRecognition
"""

import asyncio
import base64
import json
import logging
import sys
from typing import Any

try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent
except ImportError:
    print("Error: MCP SDK not installed. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)

BRIDGE_NAME = "voice_bridge"
BRIDGE_DESCRIPTION = "Voice synthesis (TTS) and speech recognition (STT)"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_TTS_AVAILABLE = False
_STT_AVAILABLE = False

try:
    import pyttsx3
    _TTS_AVAILABLE = True
except ImportError:
    logger.warning("pyttsx3 not installed. Install: pip install pyttsx3")

try:
    import speech_recognition as sr
    _STT_AVAILABLE = True
except ImportError:
    logger.warning("SpeechRecognition not installed. Install: pip install SpeechRecognition")

_LIB_AVAILABLE = _TTS_AVAILABLE or _STT_AVAILABLE

server = Server(BRIDGE_NAME)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="voice_speak",
            description="Convert text to speech and save as audio file or play directly",
            inputSchema={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Text to convert to speech",
                    },
                    "output_file": {
                        "type": "string",
                        "description": "Output audio file path (WAV format). If empty, plays audio directly.",
                        "default": "",
                    },
                    "rate": {
                        "type": "integer",
                        "description": "Speech rate in words per minute",
                        "default": 175,
                    },
                    "volume": {
                        "type": "number",
                        "description": "Volume level (0.0 to 1.0)",
                        "default": 0.9,
                    },
                },
                "required": ["text"],
            },
        ),
        Tool(
            name="voice_transcribe",
            description="Transcribe speech from an audio file to text",
            inputSchema={
                "type": "object",
                "properties": {
                    "audio_file": {
                        "type": "string",
                        "description": "Path to audio file (WAV, FLAC, AIFF) to transcribe",
                    },
                    "language": {
                        "type": "string",
                        "description": "Language code (e.g., 'en-US', 'es-ES', 'fr-FR')",
                        "default": "en-US",
                    },
                },
                "required": ["audio_file"],
            },
        ),
        Tool(
            name="voice_list_voices",
            description="List available TTS voice engines and voices",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "voice_speak":
            result = await _speak(arguments)
        elif name == "voice_transcribe":
            result = await _transcribe(arguments)
        elif name == "voice_list_voices":
            result = await _list_voices()
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _speak(args: dict[str, Any]) -> dict[str, Any]:
    if not _TTS_AVAILABLE:
        return {"status": "unavailable", "message": "pyttsx3 not installed"}

    text = args["text"]
    output_file = args.get("output_file", "")
    rate = args.get("rate", 175)
    volume = args.get("volume", 0.9)

    try:
        engine = pyttsx3.init()
        engine.setProperty("rate", rate)
        engine.setProperty("volume", volume)

        if output_file:
            engine.save_to_file(text, output_file)
            engine.runAndWait()
            return {
                "status": "success",
                "text_length": len(text),
                "output_file": output_file,
                "rate": rate,
            }
        else:
            engine.say(text)
            engine.runAndWait()
            return {
                "status": "success",
                "text_length": len(text),
                "played": True,
                "rate": rate,
            }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _transcribe(args: dict[str, Any]) -> dict[str, Any]:
    if not _STT_AVAILABLE:
        return {"status": "unavailable", "message": "SpeechRecognition not installed"}

    audio_file = args["audio_file"]
    language = args.get("language", "en-US")

    try:
        recognizer = sr.Recognizer()
        with sr.AudioFile(audio_file) as source:
            audio = recognizer.record(source)

        text = recognizer.recognize_google(audio, language=language)
        return {
            "status": "success",
            "audio_file": audio_file,
            "language": language,
            "transcript": text,
        }
    except sr.UnknownValueError:
        return {"status": "error", "message": "Could not understand audio"}
    except sr.RequestError as exc:
        return {"status": "error", "message": f"Speech recognition service error: {exc}"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _list_voices() -> dict[str, Any]:
    if not _TTS_AVAILABLE:
        return {"status": "unavailable", "message": "pyttsx3 not installed"}

    try:
        engine = pyttsx3.init()
        voices = engine.getProperty("voices")
        voice_list = []
        for v in voices:
            voice_list.append({
                "id": v.id,
                "name": v.name,
                "languages": [str(l) for l in (v.languages or [])],
                "gender": v.gender if hasattr(v, "gender") else "unknown",
            })
        return {
            "status": "success",
            "tts_available": _TTS_AVAILABLE,
            "stt_available": _STT_AVAILABLE,
            "voices": voice_list,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
