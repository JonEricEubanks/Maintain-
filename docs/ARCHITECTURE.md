# MAINTAIN AI — System Architecture

> Multi-Agent Predictive Infrastructure Command Center for Lake Forest, IL

## Architecture Diagram

```mermaid
flowchart TB
    subgraph Frontend["React Frontend (Power Apps Code Apps)"]
        direction TB
        UI["Fluent UI v9 + Glassmorphism<br/>47 Components • 14 Services"]
        Map["Leaflet Maps + GIS Clusters"]
        Overlays["Overlay System<br/>Briefing • Analysis Wizard • Dispatch"]
        Demo["Demo Mode + Welcome Tour"]
    end

    subgraph Backend["FastAPI Agent Server (Azure Container Apps)"]
        direction TB
        API["FastAPI API Server<br/>30+ Endpoints • CORS • OTel"]
        
        subgraph Orchestration["A2A Agent Orchestrator"]
            direction LR
            Planner["SK Planner<br/>(Autonomous Selection)"]
            Parallel["Parallel Executor<br/>(ThreadPoolExecutor)"]
            Feedback["Feedback Loops<br/>(Bidirectional A2A)"]
            Stream["SSE Streaming<br/>(Real-time Events)"]
        end

        subgraph Agents["6 Specialized Agents (All LLM-Powered)"]
            direction LR
            Analysis["Analysis<br/>Agent"]
            Priority["Prioritization<br/>Agent<br/>(Hybrid: Formula + LLM)"]
            Crew["Crew Estimation<br/>Agent<br/>(Hybrid: Formula + LLM)"]
            Dispatch["Dispatch<br/>Agent"]
            Report["Report<br/>Agent"]
            NLP["NLP Dashboard<br/>Agent"]
        end

        subgraph SK["Semantic Kernel v1.39"]
            Plugins["8 Plugins<br/>14+ Functions"]
            KernelFn["@kernel_function<br/>Decorators"]
        end

        subgraph Router["Model Router"]
            direction LR
            GPT41["GPT-4.1<br/>(Premier)"]
            Mini["GPT-4.1-mini<br/>(Standard)"]
            GPT4o["GPT-4o<br/>(Premier)"]
            Phi4["Phi-4<br/>(Lightweight)"]
            PhiR["Phi-4-reasoning<br/>(Reasoning)"]
        end

        Safety["Content Safety<br/>4-Category Screening"]
        RAG["RAG Pipeline<br/>Embeddings + TF-IDF"]
        ML["ML Service<br/>scikit-learn"]
        ROI["Cost/ROI Engine<br/>Municipal Benchmarks"]
    end

    subgraph Azure["Azure Services"]
        direction TB
        Foundry["Azure AI Foundry<br/>5 Models"]
        ACA["Azure Container Apps"]
        ACR["Azure Container Registry"]
        CS["Azure Content Safety"]
        AppIns["Application Insights<br/>OpenTelemetry"]
        Tables["Azure Table Storage"]
        DV["Dataverse<br/>6 Tables"]
        Embed["Embeddings Service<br/>text-embedding-3-small"]
    end

    subgraph Data["MCP Data Server (Azure Container Apps)"]
        MCP["10 MCP Tools<br/>JSON-RPC 2.0"]
        GIS["Lake Forest GIS<br/>1,281+ Records"]
    end

    subgraph Protocol["Activity Protocol"]
        A2A["/.well-known/agent.json<br/>Agent Cards (A2A/1.0)"]
    end

    Frontend -->|"HTTP/SSE"| API
    API --> Orchestration
    Orchestration --> Agents
    Orchestration --> SK
    SK --> Agents
    Agents --> Router
    Router --> Foundry
    Agents --> Safety
    Safety --> CS
    Agents --> RAG
    RAG --> Embed
    Agents --> MCP
    MCP --> GIS
    API --> ROI
    API --> A2A
    Backend --> AppIns
    Backend --> Tables
    Backend --> DV
    Backend --> ACA

    style Frontend fill:#1e3a5f,stroke:#3b82f6,color:#fff
    style Backend fill:#1a1a2e,stroke:#8b5cf6,color:#fff
    style Azure fill:#0f172a,stroke:#0ea5e9,color:#fff
    style Data fill:#1a2332,stroke:#10b981,color:#fff
    style Protocol fill:#2d1b69,stroke:#a78bfa,color:#fff
    style Orchestration fill:#2d1b4e,stroke:#a78bfa,color:#fff
    style Agents fill:#1e293b,stroke:#f59e0b,color:#fff
    style Router fill:#1e293b,stroke:#06b6d4,color:#fff
    style SK fill:#1e293b,stroke:#ec4899,color:#fff
```

## Component Summary

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | React 18, TypeScript, Fluent UI v9, Power Apps Code Apps | 47 components, 14 services, Leaflet maps, glassmorphism |
| **Agent Server** | FastAPI, Python 3.12, Azure Container Apps | 30+ endpoints, CORS, OTel distributed tracing |
| **Orchestrator** | A2A Agent-to-Agent Protocol | 7 pipelines (sequential + parallel + feedback + negotiation), SSE streaming |
| **SK Integration** | Semantic Kernel v1.39 | 8 plugins (6 agent + ContentSafety + ML), 14+ functions, autonomous planner |
| **Model Router** | Azure AI Foundry (5 models) | GPT-4.1, GPT-4.1-mini, GPT-4o, Phi-4, Phi-4-reasoning |
| **RAG** | text-embedding-3-small (1536d) + TF-IDF | 12+ curated knowledge documents |
| **Safety** | Azure Content Safety | 4-category screening (Hate, Violence, Self-Harm, Sexual) |
| **Data** | MCP Server (10 tools), Dataverse (6 tables), Table Storage | Lake Forest GIS: 1,281+ real infrastructure records |
| **Observability** | Azure Application Insights, OpenTelemetry | Custom `@traced` decorator, in-memory ring buffer |

## Key Protocols

- **A2A (Agent-to-Agent)**: `/.well-known/agent.json` agent cards, structured handoff messages
- **MCP (Model Context Protocol)**: JSON-RPC 2.0, 10 tools for GIS data retrieval
- **Activity Protocol**: Agent discovery, capability negotiation, streaming events
- **SSE (Server-Sent Events)**: Real-time pipeline execution streaming to frontend
