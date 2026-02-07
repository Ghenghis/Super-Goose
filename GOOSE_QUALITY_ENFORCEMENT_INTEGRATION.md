# 🔒 Goose Quality Enforcement Integration Plan

**CRITICAL REQUIREMENT:** Goose MUST use SonarQube and validation system ALWAYS during project building.

---

## 🎯 Integration Points

### 1. **Before Reporting "Done"** (MANDATORY)

When Goose completes a coding task, it must:

```rust
// In crates/goose/src/agents/done_gate.rs or similar

use crate::quality::{MultiPassValidator, ValidationLogger};

async fn before_report_done(modified_files: &[String]) -> Result<(), String> {
    println!("🔍 Running mandatory quality validation...");

    let mut logger = ValidationLogger::new()?;
    logger.start_validation_run("goose-completion-check")?;

    let mut validator = MultiPassValidator::new();

    match validator.validate_with_fixes(modified_files).await {
        Ok(report) => {
            if !report.verification.is_clean() {
                logger.generate_summary()?;
                return Err(format!(
                    "❌ Validation FAILED after {} iterations.\n\
                     Check validation-logs/ for details.\n\
                     Goose cannot report 'done' until validation passes.",
                    report.iterations
                ));
            }

            println!("✅ All validation checks passed!");
            logger.generate_summary()?;
            Ok(())
        },
        Err(e) => {
            logger.generate_summary()?;
            Err(format!("❌ Validation error: {}", e))
        }
    }
}
```

### 2. **During Build Steps** (MANDATORY)

Hook into build commands:

```rust
// When Goose runs npm build, cargo build, etc.

async fn execute_build_command(cmd: &str) -> Result<(), String> {
    // Run the build
    let build_result = run_command(cmd).await?;

    // Immediately run SonarQube analysis
    println!("🔍 Running SonarQube analysis post-build...");
    run_sonarqube_analysis().await?;

    // Check quality gate
    let quality_gate = check_sonarqube_quality_gate().await?;

    if quality_gate != "OK" {
        return Err("❌ SonarQube quality gate FAILED. Build rejected.");
    }

    Ok(())
}
```

### 3. **On Every Code Change** (RECOMMENDED)

Add to file save/modification hooks:

```rust
// After Goose writes code to files

async fn after_code_written(files: &[String]) -> Result<(), String> {
    // Quick validation
    let validator = PostCodeValidator::new();
    let report = validator.validate(files).await?;

    if !report.is_clean() {
        println!("⚠️  Quick validation found {} issues", report.total_issues());
        // Log but don't block (full validation happens at completion)
    }

    Ok(())
}
```

### 4. **Pre-Commit Hooks** (ENFORCED)

Already configured in `.husky/pre-commit`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run validation before commit
npm run lint:check || exit 1

# Scan for incomplete markers
echo "Checking for TODO/FIXME/HACK markers..."
if grep -r "TODO\|FIXME\|HACK" --include="*.ts" --include="*.tsx" --include="*.rs" .; then
    echo "❌ Found incomplete markers. Commit blocked."
    exit 1
fi

echo "✅ Pre-commit validation passed"
```

---

## 🔧 Implementation Steps

### Step 1: Update `.goosehints` (CRITICAL)

```markdown
### MANDATORY QUALITY ENFORCEMENT

**CRITICAL: Goose MUST run validation before reporting "done"**

Before reporting completion, Goose MUST:
1. Run multi-pass validation on all modified files
2. Check SonarQube quality gate status
3. Verify all event handlers are implemented
4. Ensure all components are wired
5. Confirm all tests pass

**DO NOT report "done" until:**
- ✅ Multi-pass validation returns clean
- ✅ SonarQube quality gate = OK
- ✅ No empty event handlers
- ✅ No TODO/FIXME/HACK markers in production code
- ✅ All imports/exports valid
- ✅ All tests passing

**Command sequence for every completion:**
```powershell
# 1. Quick validation
.\scripts\quick-validate.ps1

# 2. If clean, comprehensive validation
.\scripts\ultimate-validation.ps1

# 3. Only if BOTH pass, report "done"
```

### Step 2: Create Auto-Validation Extension

```rust
// crates/goose/src/extensions/quality_enforcer.rs

pub struct QualityEnforcerExtension {
    validator: MultiPassValidator,
    sonarqube_config: SonarQubeConfig,
}

impl Extension for QualityEnforcerExtension {
    async fn on_task_completion(&self, ctx: &mut Context) -> Result<()> {
        // Force validation before allowing "done"
        let files = ctx.get_modified_files();

        // Multi-pass validation
        let result = self.validator.validate_with_fixes(&files).await?;

        if !result.verification.is_clean() {
            return Err(anyhow!("Quality validation failed - cannot complete task"));
        }

        // SonarQube check
        let quality_gate = self.sonarqube_config.check_quality_gate().await?;

        if quality_gate != QualityGateStatus::Ok {
            return Err(anyhow!("SonarQube quality gate failed - cannot complete task"));
        }

        Ok(())
    }
}
```

### Step 3: Enable Auto-Extension Loading

```toml
# config.toml or goose.toml

[extensions]
quality_enforcer = { enabled = true, required = true }

[quality]
sonarqube_url = "http://localhost:9000"
sonarqube_token_env = "SONAR_TOKEN"
enforce_quality_gate = true
block_on_failure = true

[validation]
mode = "strict"  # strict | permissive
auto_fix = true
max_iterations = 5
```

