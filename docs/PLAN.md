# 📋 MAINTAIN AI — Implementation Plan

> **Project:** Predictive Infrastructure Command Center  
> **Track:** Creative Apps with GitHub Copilot + Reasoning Agents with Microsoft Foundry  
> **Created:** 2026-01-31  
> **Updated:** 2026-03-01  
> **Status:** ✅ Complete — Deployed to Power Apps + Azure Container Apps

---

## 🎯 Objectives

1. ✅ Build a multi-agent reasoning system (6 agents on Azure OpenAI GPT-4.1-mini)
2. ✅ Connect to InfraWatch MCP for real Lake Forest infrastructure data (10 tools)
3. ✅ Create a futuristic Power Apps Code Apps UI with Leaflet map
4. ✅ Implement AI transparency, What-If simulation, and proactive notifications
5. ✅ Add observability (Agent Trace Viewer) and Responsible AI governance panel
6. 🏆 Win the hackathon!

---

## 📅 Phase 1: Foundation ✅

### 1.1 Documentation Setup ✅
| Task | Status | Notes |
|------|--------|-------|
| Create README.md | ✅ Done | Project overview, architecture, deployment guide |
| Create PLAN.md | ✅ Done | This file |
| Create CHANGELOG.md | ✅ Done | |
| Create ERROR_LOG.md | ✅ Done | 9 errors tracked (ERR-001 – ERR-009) |
| Create DECISIONS.md | ✅ Done | Architecture Decision Records |
| Create AGENT_WORK_LOG.md | ✅ Done | Multi-agent session tracking |

### 1.2 Project Scaffold ✅
| Task | Status | Notes |
|------|--------|-------|
| Initialize package.json | ✅ Done | React 18 + TypeScript + Fluent UI v9 |
| Create tsconfig.json | ✅ Done | Strict mode enabled |
| Create .env.example | ✅ Done | 15+ env vars across 8 sections documented |
| Create folder structure | ✅ Done | src/, docs/, agents/, dataverse/ |
| Create .env | ✅ Done | MCP + Agent API URLs configured |

---

## 📅 Phase 2: Agent Development ✅

### 2.1 Agent Pipeline (6 agents)
| Agent | File | Status | Notes |
|-------|------|--------|-------|
| Analysis Agent | `agents/analysisAgent.py` | ✅ Done | Synthesizes infrastructure state from 1,281+ work orders |
| Prioritization Agent | `agents/prioritizationAgent.py` | ✅ Done | Multi-factor scoring with explainable AI |
| Crew Estimation Agent | `agents/crewEstimationAgent.py` | ✅ Done | Predictive allocation (weather, severity, history) |
| Dispatch Agent | `agents/dispatchAgent.py` | ✅ Done | Crew dispatch optimization |
| Report Agent | `agents/reportAgent.py` | ✅ Done | Matplotlib charts (severity donut, cost breakdown, heatmap) |
| NLP Dashboard Agent | `agents/nlpDashboardAgent.py` | ✅ Done | Natural language → dashboard generation |

### 2.2 Agent Infrastructure
| Task | Status | Notes |
|------|--------|-------|
| FastAPI server (`api_server.py`) | ✅ Done | 1,259 lines, 20+ endpoints |
| Content Safety (`contentSafety.py`) | ✅ Done | 4-category screening via Azure Content Safety |
| Dataverse CRUD service | ✅ Done | Bidirectional mapping for 6 tables |
| Azure Table Storage fallback | ✅ Done | `tableStorageService.py` |
| `traced()` decorator | ✅ Done | OTel spans + in-memory ring buffer |
| `/api/traces` + `/api/telemetry` | ✅ Done | Live observability endpoints |

### 2.3 MCP Integration ✅
| Task | Status | Notes |
|------|--------|-------|
| MCP server deployed | ✅ Done | `infrawatch-mcp` on Azure Container Apps |
| 10 MCP tools available | ✅ Done | Work orders, potholes, sidewalks, schools, weather, etc. |
| Frontend MCP service | ✅ Done | `mcpService.ts` — caching, retry, CORS fallback |
| Backend MCP integration | ✅ Done | Agents call MCP via `INFRAWATCH_MCP_ENDPOINT` |

---

## 📅 Phase 3: UI Development ✅

