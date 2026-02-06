# Quality Enforcement System - Zero Tolerance Standards

**Version**: 1.0
**Date**: 2026-02-06
**Status**: ✅ ACTIVE ENFORCEMENT

---

## Executive Summary

This document establishes **ZERO TOLERANCE** quality standards for the Goose codebase to prevent AI-generated incomplete code, stubs, and shortcuts from entering production.

### Enforcement Layers

```
Layer 1: IDE (Real-time)         → SonarLint + ESLint + rust-analyzer
Layer 2: Pre-commit (Client)     → Husky + lint-staged + Clippy
Layer 3: Pre-push (Client)       → SonarScanner local analysis
Layer 4: CI/CD (Server)          → GitLab pipeline + SonarQube
Layer 5: Code Review (Human)     → Merge request checklist
```

### Blocked Patterns

| Pattern | Detection Method | Action |
|---------|-----------------|--------|
| `TODO:` | ESLint + SonarQube | ❌ BLOCK |
| `FIXME:` | ESLint + SonarQube | ❌ BLOCK |
| `HACK:` | ESLint custom rule | ❌ BLOCK |
| `XXX:` | ESLint custom rule | ❌ BLOCK |
| `STUB` | ESLint custom rule | ❌ BLOCK |
| `todo!()` | Clippy lint | ❌ BLOCK |
| `unimplemented!()` | Clippy lint | ❌ BLOCK |
| Empty functions | ESLint + SonarQube | ❌ BLOCK |
| Coverage < 80% | SonarQube quality gate | ❌ BLOCK |
| Blocker/Critical issues | SonarQube quality gate | ❌ BLOCK |

---

## 1. Quality Standards

### 1.1 Code Quality Requirements

**MANDATORY (Zero Tolerance):**
- ✅ No TODO, FIXME, HACK, XXX, STUB markers
- ✅ No `todo!()`, `unimplemented!()` macros
- ✅ No empty functions or methods
- ✅ No "Not implemented" error messages
- ✅ Test coverage ≥ 80% on new code
- ✅ Zero Blocker/Critical issues
- ✅ Zero ESLint warnings
- ✅ Zero Clippy warnings
- ✅ All tests passing

**RECOMMENDED (Warnings):**
- ⚠️ Documentation coverage ≥ 60%
- ⚠️ Function complexity < 15
- ⚠️ File length < 500 lines
- ⚠️ Function length < 100 lines

### 1.2 AI-Generated Code Detection

**Patterns to Block:**

```typescript
// BLOCKED: Incomplete placeholders
// TODO: implement this
// FIXME: fix later
// HACK: temporary solution
// XXX: needs work
// STUB: replace with real implementation

// BLOCKED: Empty implementations
function doSomething() {
  // implement this later
}

// BLOCKED: Not implemented errors
throw new Error('Not implemented');

// BLOCKED: AI-style verbose naming
function performCompleteValidationAndProcessingOfAllUserInputData() {}
```

**Rust Patterns to Block:**

```rust
// BLOCKED: Incomplete macros
todo!("implement this");
unimplemented!("add logic here");
panic!("fix this");

// BLOCKED: Unreachable code
unreachable!();  // Only if not proven unreachable

// BLOCKED: Unwrapping without error handling
result.unwrap();  // Use ? operator instead
```

---

## 2. SonarQube Setup

### 2.1 Installation (Windows)

```powershell
# 1. Install Java 17 or 21
# Download from: https://www.oracle.com/java/technologies/downloads/
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
[System.Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Java\jdk-17', 'Machine')

# 2. Download SonarQube Community Edition
# https://www.sonarsource.com/products/sonarqube/downloads/

# 3. Extract to C:\sonarqube
Expand-Archive -Path sonarqube-community-*.zip -DestinationPath C:\

# 4. Start SonarQube
C:\sonarqube\bin\windows-x86-64\StartSonar.bat

# 5. Access UI: http://localhost:9000
# Default credentials: admin/admin (CHANGE IMMEDIATELY)

# 6. Install SonarScanner CLI
# Download from: https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/scanners/sonarscanner/
Expand-Archive -Path sonar-scanner-cli-*.zip -DestinationPath C:\

# 7. Add to PATH
$env:PATH += ";C:\sonarscanner\bin"
[System.Environment]::SetEnvironmentVariable('PATH', $env:PATH, 'Machine')
```

### 2.2 Quality Gate Configuration