---

## 🚨 Enforcement Mechanisms

### Level 1: Soft Enforcement (Warnings)
- Log issues to console
- Create validation reports
- Notify user of problems
- **DO NOT block**

### Level 2: Hard Enforcement (Blocking) ✅ **RECOMMENDED**
- Run validation automatically
- Block "done" report if validation fails
- Require manual override to bypass
- Log all bypasses for audit

### Level 3: Strict Enforcement (No Bypass)
- Validation MUST pass
- No manual override allowed
- Goose cannot complete task without passing
- **Use for production releases**

---

## 📊 Validation Frequency

| When | What | Required |
|------|------|----------|
| **On file write** | Quick syntax check | ✅ Yes |
| **On task completion** | Multi-pass validation | ✅ Yes |
| **Before build** | Full validation + SonarQube | ✅ Yes |
| **Pre-commit** | Git hook validation | ✅ Yes |
| **Pre-push** | Quality gate check | ✅ Yes |
| **CI/CD pipeline** | Full suite + deployment gate | ✅ Yes |

---

## 🔄 Workflow Integration

### Current Goose Workflow:
```
User asks Goose → Goose writes code → Goose reports "done" ✅
```

### NEW Enforced Workflow:
```
User asks Goose
    ↓
Goose writes code
    ↓
Goose runs quick validation ← Auto-fixes if possible
    ↓
If validation passes → Run multi-pass validation
    ↓
If multi-pass passes → Run SonarQube analysis
    ↓
If quality gate OK → Report "done" ✅
    ↓
If ANY step fails → FIX and retry (do NOT report "done")
```

---

## 💡 Auto-Fix Capabilities

The multi-pass validator can auto-fix:

1. ✅ **Empty event handlers** - Add placeholder implementation
2. ✅ **Missing imports** - Auto-import used components
3. ✅ **Unused state** - Remove or use state variables
4. ✅ **TODO markers** - Convert to GitHub issues
5. ✅ **Lint errors** - Run eslint --fix
6. ✅ **Format issues** - Run prettier

---

## 🎯 Success Criteria

Goose integration is successful when:

1. ✅ **Every task completion** triggers validation
2. ✅ **No "done" without validation** passing
3. ✅ **SonarQube always checked** before completion
4. ✅ **Auto-fix attempts** before reporting failure
5. ✅ **Detailed logs** in validation-logs/ directory
6. ✅ **User can see** validation progress in real-time

---

## 📝 User-Facing Messages

### On Validation Start:
```
🔍 Running mandatory quality validation...
   [1/6] Pre-flight checks...
   [2/6] Syntax validation...
   [3/6] Integration checks...
   [4/6] Quality checks...
   [5/6] Build verification...
   [6/6] Final verification...
```

### On Validation Pass:
```
✅ All validation checks passed!
📊 Quality Report:
   - 0 critical issues
   - 0 high priority issues
   - 2 medium issues (auto-fixed)
   - 5 low priority warnings

✅ SonarQube Quality Gate: PASSED
   - Bugs: 0
   - Vulnerabilities: 0
   - Code Smells: 3
   - Coverage: 85.2%
   - Duplication: 1.2%

✅ Task completed successfully!
```

### On Validation Failure:
```
❌ Validation FAILED - Cannot complete task

Issues found:
🔴 Critical (3):
   - Empty event handler in CardButtons.tsx:45
   - Missing API endpoint: /api/files/delete
   - Circular dependency detected: A → B → A

🟠 High Priority (5):
   - 5 components exported but never imported

📝 Detailed log: validation-logs/goose-completion-2025-02-07-03-30-15.log

⚠️  Goose will attempt auto-fix and retry...
```

---

## 🔒 Configuration File

Create `.goose/quality.config.json`:

```json
{
  "enforcement": {
    "level": "hard",
    "allowBypass": false
  },
  "sonarqube": {
    "enabled": true,
    "serverUrl": "http://localhost:9000",
    "projectKey": "goose-project",
    "qualityGate": "Zero Tolerance"
  },
  "validation": {
    "multiPass": {
      "enabled": true,
      "maxIterations": 5,
      "autoFix": true
    },
    "checks": {
      "syntaxErrors": "block",
      "typeErrors": "block",
      "lintErrors": "block",
      "testFailures": "block",
      "incompleteMarkers": "warn",
      "emptyHandlers": "block",
      "unusedState": "warn",
      "missingImports": "block"
    }
  },
  "logging": {
    "enabled": true,
    "directory": "validation-logs",
    "verbosity": "detailed",
    "showRelationships": true,
    "showAffectedComponents": true
  }
}
```

---

## ✅ **ACTION PLAN**

### Immediate (Next Session):
1. ✅ Create quality_enforcer extension
2. ✅ Update `.goosehints` with MANDATORY rules
3. ✅ Add auto-validation to done_gate
4. ✅ Test with actual Goose coding session

### Short Term (This Week):
1. ✅ Integrate with all build commands
2. ✅ Add real-time validation feedback
3. ✅ Enable auto-fix for common issues
4. ✅ Document in user guide

### Long Term (Next Release):
1. ✅ Train Goose to proactively run validation
2. ✅ Add validation to planning phase
3. ✅ Integrate with CI/CD pipelines
4. ✅ Add validation metrics dashboard

---

**Result:** Goose will NEVER ship incomplete code again! ✅
