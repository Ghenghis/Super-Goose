# Secret Scanning Report

**Alerts:** #1, #4
**Type:** MongoDB Atlas Database URI with credentials
**Status:** INVESTIGATED - Example credentials only

---

## Alert #1 & #4: MongoDB Atlas URI with Credentials

### Where MongoDB Strings Appear

| File | Content | Real Credentials? |
|------|---------|-------------------|
| documentation/docs/mcp/mongodb-mcp.md | `mongodb://myuser:<PASSWORD>@localhost:27017/mydb` | NO - HTML placeholders |
| documentation/static/servers.json | `mongodb://localhost:27017` | NO - localhost, no creds |
| documentation/src/pages/prompt-library/data/prompts/js-express-setup.json | `MONGODB_URI=mongodb://localhost:27017/myapp` | NO - example template |
| crates/goose/src/guardrails/detectors/secret_detector.rs | `format!("mongodb://user:{}@cluster0.example.mongodb.net/app", "pass")` | NO - test code |
| goose/audit_out/todo_stub_hits.txt | Old doc references with `user:pass` | NO - cached old docs |

### Current State

The documentation files now use proper `<USERNAME>` and `<PASSWORD>` HTML-escaped placeholders:
```markdown
mongodb+srv://&lt;USERNAME&gt;:&lt;PASSWORD&gt;@cluster0.example.mongodb.net/database
```

The test code in `secret_detector.rs` uses `format!()` to construct the URL at runtime specifically to avoid triggering GitHub's secret scanning pattern matcher.

### Root Cause

The alerts are likely triggered by:
1. **Git history** containing earlier versions of docs before credentials were replaced with placeholders
2. **goose/audit_out/todo_stub_hits.txt** (451K+ line generated file) containing cached references

### Recommended Actions

1. **Dismiss alerts** with note: "Example/placeholder credentials in documentation, not real"
2. **Delete** `goose/audit_out/todo_stub_hits.txt` (generated artifact, shouldn't be in version control)
3. **Verify** no real MongoDB Atlas credentials exist in git history (check commits to `documentation/docs/mcp/mongodb-mcp.md`)

### Risk Assessment

**LOW** — These are example/placeholder credentials, not real production database URIs. The format `user:pass@cluster0.example.mongodb.net` uses `.example.` domain which doesn't resolve.