**Create "Zero Tolerance" Quality Gate:**

1. Navigate to: **Quality Gates** > **Create**
2. Name: "Zero Tolerance Gate"
3. Add conditions:

```yaml
# NEW CODE CONDITIONS
Coverage on New Code: is less than 80%
Duplicated Lines (%) on New Code: is greater than 0%
Maintainability Rating on New Code: is worse than A
Reliability Rating on New Code: is worse than A
Security Rating on New Code: is worse than A

# BLOCKER/CRITICAL ISSUES (Zero Tolerance)
Blocker Issues: is greater than 0
Critical Issues: is greater than 0
Major Issues: is greater than 5  # Allow some flexibility

# CODE SMELLS (Zero Tolerance for TODO/FIXME)
Code Smells: is greater than 0
```

4. Set as default quality gate
5. Disable "fudge factor": **Administration** > **Configuration** > **General Settings** > Uncheck "Ignore duplication and coverage on small changes"

### 2.3 Rules Activation

**Activate TODO/FIXME Detection:**

1. **Quality Profiles** > TypeScript/JavaScript
2. **Activate More** > Search: "TODO"
3. Activate rules:
   - **S1134**: Track uses of "FIXME" tags
   - **S1135**: Track uses of "TODO" tags
   - **S1707**: "TODO" must contain ticket references (optional)

**Activate Strict Rules:**

```bash
# Via API (after authentication)
curl -u admin:your-password -X POST "http://localhost:9000/api/qualityprofiles/activate_rules" \
  -d "targetKey=AY-profile-key" \
  -d "languages=ts,js" \
  -d "severities=BLOCKER,CRITICAL,MAJOR"
```

---

## 3. ESLint Configuration (TypeScript)

### 3.1 Enhanced ESLint Rules

**File: `ui/desktop/.eslintrc.cjs`**

```javascript
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'forge.config.ts', 'vite.*.ts'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', '@typescript-eslint'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],

    // ZERO TOLERANCE: Block incomplete code markers
    'no-warning-comments': ['error', {
      terms: ['todo', 'fixme', 'hack', 'xxx', 'stub', 'unimplemented', 'placeholder', 'implement this', 'not implemented'],
      location: 'anywhere'
    }],

    // ZERO TOLERANCE: Block empty implementations
    'no-empty-function': ['error', {
      allow: []  // No exceptions
    }],
    '@typescript-eslint/no-empty-function': ['error'],
    'no-empty-pattern': 'error',

    // ZERO TOLERANCE: Block "Not implemented" errors
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ThrowStatement > NewExpression[callee.name="Error"][arguments.0.value=/not implemented/i]',
        message: '"Not implemented" errors are not allowed - complete implementation required'
      },
      {
        selector: 'CallExpression[callee.property.name="error"][arguments.0.value=/not implemented/i]',
        message: 'Console.error with "Not implemented" is not allowed'
      }
    ],

    // RECOMMENDED: Documentation requirements
    'require-jsdoc': ['warn', {
      require: {
        FunctionDeclaration: true,
        MethodDefinition: true,
        ClassDeclaration: true
      }
    }],

    // RECOMMENDED: Code quality
    'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
    'complexity': ['warn', { max: 15 }],
  },
};
```

### 3.2 Custom AI Detection Plugin

**File: `ui/desktop/eslint-plugin-ai-detector/index.js`**

```javascript
module.exports = {
  rules: {
    'detect-ai-placeholders': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Detect AI-generated incomplete code patterns',
          category: 'Possible Errors'
        },
        messages: {
          aiPlaceholder: 'AI-generated incomplete code detected: {{pattern}}'
        }
      },
      create(context) {
        const aiPatterns = [
          // Comment patterns
          { regex: /\/\/\s*(TODO|FIXME|HACK|XXX|STUB|IMPLEMENT|PLACEHOLDER|NOT IMPLEMENTED)/i, type: 'comment' },
          { regex: /\/\*\s*(TODO|FIXME|HACK|XXX|STUB|IMPLEMENT|PLACEHOLDER|NOT IMPLEMENTED)/i, type: 'comment' },

          // Code patterns
          { regex: /throw\s+new\s+Error\(['"]Not implemented['"]\)/i, type: 'not-implemented' },
          { regex: /console\.(log|error|warn)\(['"].*(?:TODO|FIXME|IMPLEMENT)/i, type: 'console-todo' },

          // AI-style verbose naming (warn only)
          { regex: /(?:function|const|let|var)\s+(?:perform|execute|do|handle)(?:[A-Z][a-z]+){6,}/i, type: 'verbose-naming', severity: 'warn' }
        ];

        return {
          Program(node) {
            const sourceCode = context.getSourceCode();

            // Check all comments
            sourceCode.getAllComments().forEach(comment => {
              aiPatterns.forEach(pattern => {
                if (pattern.type === 'comment' && pattern.regex.test(comment.value)) {
                  context.report({
                    node: comment,
                    messageId: 'aiPlaceholder',
                    data: { pattern: comment.value.trim() }
                  });
                }
              });
            });

            // Check code text
            const text = sourceCode.getText();
            aiPatterns.filter(p => p.type !== 'comment').forEach(pattern => {
              const match = text.match(pattern.regex);
              if (match) {
                context.report({
                  loc: { line: 1, column: 0 },
                  messageId: 'aiPlaceholder',
                  data: { pattern: match[0] }
                });
              }
            });
          }
        };
      }
    }
  }
};
```