### 3.1 Components (47 total)
| Category | Count | Key Components |
|----------|-------|----------------|
| Feature components | 28 | Dashboard, AICompanionPanel, CrewDashboard, ScenarioSimulator, WorkOrderWizard, DispatchWizard, AnalysisWizard, ReportGenerator, NLPDashboardBuilder, AgentTraceViewer, ResponsibleAIPanel, HelpPanel, MaintainIntro (1,540-line animated brain), DecayVisualizer, etc. |
| Map components | 7 | InfraMap, CanvasMap, MapLibreMap, SVGMap, StaticGridMap, MapWrapper, PowerAppsMap |
| UI primitives | 12 | shadcn/ui: button, badge, table, input, select, checkbox, etc. |

### 3.2 Services (14 total)
| Service | Status | Notes |
|---------|--------|-------|
| agentService.ts | ✅ Done | Agent API communication |
| mcpService.ts | ✅ Done | MCP with probe + fallback |
| dataverseService.ts | ✅ Done | 6-table CRUD with field mapping |
| dispatchService.ts | ✅ Done | Crew dispatch logic |
| reportService.ts | ✅ Done | Report generation |
| nlpDashboardService.ts | ✅ Done | NLP → dashboard |
| voiceService.ts | ✅ Done | Web Speech API with priority queue |
| weatherService.ts | ✅ Done | Weather data |
| analyticsService.ts | ✅ Done | Telemetry |
| decaySimulationService.ts | ✅ Done | Infrastructure decay modeling |
| esriService.ts | ✅ Done | Esri/ArcGIS integration |
| mapToolsService.ts | ✅ Done | Map utilities |
| pricingService.ts | ✅ Done | Cost estimation |
| storyService.ts | ✅ Done | Narrative generation |

---

## 📅 Phase 4: Integration ✅

### 4.1 Dataverse Tables (6 provisioned)
| Table | Status | Notes |
|-------|--------|-------|
| `iw_crewdispatch` | ✅ Done | Crew dispatch records |
| `iw_fieldinspection` | ✅ Done | Field inspection data |
| `iw_aidecisionlog` | ✅ Done | AI decision audit trail |
| `iw_crewschedule` | ✅ Done | Crew scheduling |
| `iw_workorderupdate` | ✅ Done | Work order updates |
| `iw_crewmember` | ✅ Done | Crew member profiles |

### 4.2 Azure Resources (`procert-ai-rg`, East US)
| Resource | Type | Status |
|----------|------|--------|
| `procert-ai-openai` | Azure OpenAI (GPT-4.1-mini) | ✅ Live |
| `procert-ai-coach` | Application Insights | ✅ Live |
| `procertaistor2026` | Storage Account | ✅ Live |
| `infrawatchacr` | Container Registry | ✅ Live |
| `infrawatch-env` | Container Apps Environment | ✅ Live |
| `infrawatch-agents` | Container App (FastAPI) | ✅ Live — tag `v2` |
| `infrawatch-mcp` | Container App (MCP server) | ✅ Live |

---

## 📅 Phase 5: Polish & Demo ✅

### 5.1 Polish
| Task | Status | Notes |
|------|--------|-------|
| Dark mode theming | ✅ Done | Fluent webDarkTheme + glassmorphism |
| Animated brain intro | ✅ Done | 1,540-line neural network SVG animation |
| Micro-animations | ✅ Done | Motion (Framer Motion) throughout |
| Welcome tour | ✅ Done | WelcomeTour.tsx onboarding flow |
| Feature tooltips | ✅ Done | FeatureTooltip.tsx contextual help |
| Help panel | ✅ Done | 669 lines — feature guides, keyboard shortcuts, launch buttons |

### 5.2 Observability & Governance (added post-review)
| Task | Status | Notes |
|------|--------|-------|
| Agent Trace Viewer | ✅ Done | 410 lines — KPI cards, waterfall timeline, per-agent breakdown |
| Responsible AI Panel | ✅ Done | 567 lines — 3-tab governance (Overview, Decision Audit, Content Safety) |
| Integrated into Help panel | ✅ Done | Feature guides with launch buttons (no header clutter) |

