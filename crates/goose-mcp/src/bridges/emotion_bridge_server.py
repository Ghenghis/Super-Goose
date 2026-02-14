#!/usr/bin/env python3
"""
Emotion Detection MCP Bridge Server for Super-Goose.

Wraps text-based emotion and sentiment analysis for detecting emotional
tone, sentiment polarity, and affect in text via MCP stdio protocol.

Install: pip install mcp transformers torch
"""

import asyncio
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

BRIDGE_NAME = "emotion_bridge"
BRIDGE_DESCRIPTION = "Emotion and sentiment detection from text"
BRIDGE_VERSION = "0.1.0"

logging.basicConfig(
    level=logging.INFO,
    format=f"[{BRIDGE_NAME}] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(BRIDGE_NAME)

_LIB_AVAILABLE = False
try:
    from transformers import pipeline as hf_pipeline
    _LIB_AVAILABLE = True
except ImportError:
    logger.warning("transformers not installed. Install: pip install transformers torch")

server = Server(BRIDGE_NAME)

# Lazy-loaded pipelines
_emotion_classifier = None
_sentiment_classifier = None


def _get_emotion_classifier():
    global _emotion_classifier
    if _emotion_classifier is None:
        _emotion_classifier = hf_pipeline(
            "text-classification",
            model="j-hartmann/emotion-english-distilroberta-base",
            top_k=None,
        )
    return _emotion_classifier


def _get_sentiment_classifier():
    global _sentiment_classifier
    if _sentiment_classifier is None:
        _sentiment_classifier = hf_pipeline(
            "sentiment-analysis",
            model="distilbert-base-uncased-finetuned-sst-2-english",
        )
    return _sentiment_classifier


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="emotion_detect",
            description="Detect emotions in text (anger, disgust, fear, joy, neutral, sadness, surprise)",
            inputSchema={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Text to analyze for emotions",
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of top emotions to return",
                        "default": 3,
                    },
                },
                "required": ["text"],
            },
        ),
        Tool(
            name="emotion_sentiment",
            description="Analyze sentiment polarity (positive/negative) with confidence score",
            inputSchema={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Text to analyze for sentiment",
                    },
                },
                "required": ["text"],
            },
        ),
        Tool(
            name="emotion_batch_analyze",
            description="Analyze emotions across multiple texts and return summary statistics",
            inputSchema={
                "type": "object",
                "properties": {
                    "texts": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of texts to analyze",
                    },
                },
                "required": ["texts"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "emotion_detect":
            result = await _detect(arguments)
        elif name == "emotion_sentiment":
            result = await _sentiment(arguments)
        elif name == "emotion_batch_analyze":
            result = await _batch_analyze(arguments)
        else:
            raise ValueError(f"Unknown tool: {name}")
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}))]


async def _detect(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "transformers not installed"}

    text = args["text"]
    top_k = args.get("top_k", 3)

    try:
        classifier = _get_emotion_classifier()
        results = classifier(text[:512])
        emotions = sorted(results[0], key=lambda x: x["score"], reverse=True)[:top_k]

        return {
            "status": "success",
            "text": text[:100] + "..." if len(text) > 100 else text,
            "dominant_emotion": emotions[0]["label"] if emotions else "unknown",
            "emotions": [
                {"emotion": e["label"], "score": round(e["score"], 4)}
                for e in emotions
            ],
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _sentiment(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "transformers not installed"}

    text = args["text"]

    try:
        classifier = _get_sentiment_classifier()
        result = classifier(text[:512])[0]

        return {
            "status": "success",
            "text": text[:100] + "..." if len(text) > 100 else text,
            "sentiment": result["label"].lower(),
            "confidence": round(result["score"], 4),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _batch_analyze(args: dict[str, Any]) -> dict[str, Any]:
    if not _LIB_AVAILABLE:
        return {"status": "unavailable", "message": "transformers not installed"}

    texts = args["texts"]
    if not texts:
        return {"status": "error", "message": "No texts provided"}

    try:
        classifier = _get_emotion_classifier()
        emotion_counts: dict[str, int] = {}
        results_list = []

        for text in texts[:50]:  # Limit batch size
            result = classifier(text[:512])
            top = max(result[0], key=lambda x: x["score"])
            emotion = top["label"]
            emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1
            results_list.append({
                "text": text[:60] + "..." if len(text) > 60 else text,
                "emotion": emotion,
                "score": round(top["score"], 4),
            })

        return {
            "status": "success",
            "total_texts": len(texts),
            "analyzed": len(results_list),
            "emotion_distribution": emotion_counts,
            "dominant_overall": max(emotion_counts, key=emotion_counts.get),
            "results": results_list,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def main():
    logger.info("Starting %s v%s", BRIDGE_NAME, BRIDGE_VERSION)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