**Usage in `.eslintrc.cjs`:**
```javascript
module.exports = {
  plugins: ['./eslint-plugin-ai-detector'],
  rules: {
    'ai-detector/detect-ai-placeholders': 'error'
  }
};
```

---

## 4. Clippy Configuration (Rust)

### 4.1 Workspace-Level Lints

**File: `Cargo.toml` (workspace root)**

```toml
[workspace.lints.clippy]
# ZERO TOLERANCE: Block incomplete code
todo = "deny"
unimplemented = "deny"
panic = "deny"
unwrap_used = "warn"
expect_used = "warn"

# ZERO TOLERANCE: Code quality
cognitive_complexity = "warn"
too_many_arguments = "warn"
too_many_lines = "warn"

# RECOMMENDED: Documentation
missing_docs = "warn"
missing_docs_in_private_items = "allow"  # Too strict

# RECOMMENDED: Best practices
single_char_pattern = "warn"
unnecessary_wraps = "warn"
```

### 4.2 CI/CD Clippy Command

```bash
# Fail on ALL warnings
cargo clippy --all-targets --all-features -- -D warnings

# Generate JSON report for SonarQube
cargo clippy --all-targets --all-features --message-format=json > target/clippy-report.json
```

---

## 5. Git Hooks (Husky)

### 5.1 Pre-Commit Hook

**File: `.husky/pre-commit`**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Running pre-commit checks..."

# Stage 1: Formatting
echo "📝 Stage 1: Code formatting..."
npx lint-staged
if [ $? -ne 0 ]; then
  echo "❌ Formatting failed!"
  exit 1
fi

# Stage 2: TypeScript Linting
echo "🔍 Stage 2: TypeScript linting..."
cd ui/desktop
npm run lint:check
if [ $? -ne 0 ]; then
  echo "❌ ESLint failed! Fix errors before committing."
  exit 1
fi

# Stage 3: TypeScript Type Checking
npm run typecheck
if [ $? -ne 0 ]; then
  echo "❌ TypeScript errors found!"
  exit 1
fi
cd ../..

# Stage 4: Rust Clippy
echo "🦀 Stage 4: Rust Clippy checks..."
cargo clippy --all-targets --all-features -- -D warnings
if [ $? -ne 0 ]; then
  echo "❌ Clippy failed! Fix warnings before committing."
  exit 1
fi

# Stage 5: Quick Tests
echo "🧪 Stage 5: Running quick tests..."
cd ui/desktop
npm run test:run -- --run --passWithNoTests
if [ $? -ne 0 ]; then
  echo "❌ TypeScript tests failed!"
  exit 1
fi
cd ../..

cargo test --lib --bins --quiet
if [ $? -ne 0 ]; then
  echo "❌ Rust tests failed!"
  exit 1
fi

