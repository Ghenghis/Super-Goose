"""
Configuration management for Project Soul
"""

import os
from pathlib import Path
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
import yaml


@dataclass
class MoshiConfig:
    """Moshi voice engine configuration"""
    model_path: str = "moshi-7b"
    device: str = "cuda"  # "cuda" or "cpu"
    sample_rate: int = 24000
    chunk_size: int = 1024
    latency_target_ms: int = 200
    enable_duplex: bool = True
    emotion_modulation: bool = True


@dataclass
class MemoryConfig:
    """Mem0 memory system configuration"""
    vector_store: str = "qdrant"  # "qdrant" or "chroma"
    embedding_model: str = "all-MiniLM-L6-v2"
    storage_path: str = "~/.soul/memory"
    max_memories: int = 10000
    search_limit: int = 5
    enable_encryption: bool = True


@dataclass
class SuperGooseConfig:
    """Super-Goose integration configuration"""
    cli_path: str = "super-goose"
    working_directory: str = "."
    event_server: str = "ws://localhost:8080/events"
    agents: Dict[str, bool] = field(default_factory=lambda: {
        "architect": True,
        "coder": True,
        "qa": True,
        "devops": True,
    })
    notifications: Dict[str, bool] = field(default_factory=lambda: {
        "on_completion": True,
        "on_error": True,
        "on_milestone": True,
    })


@dataclass
class OrbConfig:
    """Orb UI configuration"""
    enabled: bool = True
    size: tuple = (200, 200)
    position: str = "bottom-right"  # "top-left", "top-right", "bottom-left", "bottom-right"
    opacity: float = 0.9
    fps: int = 60
    colors: Dict[str, str] = field(default_factory=lambda: {
        "idle": "#4A90E2",
        "listening": "#50C878",
        "thinking": "#9B59B6",
        "speaking": "#F39C12",
        "working": "#E74C3C",
        "alert": "#FF6B6B",
    })


@dataclass
class EmotionConfig:
    """Emotion detection and response configuration"""
    enable_detection: bool = True
    enable_response: bool = True
    sensitivity: float = 0.7  # 0.0 - 1.0
    emotions: Dict[str, Dict[str, float]] = field(default_factory=lambda: {
        "frustrated": {"speed": 0.9, "pitch": 0.95, "add_pause": True},
        "excited": {"speed": 1.1, "pitch": 1.05, "add_laughter": True},
        "confused": {"speed": 0.85, "pitch": 1.0, "add_pause": True},
        "tired": {"speed": 0.9, "pitch": 0.9, "add_pause": False},
        "focused": {"speed": 1.0, "pitch": 1.0, "add_pause": False},
        "celebratory": {"speed": 1.15, "pitch": 1.1, "add_laughter": True},
    })


@dataclass
class SoulConfig:
    """Main Soul configuration"""

    # Core settings
    user_id: str = "default_user"
    language: str = "en"
    wake_word: Optional[str] = "soul"  # None to disable

    # Component configs
    moshi: MoshiConfig = field(default_factory=MoshiConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    super_goose: SuperGooseConfig = field(default_factory=SuperGooseConfig)
    orb: OrbConfig = field(default_factory=OrbConfig)
    emotion: EmotionConfig = field(default_factory=EmotionConfig)

    # System settings
    log_level: str = "INFO"
    log_path: str = "~/.soul/logs"
    backup_enabled: bool = True
    backup_frequency: str = "daily"  # "hourly", "daily", "weekly"

    @classmethod
    def from_yaml(cls, path: Path) -> "SoulConfig":
        """Load configuration from YAML file"""
        if not path.exists():
            # Create default config
            config = cls()
            config.save(path)
            return config

        with open(path, "r") as f:
            data = yaml.safe_load(f)

        return cls(
            user_id=data.get("user_id", "default_user"),
            language=data.get("language", "en"),
            wake_word=data.get("wake_word", "soul"),
            moshi=MoshiConfig(**data.get("moshi", {})),
            memory=MemoryConfig(**data.get("memory", {})),
            super_goose=SuperGooseConfig(**data.get("super_goose", {})),
            orb=OrbConfig(**data.get("orb", {})),
            emotion=EmotionConfig(**data.get("emotion", {})),
            log_level=data.get("log_level", "INFO"),
            log_path=data.get("log_path", "~/.soul/logs"),
            backup_enabled=data.get("backup_enabled", True),
            backup_frequency=data.get("backup_frequency", "daily"),
        )

    def save(self, path: Path) -> None:
        """Save configuration to YAML file"""
        path.parent.mkdir(parents=True, exist_ok=True)

        data = {
            "user_id": self.user_id,
            "language": self.language,
            "wake_word": self.wake_word,
            "moshi": {
                "model_path": self.moshi.model_path,
                "device": self.moshi.device,
                "sample_rate": self.moshi.sample_rate,
                "chunk_size": self.moshi.chunk_size,
                "latency_target_ms": self.moshi.latency_target_ms,
                "enable_duplex": self.moshi.enable_duplex,
                "emotion_modulation": self.moshi.emotion_modulation,
            },
            "memory": {
                "vector_store": self.memory.vector_store,
                "embedding_model": self.memory.embedding_model,
                "storage_path": self.memory.storage_path,
                "max_memories": self.memory.max_memories,
                "search_limit": self.memory.search_limit,
                "enable_encryption": self.memory.enable_encryption,
            },
            "super_goose": {
                "cli_path": self.super_goose.cli_path,
                "working_directory": self.super_goose.working_directory,
                "event_server": self.super_goose.event_server,
                "agents": self.super_goose.agents,
                "notifications": self.super_goose.notifications,
            },
            "orb": {
                "enabled": self.orb.enabled,
                "size": list(self.orb.size),
                "position": self.orb.position,
                "opacity": self.orb.opacity,
                "fps": self.orb.fps,
                "colors": self.orb.colors,
            },
            "emotion": {
                "enable_detection": self.emotion.enable_detection,
                "enable_response": self.emotion.enable_response,
                "sensitivity": self.emotion.sensitivity,
                "emotions": self.emotion.emotions,
            },
            "log_level": self.log_level,
            "log_path": self.log_path,
            "backup_enabled": self.backup_enabled,
            "backup_frequency": self.backup_frequency,
        }

        with open(path, "w") as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)

    @property
    def soul_dir(self) -> Path:
        """Get Soul home directory"""
        return Path.home() / ".soul"

    def setup_directories(self) -> None:
        """Create necessary directories"""
        dirs = [
            self.soul_dir,
            self.soul_dir / "memory",
            self.soul_dir / "models",
            self.soul_dir / "logs" / "conversations",
            self.soul_dir / "backups",
        ]

        for dir_path in dirs:
            dir_path.mkdir(parents=True, exist_ok=True)


def get_default_config() -> SoulConfig:
    """Get default configuration with auto-detection"""
    import torch

    config = SoulConfig()

    # Auto-detect GPU availability
    if not torch.cuda.is_available():
        config.moshi.device = "cpu"
        print("⚠️  No CUDA GPU detected. Using CPU mode (slower performance).")
        print("   For best experience, use NVIDIA GPU with 12GB+ VRAM.")
    else:
        gpu_name = torch.cuda.get_device_name(0)
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1e9
        print(f"✓ GPU detected: {gpu_name} ({gpu_memory:.1f}GB)")

        if gpu_memory < 12:
            print(f"⚠️  Warning: GPU has only {gpu_memory:.1f}GB VRAM.")
            print("   Moshi 7B model requires ~12GB. Consider using CPU mode or smaller model.")

    return config