### 5.3 Deployment ✅
| Task | Status | Notes |
|------|--------|-------|
| `npm run build` | ✅ Done | Production build, env vars baked in |
| `pac code push` | ✅ Done | Deployed to Power Apps |
| ACR cloud build | ✅ Done | `az acr build` → `infrawatch-agents:v2` |
| ACA deploy | ✅ Done | Health endpoint verified, 6 agents loaded |
| `deploy-aca.ps1` | ✅ Done | Reusable deployment script |

---

## 📊 Progress Summary

| Phase | Status | Completion |
|-------|--------|------------|
| Phase 1: Foundation | ✅ Complete | 100% |
| Phase 2: Agent Development | ✅ Complete | 100% |
| Phase 3: UI Development | ✅ Complete | 100% |
| Phase 4: Integration | ✅ Complete | 100% |
| Phase 5: Polish & Demo | ✅ Complete | 100% |

---

## 📈 Final Stats

| Metric | Count |
|--------|-------|
| React components | 47 |
| Frontend services | 14 |
| Python agent files | 11 (6 AI agents + 5 infrastructure) |
| Dataverse tables | 6 |
| MCP tools | 10 |
| Azure resources | 7 |
| Python packages | 18 |
| Dashboard.tsx | 1,868 lines |

---

---

## 📅 Phase 5: Unification — "One App" Hackathon Polish

> **Goal:** Make MAINTAIN AI feel like one cohesive, competition-winning app  
> **Brand:** MAINTAIN AI — "Predictive Infrastructure Command Center"  
> **Updated:** 2026-03-03  

### 5.1 Instant Cohesion (Quick Wins)
| Step | Task | Status | Notes |
|------|------|--------|-------|
| 1 | Unify brand to "MAINTAIN AI" everywhere | 🔄 | Replace InfraWatch/ProCert in package.json, index.html, CSS comments, service headers, agent strings |
| 2 | Consolidate header navigation | 🔄 | Standardize all header buttons to Fluent UI, group logically with dividers |
| 3 | Surface buried features | ⬜ | Move Traces/RAI/SK to sidebar tabs instead of Help-only |
| 4 | Smooth intro → app transition | ⬜ | Framer Motion fade, auto-pulse critical markers |
| 5 | Consistent card/panel styling | ⬜ | All overlays use glass-card + consistent animations |
| 6 | Fix light mode consistency | ⬜ | Align CSS vars with Fluent webLightTheme |

### 5.2 Structural Unification
| Step | Task | Status | Notes |
|------|------|--------|-------|
| 7 | Extract Dashboard state to context | ✅ | AppContext with useReducer — theme, overlay, connectionStatus |
| 8 | Extract feature components | ✅ | HeaderBar, BriefingOverlay extracted; Dashboard -180 lines |
| 9 | Unified overlay framework | ⬜ | OverlayShell.tsx shared wrapper |
| 10 | Consolidate styling | ⬜ | Fluent primary, phase out shadcn, extract inline patterns |

### 5.3 Demo Theater (Winning Edge)
| Step | Task | Status | Notes |
|------|------|--------|-------|
| 11 | Demo Mode auto-pilot | ⬜ | Timed walkthrough: Map → Popup → Brief → Analysis → Decay → Dispatch |
| 12 | Enhance Executive Briefing | ⬜ | Count-up animations, hero AI-vs-Manual, "Powered by" MS stack logos |
| 13 | Pre-loaded AI conversation | ⬜ | Demo seed with visible reasoning chains |
| 14 | Micro-interactions | ⬜ | Dispatch success confetti, analysis zoom-to-fit |
| 15 | Spotlight WelcomeTour | ⬜ | Highlight real UI elements instead of centered cards |

### Decisions
- **Brand:** MAINTAIN AI — Predictive Infrastructure Command Center
- **Primary styling:** Fluent UI v9 + CSS variable system (glassmorphism/theming). Phase out shadcn.
- **Demo flow:** Map → Popup → Briefing → Analysis → Decay → Dispatch → AI Chat → SK Panel
- **State management:** React Context + useReducer (no external library)
- **No router needed:** Single page with overlays

---

## 🔗 Related Documents

- [CHANGELOG.md](CHANGELOG.md) — Version history
- [ERROR_LOG.md](ERROR_LOG.md) — Error tracking (ERR-001 – ERR-009)
- [DECISIONS.md](DECISIONS.md) — Architecture decisions
- [AGENT_WORK_LOG.md](AGENT_WORK_LOG.md) — Agent session tracking
