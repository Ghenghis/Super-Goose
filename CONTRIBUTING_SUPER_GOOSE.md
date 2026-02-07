# Contributing to Super-Goose

Thank you for your interest in contributing! This enhanced fork maintains compatibility
with upstream [block/goose](https://github.com/block/goose) while adding Super-Goose capabilities.

## 🍴 Fork Relationship

**Upstream:** [block/goose](https://github.com/block/goose)
**This Fork:** [Ghenghis/Super-Goose](https://github.com/Ghenghis/Super-Goose)

**Enhancements:**
- ✨ Super-Goose self-evolution (EvoAgentX)
- 🎯 ALMAS team specialization (5 roles)
- 🏆 Production-grade quality (97%+ coverage target)
- 🤼 Coach/Player adversarial QA

We regularly sync with upstream and contribute improvements back.

---

## 🚀 Quick Start

### 1. Fork & Clone
```bash
git clone https://github.com/YOUR_USERNAME/Super-Goose.git
cd Super-Goose
```

### 2. Add Remotes
```bash
git remote add upstream https://github.com/Ghenghis/Super-Goose.git
git remote add block https://github.com/block/goose.git
```

### 3. Install Dependencies
```bash
# Rust
rustup update stable

# Node.js (desktop app)
cd ui/desktop && npm install
```

### 4. Build & Test
```bash
# Rust
cd crates
cargo build
cargo test

# Desktop
cd ui/desktop
npm run build
npm test
```

---

## 📝 Making Changes

### Branch Naming
- `feature/` - New capabilities
- `fix/` - Bug fixes
- `docs/` - Documentation
- `refactor/` - Code improvements
- `test/` - Test additions

### Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): brief description

Detailed explanation of changes.

Fixes #123
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples:**
```
feat(evolution): add memory-informed prompt optimization
fix(agents): resolve duplicate import in mod.rs
docs(readme): update installation instructions
```

### Pull Request Process
1. Create feature branch from `main`
2. Make changes with tests
3. Run quality checks:
   ```bash
   cargo fmt --check
   cargo clippy -- -D warnings
   cargo test
   ```
4. Push and create PR
5. Address review feedback
6. Maintainer will merge

---

## 🧪 Testing Requirements

- Unit tests for new functions
- Integration tests for features
- Maintain 97%+ coverage goal
- All tests must pass

```bash
# Run all tests
cargo test

# With coverage
cargo llvm-cov

# Desktop tests
cd ui/desktop && npm test
```

---

## 🔍 Code Quality Standards

### Rust
- **Format:** `cargo fmt`
- **Lint:** `cargo clippy -- -D warnings`
- **Zero warnings policy**
- Follow [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)

### TypeScript
- **Format:** Prettier
- **Lint:** ESLint with `--max-warnings 0`
- **Type-safe code**
- Document public APIs

### Quality Checks
```bash
# Run all checks
cargo fmt --check
cargo clippy -- -D warnings
cargo test

cd ui/desktop
npm run lint:check
npm run test:run
```

---

## 🎯 Super-Goose Features

When adding Super-Goose enhancements:

1. **Document** in `docs/super-goose/`
2. **Test** in `tests/super-goose/`
3. **Update** CHANGELOG.md
4. **Tag** with `super-goose` label

### Feature Areas
- **Evolution:** Memory-informed optimization
- **Adversarial:** Coach/Player system
- **Team:** ALMAS specialization
- **Quality:** Validation and enforcement

---

## 🔄 Syncing with Upstream

To sync your fork with upstream block/goose:

```bash
# Fetch upstream
git fetch block

# Merge (favor Super-Goose enhancements)
git checkout main
git merge block/main

# Resolve conflicts
# - Keep Super-Goose features
# - Accept upstream improvements
# - Document decisions

git push origin main
```

---

## 🐛 Reporting Bugs

Use [GitHub Issues](https://github.com/Ghenghis/Super-Goose/issues/new) with:

- Clear description
- Steps to reproduce
- Expected vs actual behavior
- Version information
- Logs if applicable

### Bug Report Template
```markdown
**Component:** CLI / Desktop / Super-Goose Features

**Description:** Brief description

**Steps to Reproduce:**
1. Run command X
2. Observe Y
3. Expected Z

**Version:** v1.23.0
**OS:** Windows 11 / macOS / Linux
```

---

## 💡 Feature Requests

We welcome ideas! Please:

1. Check [existing issues](https://github.com/Ghenghis/Super-Goose/issues)
2. Open new issue with:
   - Use case description
   - Expected benefits
   - Implementation ideas
3. Use `enhancement` label

---

## 📜 License

Apache 2.0 - Same as upstream block/goose

---

## 🙏 Recognition

- **Original Goose:** Block team
- **Super-Goose:** Ghenghis
- **Contributors:** Listed in AUTHORS.md

---

## 💬 Questions?

- Open a [Discussion](https://github.com/Ghenghis/Super-Goose/discussions)
- Join community chat (if available)
- Tag maintainers in issues

---

**Happy Contributing!** 🚀