echo "✅ All pre-commit checks passed!"
```

### 5.2 Pre-Push Hook

**File: `.husky/pre-push`**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🚀 Running pre-push quality checks..."

# Check if SonarQube is running
if ! curl -s http://localhost:9000/api/system/status > /dev/null; then
  echo "⚠️  SonarQube is not running. Skipping quality gate check."
  echo "   Start SonarQube: C:\sonarqube\bin\windows-x86-64\StartSonar.bat"
  exit 0
fi

# TypeScript SonarScanner Analysis
echo "🔍 Analyzing TypeScript code..."
cd ui/desktop
npm run lint -- -f json -o eslint-report.json || true
sonar-scanner \
  -Dsonar.projectKey=goose-ui \
  -Dsonar.sources=src \
  -Dsonar.tests=src \
  -Dsonar.test.inclusions=**/*.test.ts,**/*.test.tsx \
  -Dsonar.qualitygate.wait=true \
  -Dsonar.qualitygate.timeout=300

if [ $? -ne 0 ]; then
  echo "❌ TypeScript quality gate FAILED!"
  echo "   View report: http://localhost:9000/dashboard?id=goose-ui"
  exit 1
fi
cd ../..

# Rust SonarScanner Analysis
echo "🦀 Analyzing Rust code..."
cargo clippy --all-targets --all-features --message-format=json > target/clippy-report.json || true
sonar-scanner \
  -Dsonar.projectKey=goose-rust \
  -Dsonar.sources=crates \
  -Dsonar.tests=crates \
  -Dsonar.test.inclusions=**/tests/**,**/*_test.rs \
  -Dsonar.rust.clippy.enabled=true \
  -Dsonar.rust.clippy.reportPaths=target/clippy-report.json \
  -Dsonar.qualitygate.wait=true \
  -Dsonar.qualitygate.timeout=300

if [ $? -ne 0 ]; then
  echo "❌ Rust quality gate FAILED!"
  echo "   View report: http://localhost:9000/dashboard?id=goose-rust"
  exit 1
fi

echo "✅ All quality gates passed!"
echo "   TypeScript: http://localhost:9000/dashboard?id=goose-ui"
echo "   Rust: http://localhost:9000/dashboard?id=goose-rust"
```

---

## 6. GitLab CI/CD Pipeline

### 6.1 Complete Pipeline Configuration

**File: `.gitlab-ci.yml`**

```yaml
stages:
  - lint
  - test
  - quality
  - build

variables:
  SONAR_USER_HOME: "${CI_PROJECT_DIR}/.sonar"
  GIT_DEPTH: "0"  # Full history for accurate blame
  SONAR_HOST_URL: "http://sonarqube.local:9000"  # Update with your SonarQube URL
  SONAR_TOKEN: "${SONAR_TOKEN}"  # Set in GitLab CI/CD variables

# ==================== LINTING ====================

lint-typescript:
  stage: lint
  image: node:24-alpine
  cache:
    paths:
      - ui/desktop/node_modules/
  script:
    - cd ui/desktop
    - npm ci
    - npm run lint:check
    - npm run typecheck
  allow_failure: false
  only:
    - merge_requests
    - main

lint-rust:
  stage: lint
  image: rust:latest
  cache:
    paths:
      - target/
  before_script:
    - rustup component add clippy
  script:
    - cargo clippy --all-targets --all-features -- -D warnings
  allow_failure: false
  only:
    - merge_requests
    - main

# ==================== TESTING ====================

test-typescript:
  stage: test
  image: node:24-alpine
  cache:
    paths:
      - ui/desktop/node_modules/
  script:
    - cd ui/desktop
    - npm ci
    - npm run test:coverage
  coverage: '/Lines\s*:\s*(\d+\.\d+)%/'
  artifacts:
    when: always
    paths:
      - ui/desktop/coverage/
    reports:
      coverage_report:
        coverage_format: cobertura
        path: ui/desktop/coverage/cobertura-coverage.xml
  allow_failure: false
  only:
    - merge_requests
    - main

test-rust:
  stage: test
  image: rust:latest
  cache:
    paths:
      - target/
  before_script:
    - cargo install cargo-tarpaulin
  script:
    - cargo test --all-features
    - cargo tarpaulin --out Xml --output-dir coverage --all-features
  coverage: '/(\d+\.\d+)% coverage/'
  artifacts:
    when: always
    paths:
      - coverage/
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura.xml
  allow_failure: false
  only:
    - merge_requests
    - main

# ==================== SONARQUBE ANALYSIS ====================

sonarqube-typescript:
  stage: quality
  image: sonarsource/sonar-scanner-cli:latest
  cache:
    paths:
      - .sonar/cache
  dependencies:
    - test-typescript
  script:
    - cd ui/desktop
    - npm ci
    - npm run lint -- -f json -o eslint-report.json || true
    - cd ..
    - |
      sonar-scanner \
        -Dsonar.projectKey=goose-ui \
        -Dsonar.sources=ui/desktop/src \
        -Dsonar.tests=ui/desktop/src \
        -Dsonar.test.inclusions=**/*.test.ts,**/*.test.tsx \
        -Dsonar.typescript.lcov.reportPaths=ui/desktop/coverage/lcov.info \
        -Dsonar.eslint.reportPaths=ui/desktop/eslint-report.json \
        -Dsonar.qualitygate.wait=true \
        -Dsonar.qualitygate.timeout=300
  allow_failure: false
  only:
    - merge_requests
    - main

sonarqube-rust:
  stage: quality
  image: sonarsource/sonar-scanner-cli:latest
  cache:
    paths:
      - .sonar/cache
  dependencies:
    - test-rust
  before_script:
    - apk add --no-cache rust cargo
    - rustup component add clippy
  script:
    - cargo clippy --all-targets --all-features --message-format=json > target/clippy-report.json || true
    - |
      sonar-scanner \
        -Dsonar.projectKey=goose-rust \
        -Dsonar.sources=crates \
        -Dsonar.tests=crates \
        -Dsonar.test.inclusions=**/tests/**,**/*_test.rs \
        -Dsonar.rust.clippy.enabled=true \
        -Dsonar.rust.clippy.reportPaths=target/clippy-report.json \
        -Dsonar.qualitygate.wait=true \
        -Dsonar.qualitygate.timeout=300
  allow_failure: false
  only:
    - merge_requests
    - main

# ==================== SECURITY AUDIT ====================

security-audit:
  stage: quality
  image: rust:latest
  before_script:
    - cargo install cargo-audit
  script:
    # Node.js audit
    - cd ui/desktop
    - npm ci
    - npm audit --audit-level=high
    - cd ../..

    # Rust audit
    - cargo audit
  allow_failure: false
  only:
    - merge_requests
    - main

# ==================== BUILD ====================

build-production:
  stage: build
  image: node:24-alpine
  dependencies:
    - sonarqube-typescript
    - sonarqube-rust
  script:
    - cd ui/desktop
    - npm ci
    - npm run package
  artifacts:
    paths:
      - ui/desktop/out/
  only:
    - main
```

