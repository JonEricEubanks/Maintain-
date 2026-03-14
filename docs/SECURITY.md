# MAINTAIN AI — Security Practices

This document summarizes the security practices implemented across the codebase,
intended for enterprise reviewers and hackathon judges evaluating Responsible AI
and production-readiness.

## Authentication & Access Control

| Layer | Mechanism |
|-------|-----------|
| Azure AI Foundry | API key via `AZURE_AI_API_KEY` env var (never hardcoded) |
| Dataverse | `az account get-access-token` or client-credentials flow |
| MCP Server | Read-only access — agents never write to MCP |
| Container Apps | Azure Container Registry with ACR login |

## Input Validation & Injection Prevention

- **OData Injection**: `dataverseCrudService.py` sanitizes all filter values via
  `_sanitize_odata_value()`, rejecting single quotes, parentheses, backslashes,
  and OData operator keywords (`eq`, `ne`, `gt`, `lt`, `and`, `or`, `not`).
- **XSS Prevention**: `DecayVisualizer.tsx` strips all HTML tags from AI-generated
  narrative text via `sanitizeNarrative()` before rendering.
- **API Input**: FastAPI Pydantic models validate all request bodies with type
  enforcement and field constraints.

## Content Safety (Responsible AI)

- **Azure Content Safety API**: 4-category screening (Hate, Violence, Self-Harm, Sexual)
  applied to all AI-generated dispatch recommendations and decision log entries.
- **Fail-Closed Default**: When Content Safety is not configured, content is
  **blocked by default** — never passed through unchecked (`contentSafety.py`).
- **Severity Threshold**: Configurable (default: 2/6). Any category exceeding
  the threshold causes the content to be flagged.
- **Responsible AI Panel**: Frontend governance view showing Content Safety status,
  AI decision audit trail, human override statistics, and confidence distributions.

## Container Security

- **Non-Root User**: The Dockerfile creates and switches to `appuser` — the FastAPI
  server never runs as root inside the container.
- **Minimal Image**: Based on `python:3.12-slim` — no unnecessary packages.
- **No Cache**: `pip install --no-cache-dir` prevents credential leakage in layers.

## Secrets Management

- All secrets loaded from environment variables via `python-dotenv`
- `.env` files are `.gitignore`-d — never committed to the repository
- `.env.example` documents all required variables without values
- No hardcoded API keys, connection strings, or tokens anywhere in the codebase

## Data Flow Transparency

```
MCP Server (Read-Only) → Agent Reasoning → Frontend → Dataverse (Write)
```

- Agents read from MCP but never write back
- Write operations go through the frontend → Dataverse CRUD service
- All AI decisions are logged in `iw_aidecisionlog` Dataverse table for audit

## Observability & Monitoring

- **OpenTelemetry**: Distributed tracing with Azure Application Insights export
- **`@traced` Decorator**: Custom decorator on all API endpoints captures timing,
  status, and error details in an in-memory ring buffer (capped at 200 entries)
- **Agent Trace Viewer**: Frontend panel showing per-request model, tokens,
  latency, and reasoning steps — full transparency into AI decision-making

## Network Security

- **CORS**: Configured on the FastAPI server with explicit origin allowlists
- **Timeouts**: All external HTTP calls (MCP, Content Safety, Foundry) have
  explicit timeout values to prevent hanging connections
- **Retry Logic**: Frontend services implement cooldown-based retry with
  CSP-aware error detection to avoid hammering blocked endpoints
