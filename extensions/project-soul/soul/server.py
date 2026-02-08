"""
Main Soul server - coordinates all components
"""

import asyncio
from pathlib import Path
from typing import Optional
from loguru import logger

from .config import SoulConfig
from .moshi_client import MoshiClient
from .memory import SoulMemory
from .liaison import SuperGooseLiaison
from .emotion import EmotionEngine


class SoulServer:
    """Main Soul server orchestrating all components"""

    def __init__(self, config: Optional[SoulConfig] = None):
        self.config = config or SoulConfig()
        self.running = False

        # Components (initialized in start())
        self.moshi: Optional[MoshiClient] = None
        self.memory: Optional[SoulMemory] = None
        self.liaison: Optional[SuperGooseLiaison] = None
        self.emotion: Optional[EmotionEngine] = None

        # Setup logging
        self._setup_logging()

    def _setup_logging(self) -> None:
        """Configure logging"""
        log_path = Path(self.config.log_path).expanduser()
        log_path.mkdir(parents=True, exist_ok=True)

        logger.add(
            log_path / "soul.log",
            rotation="1 day",
            retention="30 days",
            level=self.config.log_level,
        )

    async def start(self) -> None:
        """Start Soul server and all components"""
        logger.info("🌌 Starting Project Soul...")

        try:
            # Setup directories
            self.config.setup_directories()

            # Initialize components
            logger.info("Initializing Moshi voice engine...")
            self.moshi = MoshiClient(self.config.moshi)

            logger.info("Initializing memory system...")
            self.memory = SoulMemory(self.config.memory, self.config.user_id)
            await self.memory.initialize()

            logger.info("Initializing Super-Goose liaison...")
            self.liaison = SuperGooseLiaison(self.config.super_goose)

            logger.info("Initializing emotion engine...")
            self.emotion = EmotionEngine(self.config.emotion)

            self.running = True
            logger.info("✓ Soul is alive and ready!")

            # Start main loop
            await self._main_loop()

        except KeyboardInterrupt:
            logger.info("Received shutdown signal")
        except Exception as e:
            logger.error(f"Fatal error: {e}", exc_info=True)
        finally:
            await self.stop()

    async def stop(self) -> None:
        """Stop Soul server and cleanup"""
        logger.info("Shutting down Soul...")
        self.running = False

        if self.moshi:
            await self.moshi.close()

        if self.memory:
            await self.memory.close()

        if self.liaison:
            await self.liaison.close()

        logger.info("✓ Soul stopped gracefully")

    async def _main_loop(self) -> None:
        """Main processing loop"""
        logger.info("Entering main loop...")

        while self.running:
            try:
                # Listen for user input
                audio_input = await self.moshi.listen()

                if audio_input:
                    # Detect emotion from voice
                    user_emotion = await self.emotion.detect_user_emotion(audio_input)
                    logger.debug(f"User emotion: {user_emotion}")

                    # Process through Moshi (speech-to-speech)
                    intent, context = await self.moshi.process(audio_input)

                    # Retrieve relevant memories
                    memories = await self.memory.recall(context)

                    # Parse intent and generate task
                    task = await self.liaison.parse_intent(
                        intent=intent,
                        context=context,
                        memories=memories,
                    )

                    if task:
                        # Execute task with Super-Goose
                        result = await self.liaison.execute_task(task)

                        # Generate response with appropriate emotion
                        response_params = await self.emotion.modulate_response(
                            result=result,
                            user_emotion=user_emotion,
                        )

                        # Speak response
                        await self.moshi.speak(result.message, response_params)

                        # Store conversation in memory
                        await self.memory.remember({
                            "user_input": intent,
                            "soul_response": result.message,
                            "emotion": user_emotion,
                            "task": task.to_dict(),
                            "result": result.to_dict(),
                        })

                await asyncio.sleep(0.01)  # Small sleep to prevent tight loop

            except Exception as e:
                logger.error(f"Error in main loop: {e}", exc_info=True)
                await asyncio.sleep(1)  # Back off on error

    async def proactive_check(self) -> None:
        """Check for proactive suggestions (called periodically)"""
        if not self.liaison:
            return

        suggestion = await self.liaison.proactive_suggestion()
        if suggestion:
            logger.info(f"Proactive suggestion: {suggestion}")
            await self.moshi.speak(suggestion)


async def run_soul(config_path: Optional[Path] = None) -> None:
    """Main entry point to run Soul"""
    # Load config
    if config_path is None:
        config_path = Path.home() / ".soul" / "config.yaml"

    config = SoulConfig.from_yaml(config_path)

    # Create and start server
    server = SoulServer(config)
    await server.start()


if __name__ == "__main__":
    asyncio.run(run_soul())