### 6.2 GitLab CI/CD Variables

**Configure in GitLab: Settings > CI/CD > Variables**

| Variable | Value | Masked | Protected |
|----------|-------|--------|-----------|
| `SONAR_TOKEN` | `your-sonarqube-token` | ✅ | ✅ |
| `SONAR_HOST_URL` | `http://sonarqube.local:9000` | ❌ | ❌ |

---

## 7. SonarQube Project Configuration

### 7.1 TypeScript Configuration

**File: `ui/desktop/sonar-project.properties`**

```properties
# Project identification
sonar.projectKey=goose-ui
sonar.projectName=Goose Desktop UI
sonar.projectVersion=1.23.0

# Source code
sonar.sources=src
sonar.tests=src
sonar.test.inclusions=**/*.test.ts,**/*.test.tsx,**/*.spec.ts

# Coverage
sonar.typescript.lcov.reportPaths=coverage/lcov.info
sonar.javascript.lcov.reportPaths=coverage/lcov.info

# ESLint reports
sonar.eslint.reportPaths=eslint-report.json

# Exclusions
sonar.exclusions=**/node_modules/**,**/dist/**,**/out/**,**/*.spec.ts,**/*.d.ts
sonar.coverage.exclusions=**/*.test.ts,**/*.test.tsx,**/*.spec.ts,src/test/**

# Quality gate
sonar.qualitygate.wait=true
sonar.qualitygate.timeout=300

# Language
sonar.language=ts

# Additional settings
sonar.sourceEncoding=UTF-8
sonar.scm.provider=git
```

### 7.2 Rust Configuration

**File: `sonar-project.properties` (project root)**

```properties
# Project identification
sonar.projectKey=goose-rust
sonar.projectName=Goose Rust Backend
sonar.projectVersion=1.23.0

# Source code
sonar.sources=crates
sonar.tests=crates
sonar.test.inclusions=**/tests/**,**/*_test.rs,**/*_tests.rs

# Rust configuration
sonar.rust.clippy.enabled=true
sonar.rust.clippy.reportPaths=target/clippy-report.json
sonar.rust.cargo.manifestPaths=Cargo.toml

# Coverage (if using cargo-tarpaulin)
sonar.rust.coverage.reportPaths=coverage/cobertura.xml

# Exclusions
sonar.exclusions=**/target/**,**/build/**,**/*.generated.rs
sonar.coverage.exclusions=**/tests/**,**/*_test.rs,**/*_tests.rs

# Quality gate
sonar.qualitygate.wait=true
sonar.qualitygate.timeout=300

# Language
sonar.language=rust

# Additional settings
sonar.sourceEncoding=UTF-8
sonar.scm.provider=git
```

