# 🧭 InfraWatch AI — Architecture Decision Records

This document captures key architecture decisions using a lightweight ADR format.

---

## ADR Format

```markdown
### ADR-XXX: [Decision Title]

**Status:** Proposed / Accepted / Deprecated / Superseded  
**Date:** YYYY-MM-DD  
**Deciders:** [Who made this decision]  

#### Context
What is the issue that we're seeing that is motivating this decision?

#### Decision
What is the change that we're proposing and/or doing?

#### Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| Option A | ... | ... |
| Option B | ... | ... |

#### Consequences
What becomes easier or more difficult because of this change?

#### Related
- Links to other ADRs, issues, or documents
```

---

## Decisions

### ADR-001: Use Microsoft Foundry Agent Service for Multi-Agent Orchestration

**Status:** Accepted  
**Date:** 2026-01-31  
**Deciders:** Project Team  

#### Context
The hackathon requires building a multi-agent reasoning system. We need to choose between:
- Microsoft Foundry Agent Service (cloud-hosted)
- Microsoft Agent Framework (local OSS)
- Custom orchestration code

#### Decision
Use **Microsoft Foundry Agent Service** with the Python SDK for agent development and orchestration.

#### Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| Foundry Agent Service | Native Azure integration, built-in monitoring, hackathon-aligned | Requires Azure subscription |
| Agent Framework (OSS) | Local development, no cloud costs | Less integrated with Foundry portal |
| Custom orchestration | Full control | Reinventing the wheel, time-consuming |

#### Consequences
- ✅ Easier: Built-in workflow visualization, MCP integration, telemetry
- ✅ Easier: Direct alignment with hackathon evaluation criteria
- ⚠️ Harder: Requires Azure Foundry project setup
- ⚠️ Harder: API costs for model usage

#### Related
- [README.md](../README.md) — Architecture diagram
- [PLAN.md](PLAN.md) — Phase 2: Agent Development

---

### ADR-002: Use InfraWatch MCP as Primary Data Source

**Status:** Accepted  
**Date:** 2026-01-31  
**Deciders:** Project Team  

#### Context
Need real infrastructure data for the demo. Options:
- Use existing InfraWatch MCP (already deployed to Azure Container Apps)
- Create mock data
- Use public datasets

#### Decision
Use the **existing InfraWatch MCP server** (endpoint configured via `INFRAWATCH_MCP_ENDPOINT` env var) which provides real Lake Forest, IL GIS data.

#### Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| InfraWatch MCP | Real data, already deployed, 9 tools available | Dependency on Azure ACA |
| Mock data | No external dependencies | Not impressive for demo |
| Public datasets | Free | Would need to build MCP wrapper |

#### Consequences
- ✅ Easier: 1,281+ real pothole records, weather, schools, priority scoring
- ✅ Easier: MCP already tested and running
- ⚠️ Risk: MCP server downtime during demo (mitigate: add fallback data)

#### Related
- [README.md](../README.md) — MCP Tools table

---

### ADR-003: Use Power Apps Code Apps with Leaflet for Frontend

**Status:** Accepted  
**Date:** 2026-01-31  
**Deciders:** Project Team  

#### Context
Need a map-based UI for infrastructure visualization. Options:
- Power Apps Canvas App (low-code)
- Power Apps Code Apps (React/TypeScript)
- Standalone React app

#### Decision
Use **Power Apps Code Apps** with React, TypeScript, Fluent UI v9, and **Leaflet** for mapping.

#### Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| Code Apps + Leaflet | Full React control, Dataverse integration, open-source map | More code to write |
| Canvas App + Power Apps Map | Low-code, native Power Platform | Limited customization |
| Standalone React | Maximum flexibility | No Dataverse, separate hosting |
| MapLibre GL | WebGL performance | Steeper learning curve |

#### Consequences
- ✅ Easier: Fluent UI v9 integration, Dataverse connection
- ✅ Easier: Leaflet is lightweight, well-documented
- ⚠️ Harder: Need to handle Power Apps SDK constraints
- ⚠️ Harder: Less WebGL performance than MapLibre

#### Related
- [PLAN.md](PLAN.md) — Phase 3: UI Development

---

### ADR-004: Crew Estimation Formula Design

**Status:** Accepted  
**Date:** 2026-01-31  
**Deciders:** Project Team  

#### Context
Need to estimate crew requirements based on work order volume. Must incorporate:
- Historical repair times
- Weather conditions
- Severity levels
- Issue types

#### Decision
Use the following formula:

```
Crews Required = Σ(issues × avgRepairTime × severityMultiplier × weatherFactor) / crewCapacityHours

Where:
- avgRepairTime: Historical average per issue type (from WorkOrderHistory)
  - Pothole: 0.5 hours
  - Sidewalk: 2.0 hours
  - Concrete: 4.0 hours
  
- severityMultiplier:
  - Low: 1.0
  - Medium: 1.5
  - High: 2.0
  - Critical: 3.0
  
- weatherFactor:
  - Clear (>50°F): 1.0
  - Cold (32-50°F): 1.2
  - Rain: 1.5
  - Freeze-thaw cycle: 1.8
  - Snow/Ice: 2.0
  
- crewCapacityHours: 8 hours × efficiency rating (default 0.8)
```

#### Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| Simple ratio (1 crew per 10 issues) | Easy to implement | Ignores severity, weather |
| ML model | More accurate | Overkill for hackathon, needs training data |
| Formula with factors | Balanced complexity, explainable | Requires tuning |

#### Consequences
- ✅ Easier: Explainable AI — can show "why" in UI
- ✅ Easier: Tunable parameters for demo scenarios
- ⚠️ Harder: Need historical data for avgRepairTime (will use estimates)

#### Related
- [README.md](../README.md) — Crew Estimation Formula section

---

### ADR-005: Dataverse Schema Design

**Status:** Accepted  
**Date:** 2026-01-31  
**Deciders:** Project Team  

#### Context
Need to store historical metrics, AI insights, and crew data for:
- Crew estimation calculations
- AI reasoning persistence
- Audit trail

#### Decision
Create 4 Dataverse tables:

**1. WorkOrderHistory**
| Column | Type | Description |
|--------|------|-------------|
| workOrderId | GUID (PK) | Primary key |
| issueType | Choice | Pothole/Sidewalk/Concrete |
| severity | Choice | Low/Medium/High/Critical |
| repairDuration | Number | Hours to complete |
| crewSize | Number | Crew members assigned |
| weatherCondition | Choice | Clear/Cold/Rain/etc |
| temperature | Number | Degrees F at repair time |
| resolvedOn | DateTime | Completion timestamp |

**2. CrewCapacity**
| Column | Type | Description |
|--------|------|-------------|
| crewId | GUID (PK) | Primary key |
| name | Text | Crew name |
| specialization | Choice | Pothole/Sidewalk/Concrete/General |
| efficiencyRating | Number | 0.0-1.0 |
| status | Choice | Available/Assigned/OffDuty |
| currentLat | Number | GPS latitude |
| currentLng | Number | GPS longitude |

**3. WeatherLog**
| Column | Type | Description |
|--------|------|-------------|
| logId | GUID (PK) | Primary key |
| timestamp | DateTime | Reading time |
| temperature | Number | Degrees F |
| condition | Choice | Clear/Rain/Snow/etc |
| windSpeed | Number | MPH |
| zone | Text | City zone ID |

**4. AIInsight**
| Column | Type | Description |
|--------|------|-------------|
| insightId | GUID (PK) | Primary key |
| type | Choice | Priority/CrewEstimate/Prediction |
| confidence | Number | 0.0-1.0 |
| reasoning | Text (JSON) | Structured reasoning steps |
| recommendation | Text | Human-readable suggestion |
| createdOn | DateTime | Generated timestamp |
| expiresOn | DateTime | Validity window |

#### Consequences
- ✅ Easier: Structured data for crew estimation formula
- ✅ Easier: AI insights persisted for transparency panel
- ⚠️ Harder: Need to create tables in Power Platform

#### Related
- [PLAN.md](PLAN.md) — Phase 4: Integration

---

### ADR-006: AI Transparency Design Pattern

**Status:** Accepted  
**Date:** 2026-01-31  
**Deciders:** Project Team  

#### Context
Judges value explainable AI. Need to show "why" behind AI recommendations.

#### Decision
Implement **AI Companion Panel** with:
1. **Reasoning Steps** — Numbered steps showing agent thought process
2. **Confidence Scores** — Percentage confidence for each recommendation
3. **Data Sources** — Which MCP tools were called
4. **Factor Weights** — Which factors influenced the decision

```tsx
<AICompanionPanel>
  <ReasoningSteps>
    <Step num={1} confidence={0.92}>Analyzed 847 work orders from MCP</Step>
    <Step num={2} confidence={0.87}>Weather forecast shows freeze-thaw cycle</Step>
    <Step num={3} confidence={0.94}>School proximity detected for 12 issues</Step>
  </ReasoningSteps>
  <Recommendation confidence={0.91}>
    Pre-position 3 pothole crews in Zone 4B
  </Recommendation>
  <Factors>
    <Factor name="Weather" weight={0.35} />
    <Factor name="Severity" weight={0.30} />
    <Factor name="School Proximity" weight={0.20} />
    <Factor name="Age" weight={0.15} />
  </Factors>
</AICompanionPanel>
```

#### Consequences
- ✅ Easier: Meets hackathon evaluation criteria for reasoning transparency
- ✅ Easier: Users understand and trust recommendations
- ⚠️ Harder: More UI components to build

#### Related
- [PLAN.md](PLAN.md) — Phase 3: AI Companion Panel

---

## Pending Decisions

### ADR-007: Voice Command Integration (Proposed)

**Status:** Proposed  
**Date:** 2026-01-31  

#### Context
Voice commands could add high wow-factor to demo ("Hey InfraWatch, show critical issues near schools").

#### Options
- Web Speech API (browser native)
- Azure Speech Services
- Skip voice (focus on core features)

#### Decision
*To be decided based on time remaining after core features.*

---

## Links

- [PLAN.md](PLAN.md) — Implementation roadmap
- [CHANGELOG.md](CHANGELOG.md) — Version history
- [ERROR_LOG.md](ERROR_LOG.md) — Error tracking
