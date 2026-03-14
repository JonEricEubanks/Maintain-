# InfraWatch AI — Dataverse Table Definitions

## Overview

These table definitions power the **closed-loop AI operations** workflow:

```
AI Recommends → Manager Approves → Crew Dispatched → Field Inspection → Completion → AI Learns
```

## Tables

| Table Logical Name | Display Name | Purpose |
|---|---|---|
| `iw_crewdispatch` | Crew Dispatch | AI-generated dispatch assignments with approval workflow |
| `iw_fieldinspection` | Field Inspection | On-site condition reports and completion data from crews |
| `iw_aidecisionlog` | AI Decision Log | Audit trail of every AI recommendation (responsible AI) |
| `iw_crewschedule` | Crew Schedule | Weekly crew assignments, zone routing, availability |
| `iw_workorderupdate` | Work Order Update | Status change history for work orders |

## Setup

### Option A: Power Platform Admin Center
1. Navigate to make.powerapps.com → Tables → New Table
2. Create each table using the schemas defined in the JSON files in this folder

### Option B: CLI Script
```bash
# From project root:
python dataverse/setup_tables.py
```

### Option C: Solution Import
Import the `InfraWatchAI_DataverseSolution.zip` managed solution.

## Entity Relationship Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Work Order    │────▶│  Crew Dispatch    │────▶│ Field Inspection │
│   (MCP Source)  │     │  (iw_crewdispatch)│     │(iw_fieldinspection)│
└─────────────────┘     └──────────────────┘     └──────────────────┘
        │                       │                         │
        │                       │                         │
        ▼                       ▼                         │
┌─────────────────┐     ┌──────────────────┐              │
│ WO Update       │     │  Crew Schedule   │              │
│(iw_workorderupdate)│  │(iw_crewschedule) │              │
└─────────────────┘     └──────────────────┘              │
                                                          │
        ┌─────────────────────────────────────────────────┘
        ▼
┌──────────────────┐
│  AI Decision Log │  ◀── Every AI action is logged
│(iw_aidecisionlog)│
└──────────────────┘
```