---

## 8. IDE Integration

### 8.1 VSCode Extensions

**File: `.vscode/extensions.json`**

```json
{
  "recommendations": [
    "sonarsource.sonarlint-vscode",
    "dbaeumer.vscode-eslint",
    "rust-lang.rust-analyzer",
    "esbenp.prettier-vscode",
    "streetsidesoftware.code-spell-checker",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

### 8.2 VSCode Settings

**File: `.vscode/settings.json`**

```json
{
  // SonarLint Connected Mode
  "sonarlint.connectedMode.connections.sonarqube": [
    {
      "serverUrl": "http://localhost:9000",
      "token": "your-token-here"
    }
  ],
  "sonarlint.connectedMode.project": {
    "projectKey": "goose-ui"
  },

  // ESLint
  "eslint.enable": true,
  "eslint.validate": ["typescript", "typescriptreact"],
  "eslint.run": "onType",
  "eslint.options": {
    "maxWarnings": 0
  },

  // Rust Analyzer
  "rust-analyzer.check.command": "clippy",
  "rust-analyzer.check.allTargets": true,
  "rust-analyzer.check.extraArgs": ["--", "-D", "warnings"],

  // Auto-fix on save
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "explicit"
  },

  // Format on save
  "editor.formatOnSave": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer"
  },

  // Spell checker
  "cSpell.words": [
    "goose",
    "sonarqube",
    "clippy"
  ]
}
```

---

## 9. Merge Request Checklist

### 9.1 Template

**File: `.gitlab/merge_request_templates/default.md`**

```markdown
## Description
<!-- Describe your changes in detail -->

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Quality Checklist

### ✅ ZERO TOLERANCE REQUIREMENTS (Must Pass)
- [ ] No TODO/FIXME/HACK/XXX comments
- [ ] No `todo!()` or `unimplemented!()` macros
- [ ] No empty functions or incomplete implementations
- [ ] SonarQube quality gate passed
- [ ] All tests passing (TypeScript + Rust)
- [ ] Test coverage ≥ 80%
- [ ] ESLint: 0 warnings
- [ ] Clippy: 0 warnings
- [ ] No Blocker/Critical issues

### 📋 CODE QUALITY
- [ ] Code follows project style guidelines
- [ ] Documentation added/updated
- [ ] No code duplication
- [ ] Function/file complexity acceptable
- [ ] Error handling implemented

### 🔒 SECURITY
- [ ] No hardcoded secrets or credentials
- [ ] Input validation implemented
- [ ] Dependencies audited (`npm audit`, `cargo audit`)
- [ ] No security vulnerabilities introduced

### 🧪 TESTING
- [ ] Unit tests added/updated
- [ ] Integration tests added (if applicable)
- [ ] E2E tests added (if applicable)
- [ ] Manual testing completed
- [ ] Edge cases covered

### 📚 DOCUMENTATION
- [ ] README updated (if needed)
- [ ] API documentation updated (if needed)
- [ ] Inline comments added for complex logic
- [ ] JSDoc/Rust docs added

## Screenshots (if applicable)
<!-- Add screenshots here -->

## Related Issues
Closes #

## Checklist Before Merge
- [ ] All CI/CD pipelines passing
- [ ] Approved by at least 1 reviewer
- [ ] All discussions resolved
- [ ] Branch rebased on latest main
```

---

## 10. Testing the System

### 10.1 Test Case: Incomplete Code Detection

**Step 1: Create test file with incomplete code**

```typescript
// ui/desktop/src/test-incomplete.ts

// TODO: implement this function
export function testFunction() {
  // FIXME: add validation
  throw new Error('Not implemented');
}

