# 📝 InfraWatch AI — Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
with agent lane attribution for multi-agent development tracking.

---

## [Unreleased]

### Added
- Initial project documentation structure
- README.md with architecture diagram and demo script
- PLAN.md with phased implementation roadmap
- CHANGELOG.md (this file)
- ERROR_LOG.md for error tracking
- DECISIONS.md for Architecture Decision Records
- AGENT_WORK_LOG.md for multi-agent session tracking

### Agent Attribution
| Change | Agent Lane | Session |
|--------|------------|---------|
| Documentation scaffold | Orchestrator | 2026-01-31-001 |

---

## [0.7.0] - 2026-02-19

### Added — AI Report Generator with Code Interpreter Charts

#### Python Report Agent (`agents/reportAgent.py`)
- New `generate_report()` function that fetches live MCP data and generates publication-quality reports
- 5 matplotlib chart types: severity donut, issue type bar, cost estimate stacked bar, geographic hotspots, severity×type heatmap
- Dark-theme charts (#1a1a2e background) matching MAINTAIN AI design system
- Azure OpenAI integration for AI narrative generation with full markdown output
- Automatic fallback narrative when credentials are unavailable
- CLI entry point for standalone report generation

#### FastAPI Endpoint (`agents/api_server.py`)
- New `POST /api/agents/report` endpoint with `ReportRequest` model (report_type, custom_prompt, workOrders)
- Supports 4 report types: full, executive, safety, budget
- Health endpoint updated to list report agent

#### Frontend Report Service (`src/services/reportService.ts`)
- New service calling Python report agent with 2-minute timeout
- Local fallback report generation with SVG charts when agent API unavailable
- Markdown table, severity breakdown, budget estimate, and recommendations
- `resetReportApi()` for retry after agent restart

#### Report Generator Component (`src/components/ReportGenerator.tsx`)
- Full-screen glassmorphism overlay with animated progress stages
- Report type selector (Full, Executive, Safety, Budget) with data preview
- Chart gallery with responsive grid layout and hover animations
- Markdown-to-HTML renderer for AI narrative (headers, tables, lists, code)
- HTML export/download for sharing reports
- Success banner with metadata (model, processing time, data points)

#### Dashboard Integration
- "Report" button added to intelligence strip with gradient styling
- `showReport` state and `ReportGenerator` component wired into Dashboard

#### Dependencies
- Added `matplotlib>=3.8.0` and `numpy>=1.26.0` to `agents/requirements.txt`

### Agent Attribution
| Change | Agent Lane | Session |
|--------|------------|---------|
| Report agent + charts | GitHub Copilot | 2026-02-19-002 |
| Frontend integration | GitHub Copilot | 2026-02-19-002 |

---

## [0.6.0] - 2026-02-19

### Security & Compliance — Hackathon Submission Readiness

#### Fixed — Security & Disclaimer Compliance
- **Redacted API key fragment** from `docs/ERROR_LOG.md` (ERR-008 resolution section had partial key `D9VIHg0X...ACOGLlZ9` — replaced with `[REDACTED]`)
- **Redacted Azure resource names** from `docs/CHANGELOG.md` and `docs/ERROR_LOG.md` (resource names, subscription IDs, resource group names replaced with `<resource-name>` / `[REDACTED]`)
- **Redacted deployed model list** from `docs/CHANGELOG.md` (removed enumeration of all Azure model deployments)
- **Replaced real MCP endpoint** in `.env.example` with placeholder `https://your-mcp-server.azurecontainerapps.io/mcp`
- **Removed hardcoded production URLs** from source code fallbacks:
  - `src/services/mcpService.ts` — MCP endpoint default now empty (env-var only)
  - `src/services/agentService.ts` — Agent API URL default now empty (env-var only)
  - `agents/analysisAgent.py` — Azure endpoint and MCP endpoint defaults now empty
  - `agents/prioritizationAgent.py` — MCP endpoint default now empty
- **Redacted MCP endpoint** from `docs/DECISIONS.md` (ADR-002)
- **Created `agents/.dockerignore`** to prevent `.env` secrets from being baked into Docker images

#### Changed — Track & Evaluation Alignment
- **Updated README track header** from "Battle #2 - Reasoning Agents" to "Battle #1 - Creative Apps with GitHub Copilot"
- **Updated evaluation rubric** in README to match Creative Apps track weights (20/20/15/15/20/10)
- **Added GitHub Copilot Usage section** to README documenting how Copilot assisted development across code generation, problem solving, creative features, and documentation
- **Fixed git clone placeholder** in README (was `YOUR-USERNAME`, now `your-username`)
- **Redacted MCP endpoint** from README (now references env var)

### Agent Attribution
| Change | Agent Lane | Session |
|--------|------------|---------|
| Security audit & remediation | QA Agent | 2026-02-19-001 |
| Track realignment | Orchestrator | 2026-02-19-001 |
| Copilot usage documentation | Orchestrator | 2026-02-19-001 |

---

## [0.5.0] - 2026-02-05

### Added - Python Agent Backend (Phi-4-reasoning)

- **Analysis Agent Rewrite** (`agents/analysisAgent.py`)
  - Fully rewritten to use `azure.ai.inference.ChatCompletionsClient` with `AzureKeyCredential`
  - Agentic tool-calling loop (max 5 iterations) with 4 MCP tool functions
  - Tool functions: `get_work_orders`, `get_potholes`, `get_sidewalk_issues`, `get_schools`
  - Structured system prompt for data-driven infrastructure analysis
  - Reasoning steps and tool call logging for transparency
  - Switched target model from GPT-4o to **Phi-4-reasoning** (cheapest reasoning model)

- **Crew Estimation Agent Fix** (`agents/crewEstimationAgent.py`)
  - Fixed broken `azure.ai.projects.models` imports (SDK v1.0 breaking change)
  - Now uses pure Python math with historical metrics
  - Tested and working: "2 total crews (2P / 0S / 0C), 85% confidence"

- **Prioritization Agent Fix** (`agents/prioritizationAgent.py`)
  - Fixed broken `azure.ai.projects.models` imports (SDK v1.0 breaking change)
  - Multi-factor priority scoring algorithm (severity × age × proximity × type weights)
  - Tested and working: "20 work orders prioritized, top score 132.0"

- **Agent Orchestrator** (`agents/run_agents.py`)
  - Updated setup validator to check for `azure-ai-agents` package
  - CLI commands: `setup`, `analysis`, `crew`, `priority`, `all`

- **Environment Configuration** (`agents/.env`)
  - Populated with Azure AI connection string, MCP endpoint, API key, model name
  - Azure AI Services endpoint: `https://<resource-name>.cognitiveservices.azure.com/`
  - Azure AI Model Inference endpoint: `https://<resource-name>.services.ai.azure.com/`

### Fixed
- **ERR-005:** `azure.ai.projects` v1.0.0 removed `from_connection_string()` — migrated to new API
- **ERR-006:** `DefaultAzureCredential` failed (az CLI not on Python PATH) — switched to API key auth
- **ERR-007:** `AIProjectClient` requires `TokenCredential` not `AzureKeyCredential` — switched to `ChatCompletionsClient`
- **ERR-008:** API key in .env had 85 chars (extra trailing character) vs 84 from Azure CLI — replaced with clean key
- **ERR-009:** Endpoint set to `{endpoint}/models` — discovered correct endpoint is `services.ai.azure.com`

### Technical Details
- **Azure Resource:** [REDACTED] (AIServices, S0) in [REDACTED], eastus2
- **Model:** Phi-4-reasoning (Microsoft format, GlobalStandard SKU, capacity 1)
- **Cost:** ~$0.14/1M input tokens, ~$0.56/1M output tokens (cheapest reasoning model available)
- **Python:** 3.11.0 with azure-ai-inference==1.0.0b9, azure-ai-projects==1.0.0, azure-ai-agents==1.1.0
- **Other deployed models (not used by agents):** [see Azure AI Foundry portal]

### Agent Attribution
| Change | Agent Lane | Session |
|--------|------------|--------|
| Azure resource discovery | Data Agent | 2026-02-05-001 |
| Model selection (Phi-4-reasoning) | Data Agent | 2026-02-05-001 |
| analysisAgent.py rewrite | Data Agent | 2026-02-05-001 |
| crewEstimationAgent.py fix | Data Agent | 2026-02-05-001 |
| prioritizationAgent.py fix | Data Agent | 2026-02-05-001 |
| Auth debugging (ERR-005 through ERR-009) | Data Agent | 2026-02-05-001 |
| .env configuration | Data Agent | 2026-02-05-001 |

---

## [0.4.0] - 2026-02-04

### Added - ProCert Design System

- **Complete CSS Overhaul** (`src/index.css`)
  - 18-section design system: tokens, layout, header, map, panels, badges, charts, animations, etc.
  - Glassmorphism panels with backdrop-filter and layered gradients
  - Dark/light theme support with CSS custom properties
  - Severity-colored badges (critical red, high orange, medium amber, low green)
  - Animated gradient backgrounds and pulse effects
  - Responsive layout for various screen sizes

- **Dashboard Styling** (`src/pages/Dashboard.tsx`)
  - Updated to use ProCert design system classes
  - Improved header layout with status indicators

- **Unified Side Panel** (`src/components/UnifiedSidePanel.tsx`)
  - Styled to match ProCert glassmorphism aesthetic

### Changed
- Full visual identity refresh from default Fluent UI to custom ProCert theme
- Deployed to Power Platform via `pac code push`

### Agent Attribution
| Change | Agent Lane | Session |
|--------|------------|--------|
| ProCert CSS design system | UI Agent | 2026-02-04-001 |
| Dashboard styling | UI Agent | 2026-02-04-001 |
| UnifiedSidePanel styling | UI Agent | 2026-02-04-001 |

---

## [0.3.0] - 2026-02-01

### Added - User Experience Improvements

- **Welcome Tour** (`src/components/WelcomeTour.tsx`)
  - First-time user onboarding with 6-step guided tour
  - Feature previews with icons and descriptions
  - Pro tips for each major feature
  - Progress dots with click-to-navigate
  - Skip option and localStorage persistence
  
- **Quick Actions Bar** (`src/components/QuickActionsBar.tsx`)
  - Floating action bar at bottom of screen
  - One-click access to: Critical Issues, Crews, Weather, Charts, Refresh
  - Live badge counts (critical issues, available crews)
  - Expandable/collapsible design
  - Built-in tips panel
  - Keyboard shortcut hints
  
- **Help Panel** (`src/components/HelpPanel.tsx`)
  - Comprehensive documentation overlay (press `?`)
  - Three tabs: Feature Guide, Keyboard Shortcuts, FAQ
  - Step-by-step instructions for each feature
  - "Restart Tour" button for returning users
  - FAQ with expandable answers
  
- **Keyboard Shortcuts**
  - `?` - Open help panel
  - `Escape` - Close panels/modals
  - `P` - Toggle predictive charts
  - `V` - Toggle voice announcements
  - `C` - Jump to critical issues
  - `R` - View crew status
  - `W` - Show weather panel
  
- **Contextual Guidance**
  - AI Panel tip explaining how to view reasoning
  - Scenario Simulator instructions for new users
  - Tooltips on all major buttons and badges
  - "Demo Mode" explanation in header

### Changed
- Dashboard now shows Quick Actions Bar by default
- Scenario Simulator header shows hint when collapsed
- AI Companion Panel includes usage tip at top

### Agent Attribution
| Change | Agent Lane | Session |
|--------|------------|---------|
| WelcomeTour component | Orchestrator | 2026-02-01-002 |
| QuickActionsBar component | Orchestrator | 2026-02-01-002 |
| HelpPanel component | Orchestrator | 2026-02-01-002 |
| Keyboard shortcuts | Orchestrator | 2026-02-01-002 |
| Contextual guidance | Orchestrator | 2026-02-01-002 |

---

## [0.2.0] - 2026-02-01

### Added
- **MCP Service Layer** (`src/services/mcpService.ts`)
  - Real-time connection to InfraWatch MCP server
  - Caching with 60-second TTL
  - Retry logic with exponential backoff
  - Batch fetch for all infrastructure data
  
- **Weather Service** (`src/services/weatherService.ts`)
  - Integration with Open-Meteo API (no API key required)
  - 7-day forecast with workability scores
  - Freeze-thaw cycle detection
  - Crew productivity multipliers based on conditions
  
- **Agent Orchestration Service** (`src/services/agentService.ts`)
  - AI insight generation from work orders
  - Crew estimation algorithm with full reasoning chain
  - Scenario simulation with delta analysis
  - Streaming callback support for reasoning transparency
  
- **Voice Announcements** (`src/services/voiceService.ts`)
  - Web Speech API integration
  - Priority-based voice queue (critical announcements interrupt)
  - Context-aware announcements for alerts, insights, scenarios
  - Toggle button in header bar
  
- **Predictive Charts** (`src/components/PredictiveChart.tsx`)
  - Pure SVG/CSS charting (no external library)
  - Trend line calculation with direction indicators
  - Threshold visualization (warning/critical)
  - Weather strip overlay with workability indicators
  - Actual vs predicted data visualization
  
- **Python Foundry Agents** (`agents/`)
  - `analysisAgent.py` - MCP data analysis with tool bindings
  - `prioritizationAgent.py` - Priority scoring algorithm
  - `crewEstimationAgent.py` - Crew estimation with historical metrics

### Changed
- Dashboard now attempts live MCP connection first, falls back to demo mode
- Connection status indicator: Live / Connecting / Demo Mode / Offline
- Header bar now shows voice toggle, charts toggle, and last refresh time
- Scenario simulator uses real agent service instead of mock data

### Technical Details
- Build size increased by +10.35 kB (new services + chart component)
- Voice service works in all modern browsers with Web Speech API
- Weather API is free and works without authentication

### Agent Attribution
| Change | Agent Lane | Session |
|--------|------------|---------|
| MCP Service + Weather | Data Agent | 2026-02-01-001 |
| Agent Orchestration | Data Agent | 2026-02-01-001 |
| Voice Service | UI Agent | 2026-02-01-001 |
| Predictive Charts | UI Agent | 2026-02-01-001 |
| Dashboard Integration | Orchestrator | 2026-02-01-001 |

---

## [0.1.1] - 2026-01-31

### Fixed
- **ERR-001:** Static files 404 error - Added `"homepage": "."` to package.json for relative paths
- **ERR-002:** Leaflet CSS blocked by Tracking Prevention - Bundled CSS locally via npm import

### Changed
- Moved Leaflet CSS from CDN (unpkg.com) to bundled import in src/index.tsx
- Build output now uses relative paths for Power Apps Code Apps compatibility

### Agent Attribution
| Change | Agent Lane | Session |
|--------|------------|---------|
| Path fix + Leaflet bundling | Orchestrator | 2026-01-31-002 |

---

## [0.1.0] - 2026-01-31

### Added
- Project initialization
- Documentation structure created

### Technical Details
- **MCP Endpoint:** (configured via `INFRAWATCH_MCP_ENDPOINT` environment variable)
- **Target Platform:** Power Apps Code Apps
- **UI Framework:** Fluent UI v9 + Leaflet

---

## Version History Format

Each release follows this structure:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing functionality

### Fixed
- Bug fixes

### Removed
- Removed features

### Agent Attribution
| Change | Agent Lane | Session |
|--------|------------|---------|
| Description | UI/Map/Data/QA | Session ID |

### Build Checkpoint
- [ ] npm run build: PASS/FAIL
- [ ] pac code push: PASS/FAIL
- [ ] Manual testing: PASS/FAIL
```

---

## Build Checkpoints Log

| Version | Date | npm build | pac code push | Notes |
|---------|------|-----------|---------------|-------|
| 0.5.0 | 2026-02-05 | ✅ Pass | ⏳ Pending | Agent backend — auth still resolving |
| 0.4.0 | 2026-02-04 | ✅ Pass | ✅ Pass | ProCert design system deployed |
| 0.3.0 | 2026-02-01 | ✅ Pass | ✅ Pass | UX improvements deployed |
| 0.2.0 | 2026-02-01 | ✅ Pass | ✅ Pass | Services + charts deployed |
| 0.1.1 | 2026-01-31 | ✅ Pass | ✅ Pass | Path + Leaflet CSS fixes |
| 0.1.0 | 2026-01-31 | ✅ Pass | ✅ Pass | Initial scaffold |

---

## Links

- [PLAN.md](PLAN.md) — Implementation roadmap
- [ERROR_LOG.md](ERROR_LOG.md) — Error tracking
- [DECISIONS.md](DECISIONS.md) — Architecture decisions
