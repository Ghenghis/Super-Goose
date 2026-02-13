---
title: Slash Commands Reference
sidebar_position: 21
---

# Slash Commands Reference

Super-Goose extends goose with additional slash commands for core switching, learning, self-improvement, and autonomous operation. These commands are available during any interactive session.

## Core Commands

Control which agentic core handles your tasks.

| Command | Action |
|:--|:--|
| `/cores` | List all 6 cores with descriptions and capabilities |
| `/core freeform` | Default LLM conversation loop |
| `/core structured` | Code-Test-Fix finite state machine |
| `/core orchestrator` | Multi-agent specialist coordination |
| `/core swarm` | Parallel agent pool for large refactors |
| `/core workflow` | Template-based task pipelines |
| `/core adversarial` | Coach/Player adversarial review |

**Aliases**: `struct`, `orch`, `wf`, `adv`, `coach`, `parallel`, `ctf`

## Learning Commands

Query the persistent learning engine.

| Command | Action |
|:--|:--|
| `/experience` | Show recent task experiences across sessions |
| `/experience stats` | Show per-core performance statistics |
| `/skills` | List verified reusable strategies from the SkillLibrary |
| `/insights` | Extract and display pattern insights from ExperienceStore |

## Self-Improvement Commands

Trigger the OTA self-build pipeline.

| Command | Action |
|:--|:--|
| `/self-improve` | Run the full OTA pipeline (plan, apply, test, build, swap) |
| `/self-improve --dry-run` | Propose improvements without applying them |
| `/self-improve status` | Show current OTA pipeline status and history |

## Autonomous Daemon Commands

Control the background autonomous daemon.

| Command | Action |
|:--|:--|
| `/autonomous start` | Start the autonomous daemon |
| `/autonomous stop` | Stop the daemon gracefully |
| `/autonomous status` | Show daemon status, scheduled tasks, and recent actions |

## Standard goose Commands

These commands are inherited from upstream goose.

| Command | Action |
|:--|:--|
| `/model <name>` | Switch LLM provider/model at runtime |
| `/pause` | Pause agent execution |
| `/resume` | Resume paused execution |
| `/breakpoint <pattern>` | Set a tool-level breakpoint |
| `/inspect` | Inspect current agent state |
| `/compact` | Trigger context compaction |
| `/memory stats` | Show memory system statistics |
| `/memory clear` | Clear working memory |
