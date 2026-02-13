# Super-Goose Enterprise Features

## Overview
Super-Goose includes enterprise-grade features for team deployments, security, and observability. These features are implemented as UI panels with backend API integration points.

## Enterprise Settings Panels
Located in `ui/desktop/src/components/settings/enterprise/`:

### 1. Gateway Panel (`GatewayPanel.tsx`)
- API gateway configuration for routing LLM requests
- Endpoint URL, authentication headers, rate limiting
- Load balancing across multiple providers
- Request/response logging

### 2. Guardrails Panel (`GuardrailsPanel.tsx`)
- Content safety filters (warn-only mode currently active)
- Input/output validation rules
- PII detection and redaction
- Custom blocklist management
- Backend: `crates/goose/src/agents/guardrails.rs`

### 3. Hooks Panel (`HooksPanel.tsx`)
- Pre/post processing hooks for messages
- Custom middleware pipeline
- Event-driven automation triggers
- Webhook endpoints for external integrations

### 4. Memory Panel (`MemoryPanel.tsx`)
- Cross-session memory management
- Memory search and retrieval
- Session history browser
- Memory retention policies
- Backend: memory feature flag (default ON)

### 5. Observability Panel (`ObservabilityPanel.tsx`)
- Real-time cost tracking and budget enforcement
- Token usage monitoring per model
- Request latency metrics
- Error rate dashboards
- Backend: `crates/goose/src/agents/observability.rs`

### 6. Policies Panel (`PoliciesPanel.tsx`)
- Organization-wide policy enforcement
- Model access controls
- Usage quotas and limits
- Data retention policies
- Compliance reporting

### 7. Enterprise Route Panel (`EnterpriseRoutePanel.tsx`)
- Container component routing between enterprise sub-panels
- Navigation and breadcrumbs
- Access: Settings → Enterprise section

## Backend Integration
| Feature | Backend File | Status |
|---------|-------------|--------|
| Cost Tracking | `observability.rs` | Working |
| Guardrails | `guardrails.rs` | Working (warn-only) |
| Reflexion | `reflexion.rs` | Working |
| Memory | `memory` feature flag | Working |
| Rate Limiting | Provider-level | Working |
| Enterprise API | Not yet implemented | Planned |

## Security Features
- **Budget enforcement**: CostTracker prevents exceeding configured limits
- **Content filtering**: GuardrailsEngine scans inputs/outputs
- **Audit logging**: AuditLog module records all actions (Phase 5)
- **Failsafe cascade**: Failsafe module prevents runaway operations (Phase 5)
- **Circuit breaker**: Rate limiting and error recovery

## Test Coverage
- 6 test files for enterprise panels
- `EnterpriseRoutePanel.test.tsx`
- `GatewayPanel.test.tsx`
- `PoliciesPanel.test.tsx`
- `HooksPanel.test.tsx`
- `MemoryPanel.test.tsx`
- `ObservabilityPanel.test.tsx`

## Integration Status
Enterprise panels are UI-complete with static data. Backend API endpoints (`/enterprise/*`) are planned for future implementation. Current backend features (cost tracking, guardrails, memory) are functional through direct Rust integration.
