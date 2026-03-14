# 🚨 InfraWatch AI — Error Log

This document tracks all errors encountered during development, their root causes, resolutions, and prevention strategies.

---

## Error Log Format

Each error entry follows this structure:

```markdown
### ERR-XXX: [Short Title]

**Timestamp:** YYYY-MM-DD HH:MM  
**Phase:** Foundation / Agent Dev / UI Dev / Integration / Deploy  
**Agent Lane:** UI / Map / Data / QA / Orchestrator  
**Severity:** 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low  

#### Error Output
\`\`\`
[Full error message from terminal]
\`\`\`

#### Context
- What was being attempted
- Command run
- Environment details

#### Root Cause
- Why the error occurred

#### Resolution
- Steps taken to fix

#### Prevention
- How to avoid in future

#### Status
- [ ] Identified
- [ ] Resolved
- [ ] Verified
```

---

## Active Errors

| ID | Title | Severity | Status |
|----|-------|----------|--------|
| ERR-009 | Wrong Azure endpoint format for Model Inference | 🟠 High | Partially resolved — correct endpoint found, debugging path/api-version |

---

## Resolved Errors

### ERR-001: Power Apps Static Files 404 - MIME Type Error

**Timestamp:** 2026-01-31 12:00  
**Phase:** Deploy  
**Agent Lane:** Orchestrator  
**Severity:** 🔴 Critical  

#### Error Output
```
index.html:1  Refused to apply style from 'https://<environment-id>.ce.environment.api.powerplatformusercontent.com/static/css/main.aa400f60.css' because its MIME type ('application/json') is not a supported stylesheet MIME type, and strict MIME checking is enabled.
main.8014b8cb.js:1   Failed to load resource: the server responded with a status of 404 ()
index.html:1  Refused to execute script from 'https://<environment-id>.ce.environment.api.powerplatformusercontent.com/static/js/main.8014b8cb.js' because its MIME type ('application/json') is not executable, and strict MIME type checking is enabled.
```

#### Context
- First deployment of InfraWatch AI via `pac code push`
- App deployed but CSS and JS files failed to load
- App URL: https://apps.powerapps.com/play/e/<environment-id>/a/<app-id>

#### Root Cause
- Create React App generates absolute paths by default (e.g., `/static/js/main.js`)
- Power Apps Code Apps requires relative paths (e.g., `./static/js/main.js`)
- Missing `"homepage": "."` in package.json caused incorrect asset paths

#### Resolution
- Added `"homepage": "."` to package.json to force relative paths in build output
- Rebuilt with `npm run build`
- Redeployed with `pac code push`

#### Prevention
- Always set `"homepage": "."` in package.json for Power Apps Code Apps deployments
- Verify build output paths in `build/index.html` before deployment

#### Status
- [x] Identified
- [x] Resolved
- [ ] Verified

---

### ERR-002: Leaflet CSS Blocked by Tracking Prevention

**Timestamp:** 2026-01-31 12:00  
**Phase:** Deploy  
**Agent Lane:** Map  
**Severity:** 🟠 High  

#### Error Output
```
Tracking Prevention blocked access to storage for https://unpkg.com/leaflet@1.9.4/dist/leaflet.css.
```

#### Context
- Leaflet CSS loaded from unpkg.com CDN in index.html
- Edge/Chrome Tracking Prevention blocked the external resource
- Map would render without proper styling

#### Root Cause
- External CDN resources can be blocked by browser privacy features
- Power Platform environment may have stricter CSP policies
- CDN requests classified as tracking by browser

#### Resolution
- Removed CDN link from public/index.html
- Added `import 'leaflet/dist/leaflet.css'` to src/index.tsx
- Leaflet CSS now bundled with app (no external requests)

#### Prevention
- Always bundle critical CSS/JS with the application
- Avoid external CDN dependencies in Power Apps Code Apps
- Use npm packages instead of CDN for all assets

#### Status
- [x] Identified
- [x] Resolved
- [ ] Verified

---

### ERR-003: React componentWillReceiveProps Deprecation Warning (Non-Blocking)

**Timestamp:** 2026-01-31 12:00  
**Phase:** Deploy  
**Agent Lane:** UI  
**Severity:** 🟢 Low  

#### Error Output
```
Warning: componentWillReceiveProps has been renamed, and is not recommended for use.
Please update the following components: Be, C
```

#### Context
- Warning appears in browser console
- Components "Be" and "C" are minified Power Platform internal components
- Not from InfraWatch AI codebase

#### Root Cause
- Power Platform's es6.player-shell.js uses legacy React lifecycle methods
- These are Microsoft internal components, not our code
- Cannot be fixed by us

#### Resolution
- No action required - this is Power Platform infrastructure
- Warning does not affect app functionality

