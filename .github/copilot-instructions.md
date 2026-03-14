# MAINTAIN AI — GitHub Copilot Instructions

This project is a multi-agent predictive infrastructure command center.
GitHub Copilot Agent Mode was used throughout development to scaffold,
implement, test, and refactor all major subsystems.

## Project Architecture

- **Frontend**: React 18 + TypeScript + Fluent UI v9 in `src/`
- **Backend**: Python 3.12 FastAPI agents in `agents/`
- **Data**: MCP server (JSON-RPC 2.0) + Dataverse (6 tables) + Azure Table Storage
- **AI Models**: Azure AI Foundry (GPT-4.1, GPT-4.1-mini, GPT-4o, Phi-4, Phi-4-reasoning)

## Copilot Agent Mode Usage

Copilot Agent Mode was used for:

1. **Multi-file agent scaffolding** — Generating the 6-agent pipeline architecture
   (`analysisAgent.py`, `prioritizationAgent.py`, `crewEstimationAgent.py`,
   `dispatchAgent.py`, `reportAgent.py`, `nlpDashboardAgent.py`) with consistent
   patterns: Model Router integration, MCP data fetching, structured output.

2. **Test generation** — Creating 350+ unit tests across 11 test files, with
   Copilot generating test cases for edge conditions, boundary values, and
   mock-based isolation of external services.

3. **Refactoring** — Extracting the shared `mcp_client.py` module from duplicated
   MCP call code across 4 agents, maintaining backward compatibility.

4. **Frontend component development** — Building 57 React components including
   complex interactive features like the Decay Simulator timeline, NLP Dashboard
   Builder, and Agent Trace Viewer waterfall visualization.

5. **Azure deployment scripting** — Generating `deploy-aca.ps1` for Container Apps
   deployment, Dockerfile with security best practices (non-root user), and
   Dataverse table provisioning scripts.

## Code Conventions

- Python agents use `model_router.py` for all LLM calls — never direct SDK usage
- MCP calls go through `mcp_client.py` — never inline `requests.post` to MCP
- All agents return structured dicts; orchestrator passes them via `AgentContext`
- Frontend services in `src/services/` handle all API communication
- Fluent UI v9 components with `webDarkTheme` — no raw HTML styling
- Content Safety is fail-closed: unchecked content is blocked by default

## Key Commands

```bash
# Start frontend
npm start

# Start agent server
cd agents && uvicorn api_server:app --host 0.0.0.0 --port 8100 --reload

# Run tests
cd agents && python -m pytest tests/ -v

# Deploy to Azure Container Apps
cd agents && .\deploy-aca.ps1 -ResourceGroup procert-ai-rg -AcrName infrawatchacr

# Publish to Power Apps
npm run build && pac code push
```

# Power SDK Instructions Start
## Overview

This guide explains how to initialize an app, add a data source using the Power SDK CLI and generate the corresponding Models and Services, and publish the app.

**Always continue immediately** without asking for confirmation at each step.

## CLI Command

Use the following command to initialize an app:

```bash
pac code init -n <app name> -env <environmentId>
```

**Example:**

```bash
pac code init -n "Asset Tracker" -env "0aa4969d-c8e7-e0a7-9bf8-6925c5922de3"
```

Use the following command to add a data source:

```bash
pac code add-data-source -a <apiId> -c <connectionId>
```

**Example:**

```bash
pac code add-data-source -a "shared_office365users" -c "aa35d97110f747a49205461cbfcf8558"
```

If additional parameters such as table and dataset are required, use:

```bash
pac code add-data-source -a <apiId> -c <connectionId> -t <tableName> -d <datasetName>
```

**Example:**

```bash
pac code add-data-source -a "shared_sql" -c "12767db082494ab482618ce5703fe6e9" -t "[dbo].[MobileDeviceInventory]" -d "paconnectivitysql0425.database.windows.net,paruntimedb"
```

Use the following command to publish an app:

```bash
npm run build
pac code push
```

**Example:**

```bash
pac code push
```

## Using Model and Service

- Read the files under src\Models and src\Services folder for data binding.
- Read the files under .power\schemas folder for other schema reference.
# Power SDK Instructions End