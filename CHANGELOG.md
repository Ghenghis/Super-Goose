# Changelog

All notable changes to Super-Goose will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 🔄 Complete infrastructure rebranding from block/goose to Ghenghis/Super-Goose
- ✨ Super-Goose Evolution (EvoAgentX) - Self-improving agent system
- ✨ Super-Goose Adversarial (Coach/Player) - Dual-agent training system
- ✨ Super-Goose Team (ALMAS) - Multi-agent collaboration framework
- 📚 Comprehensive documentation for all new agent systems
- 🐛 Bug report and feature request issue templates
- 📖 Contributing guide for fork development
- 🔐 GitHub Secrets documentation

### Changed
- 🏗️ All GitHub Actions workflows updated to use Ghenghis/Super-Goose
- 🐳 Container images moved to ghcr.io/ghenghis/super-goose
- 📦 Desktop app branding updated in package.json and forge.config.ts
- 🔧 Code signing disabled temporarily (certificate pending approval)
- 📝 README and documentation links updated to Ghenghis organization

### Fixed
- 🐛 21 Rust Clippy warnings across agent modules
- 🐛 TypeScript type error in autoUpdater.ts
- 🔄 Upstream sync workflow (now properly syncs from block/goose)
- 🗑️ Removed SonarQube artifacts (.scannerwork directory)
- 📋 Git repository cleanup (removed garbage files, committed all changes)

### Merged from Upstream (block/goose)
- Remove clippy too_many_lines lint (b18120bec)
- Refactor: move disable_session_naming into AgentConfig (948cb91d5)
- Add global config switch to disable automatic session naming (96f903d5d)
- Docs: add blog post - 8 Things You Didn't Know About Code Mode (47cfea678)

---

## Release History

### [1.24.0] - 2026-02-07

**Phase 1 Complete: Critical Infrastructure Repaired**

This release marks the completion of Phase 1 fixes for the Super-Goose fork, establishing a solid foundation for independent releases and development.

#### Infrastructure
- ✅ All 13 workflows rebranded to Ghenghis/Super-Goose
- ✅ Container images updated to ghcr.io/ghenghis/super-goose
- ✅ Repository checks updated across all workflows
- ✅ Upstream synchronization configured and tested
- ✅ 0 commits behind block/goose (fully synchronized)

#### Code Quality
- ✅ 21 Clippy warnings fixed across agent modules
- ✅ 0 compilation errors
- ✅ 0 TypeScript errors (autoUpdater type mismatch resolved)
- ✅ 18/18 tests passing
- ✅ 100% commit message quality (conventional commits)

#### Documentation
- ✅ 40+ comprehensive markdown files added
- ✅ Professional fix plan documentation
- ✅ Execution summary and status reports
- ✅ Workflow audit and fix scripts

#### Commits
1. `aba74e2fa` - fix: resolve 21 Clippy warnings
2. `c8efa747e` - docs: add comprehensive documentation
3. `76a950a8e` - fix(desktop): TypeScript error in autoUpdater
4. `68a39bb47` - chore: SonarQube cleanup
5. `13f90e285` - fix(workflows): rebrand to Ghenghis/Super-Goose
6. `eb08b1707` - chore: merge upstream from block/goose
7. `245a039ba` - feat(desktop): update branding metadata

#### Known Issues
- ⚠️ Code signing disabled (certificate pending SignPath approval)
- ⚠️ S3 uploads disabled (no bucket configured)
- ⚠️ 8 Dependabot vulnerabilities (planned for Phase 3)

#### Next Steps
- Phase 2: Configure high priority items (secrets, signing, CI optimization)
- Phase 3: Medium priority polish (branding, tests, documentation)
- Phase 4: Low priority enhancements (optional workflows)

---

## Upstream Compatibility

Super-Goose maintains compatibility with [block/goose](https://github.com/block/goose) upstream and regularly merges enhancements. The fork adds:

- **Super-Goose Evolution (EvoAgentX)**: Self-improving agent system
- **Super-Goose Adversarial (Coach/Player)**: Dual-agent training
- **Super-Goose Team (ALMAS)**: Multi-agent collaboration

All upstream features are preserved and enhanced.

---

## Links

- **Repository**: https://github.com/Ghenghis/Super-Goose
- **Actions**: https://github.com/Ghenghis/Super-Goose/actions
- **Issues**: https://github.com/Ghenghis/Super-Goose/issues
- **Upstream**: https://github.com/block/goose

---

**Maintained by Ghenghis**