// HACK: temporary solution
export function quickFix() {
  return {};
}
```

**Expected Results:**

1. **ESLint** (immediate):
   ```
   ❌ src/test-incomplete.ts:3:1
      error: TODO comment detected (no-warning-comments)

   ❌ src/test-incomplete.ts:5:3
      error: FIXME comment detected (no-warning-comments)

   ❌ src/test-incomplete.ts:6:3
      error: "Not implemented" error (no-restricted-syntax)

   ❌ src/test-incomplete.ts:10:1
      error: HACK comment detected (no-warning-comments)
   ```

2. **Pre-commit Hook** (blocks commit):
   ```bash
   ❌ ESLint failed! Fix errors before committing.
   ```

3. **SonarQube** (if pushed):
   ```
   ❌ Quality gate failed
   - Code smells: 3 (TODO, FIXME, HACK)
   - Blocker issues: 1 (Empty function)
   ```

4. **GitLab CI/CD** (blocks merge):
   ```yaml
   ❌ lint-typescript: FAILED
   ❌ sonarqube-typescript: FAILED
   ```

### 10.2 Test Case: Quality Gate Success

**Good Code Example:**

```typescript
/**
 * Authenticates a user with username and password.
 * @param username - User's username
 * @param password - User's password
 * @returns Authentication token
 * @throws {AuthenticationError} If credentials are invalid
 */
export async function authenticateUser(
  username: string,
  password: string
): Promise<string> {
  if (!username || !password) {
    throw new AuthenticationError('Username and password required');
  }

  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw new AuthenticationError('Invalid credentials');
  }

  const { token } = await response.json();
  return token;
}
```

**Expected Results:**
- ✅ ESLint: 0 errors
- ✅ TypeScript: 0 errors
- ✅ SonarQube: Quality gate passed
- ✅ GitLab CI/CD: All checks passed

---

## 11. Maintenance Schedule

### Daily
- [ ] Monitor SonarQube quality gate failures
- [ ] Review failed CI/CD pipelines
- [ ] Address new issues introduced

### Weekly
- [ ] Review SonarQube technical debt
- [ ] Update quality gate thresholds (if needed)
- [ ] Check SonarQube disk usage
- [ ] Review security audit results

### Monthly
- [ ] Update SonarScanner CLI
- [ ] Review and adjust ESLint/Clippy rules
- [ ] Analyze code quality trends
- [ ] Update documentation

### Quarterly
- [ ] Upgrade SonarQube Community Edition
- [ ] Review obsolete rules
- [ ] Audit dependencies
- [ ] Team training on new rules

---

## 12. Troubleshooting

### Issue: SonarQube Quality Gate Skipped

**Problem**: Pre-push hook skips quality gate check

**Solution**:
```bash
# Verify SonarQube is running
curl http://localhost:9000/api/system/status

# Start SonarQube if not running
C:\sonarqube\bin\windows-x86-64\StartSonar.bat

# Re-run pre-push hook
git push
```

### Issue: ESLint False Positives

**Problem**: ESLint flags valid TODO in test documentation

**Solution**: Add exception to `.eslintrc.cjs`:
```javascript
{
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.test.tsx"],
      "rules": {
        "no-warning-comments": "off"  // Allow TODO in tests
      }
    }
  ]
}
```

### Issue: Clippy Warning in Generated Code

**Problem**: Clippy warns about code in `target/` directory

**Solution**: Already excluded by default. Verify `.gitignore`:
```gitignore
target/
```

---

## 13. Resources

### Documentation
- [SonarQube Setup Guide](https://docs.sonarsource.com/sonarqube-community-build/)
- [ESLint Rules](https://eslint.org/docs/latest/rules/)
- [Clippy Lints](https://rust-lang.github.io/rust-clippy/master/)
- [Husky Git Hooks](https://typicode.github.io/husky/)

### Tools
- [SonarQube Community Edition](https://www.sonarsource.com/products/sonarqube/downloads/)
- [SonarScanner CLI](https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/scanners/sonarscanner/)
- [cargo-audit](https://github.com/rustsec/rustsec/tree/main/cargo-audit)
- [cargo-tarpaulin](https://github.com/xd009642/tarpaulin)

---

## 14. Conclusion

This **Zero Tolerance Quality Enforcement System** provides:

✅ **Multi-layer defense** against AI shortcuts
✅ **Automated enforcement** at every stage
✅ **Real-time feedback** in IDE
✅ **Comprehensive detection** of incomplete code
✅ **Enterprise-grade quality gates**
✅ **Security auditing** integration
✅ **Mandatory test coverage** (≥80%)

**No AI-generated stubs, TODOs, or incomplete code will enter production.**

---

**Document Version**: 1.0
**Last Updated**: 2026-02-06
**Status**: ✅ ACTIVE ENFORCEMENT