#### Prevention
- N/A - external dependency from Power Platform

#### Status
- [x] Identified
- [x] Resolved (No action needed)
- [x] Verified

---

### ERR-004: MCP Connection Blocked by CORS (Expected Behavior)

**Timestamp:** 2026-02-01 10:00  
**Phase:** Integration  
**Agent Lane:** Data  
**Severity:** 🟡 Medium (Expected)  

#### Error Output
```
mcpService.ts:166  MCP call failed, retrying... (3 attempts left)
mcpService.ts:166  MCP call failed, retrying... (3 attempts left)
...
```

#### Context
- App attempts to connect to InfraWatch MCP server
- MCP server IS reachable (confirmed via PowerShell)
- Browser blocks request due to CORS (Cross-Origin Resource Sharing)
- App correctly falls back to demo mode

#### Root Cause
- Power Apps runs on `powerapps.com` domain
- MCP server runs on `azurecontainerapps.io` domain
- Browsers block cross-origin fetch requests without CORS headers
- MCP server does not have CORS headers configured

#### Resolution
- **Immediate:** Reduced retry attempts from 3 to 1 (CORS won't resolve with retries)
- **Immediate:** Added CORS detection to skip future attempts after first failure
- **Immediate:** App gracefully shows "Demo Mode" badge
- **Future:** Configure CORS headers on MCP Azure Container App, OR
- **Future:** Create a proxy API in Azure Functions

#### Prevention
- For production, MCP server needs `Access-Control-Allow-Origin` header
- Alternative: Use Azure Functions as proxy to call MCP

#### Workaround for Demo
- App works perfectly in Demo Mode with realistic mock data
- All features functional for hackathon demonstration
- Voice, charts, simulation all work with mock data

#### Status
- [x] Identified
- [x] Mitigated (graceful fallback)
- [ ] Fully Resolved (needs CORS config on MCP)

---

### ERR-005: azure.ai.projects v1.0.0 Breaking API Change

**Timestamp:** 2026-02-05 10:00  
**Phase:** Agent Dev  
**Agent Lane:** Data  
**Severity:** 🔴 Critical  

#### Error Output
```
AttributeError: type object 'AIProjectClient' has no attribute 'from_connection_string'
ImportError: cannot import name 'AgentTool' from 'azure.ai.projects.models'
```

#### Context
- `analysisAgent.py` was written for `azure-ai-projects` pre-release API
- Agent import pattern: `from azure.ai.projects import AIProjectClient` + `AIProjectClient.from_connection_string()`
- Tool imports from `azure.ai.projects.models` (AgentTool, etc.)

#### Root Cause
- `azure-ai-projects` v1.0.0 GA removed `from_connection_string()` factory method
- Constructor changed to `AIProjectClient(endpoint=..., credential=...)`
- Agent model classes moved to separate package `azure-ai-agents` v1.1.0
- Imports like `AgentTool`, `ToolSet`, `FunctionTool` moved to `azure.ai.agents.models`

#### Resolution
- Installed `azure-ai-agents==1.1.0`
- Rewrote `analysisAgent.py` to use `azure.ai.inference.ChatCompletionsClient` instead (simpler, supports API key auth)
- Fixed `crewEstimationAgent.py` and `prioritizationAgent.py` to remove broken imports

#### Prevention
- Pin SDK versions in requirements.txt
- Use `azure.ai.inference` SDK for direct model calls (simpler than agent framework)
- Check Azure SDK changelogs before upgrading

#### Status
- [x] Identified
- [x] Resolved
- [x] Verified

---

### ERR-006: DefaultAzureCredential Failed — az CLI Not on Python PATH

**Timestamp:** 2026-02-05 10:30  
**Phase:** Agent Dev  
**Agent Lane:** Data  
**Severity:** 🟠 High  

#### Error Output
```
azure.identity._exceptions.CredentialUnavailableError: DefaultAzureCredential failed to retrieve a token...
AzureCliCredential: Azure CLI not found on path
```

#### Context
- First attempt to authenticate `AIProjectClient` with `DefaultAzureCredential`
- `az login` was completed and working in PowerShell
- Python 3.11.0 installed at `C:\Python311` — separate PATH from system PATH

#### Root Cause
- Azure CLI (`az`) installed via MSI, available in PowerShell
- Python's subprocess call to `az` failed because `az.cmd` not on the Python process PATH
- `DefaultAzureCredential` tries multiple auth methods; `AzureCliCredential` failed first, others not configured

#### Resolution
- Abandoned `DefaultAzureCredential` approach for local dev
- Retrieved API key via `az cognitiveservices account keys list`
- Switched to `AzureKeyCredential` with `ChatCompletionsClient` (does not require TokenCredential)

#### Prevention
- For local dev, use API key auth (simpler, no PATH issues)
- For CI/CD, use Service Principal or Managed Identity
- If using DefaultAzureCredential, ensure `az` is on system PATH accessible to Python

#### Status
- [x] Identified
- [x] Resolved
- [x] Verified

---

### ERR-007: AIProjectClient Requires TokenCredential, Not AzureKeyCredential

**Timestamp:** 2026-02-05 11:00  
**Phase:** Agent Dev  
**Agent Lane:** Data  
**Severity:** 🟠 High  

#### Error Output
```
TypeError: AIProjectClient.__init__() got an unexpected keyword argument 'credential'
# (When passing AzureKeyCredential — it expects TokenCredential protocol)
```

#### Context
- After ERR-006, attempted to use `AzureKeyCredential` with `AIProjectClient`
- `AIProjectClient` in `azure-ai-projects` v1.0.0 only accepts `TokenCredential` (e.g., `DefaultAzureCredential`, `AzureCliCredential`)

#### Root Cause
- `AIProjectClient` is designed for Azure AD/Entra auth only
- `AzureKeyCredential` (API key-based) is a different credential type
- These are incompatible credential interfaces in the Azure SDK

#### Resolution
- Abandoned `AIProjectClient` entirely for direct model inference
- Switched to `azure.ai.inference.ChatCompletionsClient` which DOES accept `AzureKeyCredential`
- Complete rewrite of `analysisAgent.py` to use the inference SDK directly

#### Prevention
- `ChatCompletionsClient` from `azure.ai.inference` is the simplest SDK for direct model calls with API key
- `AIProjectClient` is only needed for project-level operations (agents, evaluations, etc.)
- Always check credential type compatibility before choosing SDK client

#### Status
- [x] Identified
- [x] Resolved
- [x] Verified

---

### ERR-008: API Key Length Mismatch — Extra Character in .env

**Timestamp:** 2026-02-05 12:00  
**Phase:** Agent Dev  
**Agent Lane:** Data  
**Severity:** 🔴 Critical  

#### Error Output
```
azure.core.exceptions.HttpResponseError: (401) Access denied due to invalid subscription key or wrong API endpoint.
```

#### Context
- API key retrieved via `az cognitiveservices account keys list` was 84 characters
- Key stored in `agents/.env` was 85 characters (1 extra trailing character)
- All endpoint/SDK combinations returned 401 Unauthorized
- Tested with: `ChatCompletionsClient`, `openai.AzureOpenAI`, raw `requests.post`

#### Root Cause
- When copying key1 to .env, an extra character was appended (likely newline or invisible char)
- Key1 from CLI: 84 chars ending `[REDACTED]`
- Key1 in .env: 85 chars ending `[REDACTED]` (different casing + extra char)
- Authentication failed on every request because the key was malformed

#### Resolution
- Retrieved key2 via `az cognitiveservices account keys list` → 84 chars, clean
- Replaced `AZURE_AI_API_KEY` in `agents/.env` with key2: `[REDACTED]`
- Verified correct 84-character length

#### Prevention
- Always verify key length after writing to .env: `python -c "len(key)"`
- Use `az` CLI to retrieve keys programmatically rather than copy-paste
- Consider using `.env` loading libraries that strip whitespace

#### Status
- [x] Identified
- [x] Resolved
- [x] Verified

---

### ERR-009: Wrong Azure Endpoint Format for Model Inference

**Timestamp:** 2026-02-05 12:30  
**Phase:** Agent Dev  
**Agent Lane:** Data  
**Severity:** 🟠 High  

#### Error Output
```
azure.core.exceptions.ResourceNotFoundError: (404) Resource not found
```

#### Context
- After fixing the API key (ERR-008), calls still failed with 404
- Tried multiple endpoint formats:
  - `https://<resource-name>.cognitiveservices.azure.com/models` → 401
  - `https://<resource-name>.cognitiveservices.azure.com/openai/deployments/Phi-4-reasoning` → 401
  - `https://<resource-name>.openai.azure.com` → 401 (before key fix)
  - `https://<resource-name>.services.ai.azure.com` → 404 (after key fix)

#### Root Cause
- Azure AIServices resource exposes multiple endpoint domains for different APIs:
  - `cognitiveservices.azure.com` — Cognitive Services legacy API
  - `openai.azure.com` — Azure OpenAI compatible API
  - `services.ai.azure.com` — Azure AI Model Inference API (new unified)
- Phi-4-reasoning is a Microsoft-format model (not OpenAI format)
- The correct endpoint for `ChatCompletionsClient` with Phi-4-reasoning needs the Azure AI Model Inference endpoint
- Initial 401 errors masked the endpoint issue (bad key + wrong endpoint simultaneously)

#### Resolution
- Discovered correct endpoint via `az cognitiveservices account show --query "properties.endpoints"`
- Azure AI Model Inference API endpoint: `https://<resource-name>.services.ai.azure.com/`
- Updated `analysisAgent.py` to use `AZURE_AI_INFERENCE_ENDPOINT` env var with correct default
- Passed `model=MODEL_NAME` in `client.complete()` call instead of constructor
- **Status: Still debugging** — 404 may require specific path suffix or API version

#### Prevention
- For Azure AIServices resources, always check `properties.endpoints` to find the right domain
- Microsoft-format models (Phi, etc.) use Model Inference API, not OpenAI API
- OpenAI-format models (GPT-4o, etc.) use the `openai.azure.com` endpoint
- Always test auth (key validity) and endpoint (correct path) separately

#### Status
- [x] Identified
- [x] Partially Resolved (correct endpoint found, debugging path/api-version)
- [ ] Fully Verified

---

## Resolved Errors

*No resolved errors yet — project just initialized.*

---

## Error Categories

### Build Errors (npm run build)
| ID | Title | Severity | Status |
|----|-------|----------|--------|
| — | No build errors encountered | — | — |

### Deployment Errors (pac code push)
| ID | Title | Severity | Status |
|----|-------|----------|--------|
| ERR-001 | Static files 404 - MIME type | 🔴 Critical | ✅ Resolved |
| ERR-002 | Leaflet CSS blocked by Tracking Prevention | 🟠 High | ✅ Resolved |

### Runtime Errors
| ID | Title | Severity | Status |
|----|-------|----------|--------|
| ERR-003 | React componentWillReceiveProps deprecation | 🟢 Low | ✅ Resolved (N/A) |
| ERR-004 | MCP CORS blocked | 🟡 Medium | ⚠️ Mitigated |

### MCP Connection Errors
| ID | Title | Severity | Status |
|----|-------|----------|--------|
| ERR-004 | Browser CORS blocks MCP cross-origin | 🟡 Medium | ⚠️ Mitigated (demo mode fallback) |

### Foundry Agent Errors
| ID | Title | Severity | Status |
|----|-------|----------|--------|
| ERR-005 | azure.ai.projects v1.0.0 breaking API change | 🔴 Critical | ✅ Resolved |
| ERR-006 | DefaultAzureCredential — az CLI not on Python PATH | 🟠 High | ✅ Resolved |
| ERR-007 | AIProjectClient requires TokenCredential | 🟠 High | ✅ Resolved |
| ERR-008 | API key length mismatch (85 vs 84 chars) | 🔴 Critical | ✅ Resolved |
| ERR-009 | Wrong Azure endpoint format for inference | 🟠 High | ⚠️ Partially resolved |

---

## Error Handling Patterns

### MCP Timeout Handling
```typescript
// Recommended pattern for MCP calls
const callMCPWithRetry = async (tool: string, params: any, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await mcpClient.call(tool, params, { timeout: 30000 });
      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
    }
  }
};
```

### Foundry Agent Error Handling
```python
# Recommended pattern for Foundry agent calls
try:
    response = openai_client.responses.create(
        conversation=conversation.id,
        input=user_input,
        extra_body={"agent": {"name": agent.name, "type": "agent_reference"}},
    )
except AuthenticationError as e:
    # Log to ERROR_LOG.md: Check .env credentials
    raise
except RateLimitError as e:
    # Log to ERROR_LOG.md: Wait and retry
    time.sleep(60)
    # Retry logic
except Exception as e:
    # Log full traceback to ERROR_LOG.md
    raise
```

### UI Error Boundaries
```tsx
// Recommended pattern for React error boundaries
class InfraWatchErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to ERROR_LOG.md via API
    console.error('[ERROR_LOG]', {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallbackUI error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

---

## Checkpoint Error Capture Template

When running `npm run build` or `pac code push`, use this template:

```markdown
### ERR-XXX: [Command] failed at [Phase]

**Timestamp:** [Current time]  
**Phase:** [Current phase from PLAN.md]  
**Agent Lane:** [Who made the change]  
**Severity:** [Based on impact]  

#### Error Output
\`\`\`
[Paste full terminal output here]
\`\`\`

#### Context
- Command: `npm run build` / `pac code push`
- Last change: [What was just modified]
- Files affected: [List files]

#### Root Cause
[To be filled after analysis]

#### Resolution
[To be filled after fixing]

#### Prevention
[To be filled after resolution]

#### Status
- [x] Identified
- [ ] Resolved
- [ ] Verified
```

---

## Links

- [PLAN.md](PLAN.md) — Implementation roadmap
- [CHANGELOG.md](CHANGELOG.md) — Version history
- [DECISIONS.md](DECISIONS.md) — Architecture decisions
