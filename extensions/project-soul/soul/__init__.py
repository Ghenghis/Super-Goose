"""
Project Soul - The Digital Companion for Super-Goose

A voice-first AI companion that acts as an emotional, intelligent liaison
between the user and Super-Goose (the coding swarm).
"""

__version__ = "0.1.0"
__author__ = "Super-Goose Team"

from .server import SoulServer
from .config import SoulConfig

__all__ = ["SoulServer", "SoulConfig"]
