"""
InfraWatch AI — Dataverse Web API CRUD Service

Provides CRUD operations against the real Dataverse environment
(configured via DATAVERSE_URL environment variable).

Tables (publisher prefix: iw_):
  - iw_crewdispatch
  - iw_fieldinspection
  - iw_aidecisionlog
  - iw_crewschedule
  - iw_workorderupdate

Auth: Uses `az account get-access-token` or a client_credentials flow.
For local dev, `az login` must be active for the CE tenant.

NOTE: This module is a BACKEND service. The React frontend calls
      /api/data/* endpoints on api_server.py which delegates here.
"""

import os
import json
import subprocess
import uuid
import traceback
from datetime import datetime, timezone
from typing import Any, Optional

import requests
import re

# ============================================
# Configuration
# ============================================

DATAVERSE_URL = os.getenv("DATAVERSE_URL", "")
if not DATAVERSE_URL:
    print("\u26a0\ufe0f  DATAVERSE_URL not set \u2014 Dataverse CRUD operations will fail")


# ============================================
# OData Filter Sanitization (prevent injection)
# ============================================

_ODATA_UNSAFE_PATTERN = re.compile(r"[';()\\]")  # reject quotes, parens, backslash


def _sanitize_odata_value(value: str) -> str:
    """Sanitize a string value before embedding in an OData $filter expression.
    
    Raises ValueError if the value contains characters that could
    alter filter logic (single quotes, parentheses, backslashes).
    """
    if _ODATA_UNSAFE_PATTERN.search(value):
        raise ValueError(f"Invalid filter value: contains prohibited characters")
    # Also reject OData operators that could alter query logic
    lower = value.lower().strip()
    for keyword in (" eq ", " ne ", " gt ", " lt ", " ge ", " le ", " and ", " or ", " not "):
        if keyword in f" {lower} ":
            raise ValueError(f"Invalid filter value: contains OData operator")
    return value

# Entity set names (Dataverse Web API uses collection names)
# Dataverse auto-generates these as {logicalname} + 'es' typically
ENTITY_SETS = {
    "dispatches": "iw_crewdispatchs",
    "inspections": "iw_fieldinspections",
    "decisions": "iw_aidecisionlogs",
    "schedules": "iw_crewschedules",
    "updates": "iw_workorderupdates",
    "crewmembers": "iw_crewmembers",
}

# Column name mapping (TypeScript → Dataverse logical names)
DISPATCH_COLUMNS = {
    "workOrderId": "iw_workorderid",
    "crewId": "iw_crewid",
    "crewName": "iw_crewname",
    "status": "iw_status",
    "priority": "iw_priority",
    "issueType": "iw_issuetype",
    "address": "iw_address",
    "latitude": "iw_latitude",
    "longitude": "iw_longitude",
    "estimatedDuration": "iw_estimatedduration",
    "estimatedCost": "iw_estimatedcost",
    "actualDuration": "iw_actualduration",
    "actualCost": "iw_actualcost",
    "aiConfidence": "iw_aiconfidence",
    "aiReasoning": "iw_aireasoning",
    "approvedBy": "iw_approvedby",
    "approvedOn": "iw_approvedon",
    "dispatchedOn": "iw_dispatchedon",
    "completedOn": "iw_completedon",
    "weatherAtDispatch": "iw_weatheratdispatch",
    "nearSchool": "iw_nearschool",
    "zone": "iw_zone",
}

INSPECTION_COLUMNS = {
    "dispatchId": "iw_dispatchid",
    "workOrderId": "iw_workorderid",
    "inspectorName": "iw_inspectorname",
    "inspectionType": "iw_inspectiontype",
    "conditionRating": "iw_conditionrating",
    "repairCompleted": "iw_repaircompleted",
    "timeSpent": "iw_timespent",
    "materialsUsed": "iw_materialsused",
    "safetyHazardsFound": "iw_safetyhazardsfound",
    "hazardDescription": "iw_hazarddescription",
    "notes": "iw_notes",
    "weatherCondition": "iw_weathercondition",
    "temperature": "iw_temperature",
    "latitude": "iw_latitude",
    "longitude": "iw_longitude",
}

DECISION_COLUMNS = {
    "agentName": "iw_agentname",
    "decisionType": "iw_decisiontype",
    "inputSummary": "iw_inputsummary",
    "outputSummary": "iw_outputsummary",
    "confidenceScore": "iw_confidencescore",
    "reasoningJson": "iw_reasoningjson",
    "tokensUsed": "iw_tokensused",
    "processingTimeMs": "iw_processingtimems",
    "modelName": "iw_modelname",
    "humanOverride": "iw_humanoverride",
    "overrideReason": "iw_overridereason",
    "relatedWorkOrderIds": "iw_relatedworkorderids",
}

SCHEDULE_COLUMNS = {
    "crewId": "iw_crewid",
    "crewName": "iw_crewname",
    "weekStart": "iw_weekstart",
    "scheduledHours": "iw_scheduledhours",
    "actualHours": "iw_actualhours",
    "dispatchIds": "iw_dispatchids",
    "notes": "iw_notes",
}

UPDATE_COLUMNS = {
    "workOrderId": "iw_workorderid",
    "previousStatus": "iw_previousstatus",
    "newStatus": "iw_newstatus",
    "updatedBy": "iw_updatedby",
    "updatedSource": "iw_updatedsource",
    "notes": "iw_notes",
}

CREWMEMBER_COLUMNS = {
    "crewId": "iw_crewid",
    "specialization": "iw_specialization",
    "status": "iw_status",
    "efficiencyRating": "iw_efficiencyrating",
    "currentLat": "iw_currentlat",
    "currentLng": "iw_currentlng",
    "memberCount": "iw_membercount",
    "email": "iw_email",
    "phone": "iw_phone",
    "certifications": "iw_certifications",
    "assignedWorkOrders": "iw_assignedworkorders",
    "zone": "iw_zone",
    "hireDate": "iw_hiredate",
    "isActive": "iw_isactive",
}

COLUMN_MAPS = {
    "dispatches": DISPATCH_COLUMNS,
    "inspections": INSPECTION_COLUMNS,
    "decisions": DECISION_COLUMNS,
    "schedules": SCHEDULE_COLUMNS,
    "updates": UPDATE_COLUMNS,
    "crewmembers": CREWMEMBER_COLUMNS,
}

# ============================================
# Token Management
# ============================================

_cached_token: Optional[str] = None
_token_expires: float = 0


def _get_access_token() -> str:
    """Obtain an access token for Dataverse via az CLI or env var."""
    global _cached_token, _token_expires
    import time

    # Check cached token
    if _cached_token and time.time() < _token_expires - 60:
        return _cached_token

    # Try environment variable first (for CI/CD or service principal)
    env_token = os.getenv("DATAVERSE_ACCESS_TOKEN")
    if env_token:
        _cached_token = env_token
        _token_expires = time.time() + 3600  # Assume 1h
        return env_token

    # Use az CLI to get token
    try:
        result = subprocess.run(
            [
                "az", "account", "get-access-token",
                "--resource", DATAVERSE_URL,
                "--query", "accessToken",
                "-o", "tsv",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            _cached_token = result.stdout.strip()
            _token_expires = time.time() + 3000  # ~50 min
            return _cached_token
        else:
            raise RuntimeError(f"az CLI failed: {result.stderr.strip()}")
    except FileNotFoundError:
        raise RuntimeError("az CLI not found. Install Azure CLI or set DATAVERSE_ACCESS_TOKEN.")


def _headers() -> dict:
    """Standard headers for Dataverse Web API requests."""
    token = _get_access_token()
    return {
        "Authorization": f"Bearer {token}",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "Prefer": "return=representation",
    }


def _api_url(entity_set: str) -> str:
    return f"{DATAVERSE_URL}/api/data/v9.2/{entity_set}"


# ============================================
# Initialization
# ============================================

_dv_ready: bool = False


def initialize() -> bool:
    """Test connectivity to Dataverse. Returns True if accessible."""
    global _dv_ready
    try:
        token = _get_access_token()
        # Quick test: query entity definitions (lightweight)
        resp = requests.get(
            f"{DATAVERSE_URL}/api/data/v9.2/EntityDefinitions?$top=1&$select=LogicalName",
            headers=_headers(),
            timeout=10,
        )
        if resp.status_code == 200:
            _dv_ready = True
            print(f"✅ Dataverse connected: {DATAVERSE_URL}")
            return True
        else:
            print(f"⚠️  Dataverse returned {resp.status_code}: {resp.text[:200]}")
            _dv_ready = False
            return False
    except Exception as e:
        print(f"⚠️  Dataverse connection failed: {e}")
        _dv_ready = False
        return False


def is_ready() -> bool:
    return _dv_ready


# ============================================
# Generic CRUD Helpers
# ============================================

def _map_to_dv(data: dict, table_key: str) -> dict:
    """Map frontend field names to Dataverse column logical names."""
    col_map = COLUMN_MAPS.get(table_key, {})
    dv_data = {}
    for k, v in data.items():
        dv_col = col_map.get(k)
        if dv_col:
            # Handle special types
            if isinstance(v, list):
                dv_data[dv_col] = json.dumps(v)
            elif isinstance(v, bool):
                dv_data[dv_col] = v
            elif isinstance(v, (int, float)):
                dv_data[dv_col] = v
            else:
                dv_data[dv_col] = str(v) if v is not None else None
    return dv_data


def _map_from_dv(entity: dict, table_key: str) -> dict:
    """Map Dataverse columns back to frontend field names."""
    col_map = COLUMN_MAPS.get(table_key, {})
    reverse_map = {v: k for k, v in col_map.items()}
    result = {}
    
    # Extract the primary key
    pk_col = _get_pk_column(table_key)
    if pk_col in entity:
        result["id"] = entity[pk_col]
    
    # Map name
    name_col = f"iw_{table_key.rstrip('s') if table_key != 'decisions' else 'aidecisionlog'}"
    # Fallback: use iw_name or the first column with 'name' in it
    for key in entity:
        if key.endswith("_name") or key == "iw_name":
            result["name"] = entity[key]
            break
    
    for dv_col, value in entity.items():
        frontend_key = reverse_map.get(dv_col)
        if frontend_key:
            # Try to parse JSON arrays
            if isinstance(value, str) and value.startswith("["):
                try:
                    result[frontend_key] = json.loads(value)
                except json.JSONDecodeError:
                    result[frontend_key] = value
            else:
                result[frontend_key] = value
    
    # Add timestamps
    if "createdon" in entity:
        result["createdAt"] = entity["createdon"]
    if "modifiedon" in entity:
        result["updatedAt"] = entity["modifiedon"]
    
    return result


def _get_pk_column(table_key: str) -> str:
    """Get the primary key column name for a table."""
    table_names = {
        "dispatches": "iw_crewdispatchid",
        "inspections": "iw_fieldinspectionid",
        "decisions": "iw_aidecisionlogid",
        "schedules": "iw_crewscheduleid",
        "updates": "iw_workorderupdateid",
        "crewmembers": "iw_crewmemberid",
    }
    return table_names.get(table_key, "")


# ============================================
# Dispatch CRUD
# ============================================

def create_dispatch(data: dict) -> dict:
    """Create a crew dispatch record in Dataverse."""
    entity_set = ENTITY_SETS["dispatches"]
    dv_data = _map_to_dv(data, "dispatches")
    
    # Set default name
    addr = data.get("address", "Unknown")
    crew = data.get("crewName", "TBD")
    dv_data["iw_name"] = f"Dispatch: {crew} → {addr[:40]}"
    
    resp = requests.post(
        _api_url(entity_set),
        headers=_headers(),
        json=dv_data,
        timeout=15,
    )
    if resp.status_code in (200, 201, 204):
        result = resp.json() if resp.content else dv_data
        mapped = _map_from_dv(result, "dispatches")
        mapped.setdefault("id", str(uuid.uuid4()))
        mapped.setdefault("name", dv_data.get("iw_name", ""))
        mapped.setdefault("createdAt", datetime.now(timezone.utc).isoformat())
        return mapped
    else:
        raise RuntimeError(f"Dataverse create dispatch failed ({resp.status_code}): {resp.text[:300]}")


def get_dispatches(
    status: Optional[str] = None,
    crew_id: Optional[str] = None,
    priority: Optional[str] = None,
) -> list:
    """List dispatch records with optional filters."""
    entity_set = ENTITY_SETS["dispatches"]
    filters = []
    if status:
        filters.append(f"iw_status eq '{_sanitize_odata_value(status)}'")
    if crew_id:
        filters.append(f"iw_crewid eq '{_sanitize_odata_value(crew_id)}'")
    if priority:
        filters.append(f"iw_priority eq '{_sanitize_odata_value(priority)}'")
    
    url = _api_url(entity_set)
    params: dict[str, str] = {"$orderby": "createdon desc", "$top": "100"}
    if filters:
        params["$filter"] = " and ".join(filters)
    
    resp = requests.get(url, headers=_headers(), params=params, timeout=15)
    if resp.status_code == 200:
        entities = resp.json().get("value", [])
        return [_map_from_dv(e, "dispatches") for e in entities]
    else:
        print(f"Dataverse get dispatches failed ({resp.status_code}): {resp.text[:200]}")
        return []


def update_dispatch(dispatch_id: str, data: dict) -> Optional[dict]:
    """Update a dispatch record by ID."""
    entity_set = ENTITY_SETS["dispatches"]
    pk_col = _get_pk_column("dispatches")
    dv_data = _map_to_dv(data, "dispatches")
    
    url = f"{_api_url(entity_set)}({dispatch_id})"
    resp = requests.patch(url, headers=_headers(), json=dv_data, timeout=15)
    if resp.status_code in (200, 204):
        return {"id": dispatch_id, **data, "updated": True}
    elif resp.status_code == 404:
        return None
    else:
        raise RuntimeError(f"Dataverse update dispatch failed ({resp.status_code}): {resp.text[:300]}")


def complete_dispatch(dispatch_id: str, actual_duration: float, actual_cost: float) -> Optional[dict]:
    """Mark a dispatch as completed with actuals."""
    return update_dispatch(dispatch_id, {
        "status": "completed",
        "actualDuration": actual_duration,
        "actualCost": actual_cost,
        "completedOn": datetime.now(timezone.utc).isoformat(),
    })


# ============================================
# Inspection CRUD
# ============================================

def create_inspection(data: dict) -> dict:
    """Create a field inspection record."""
    entity_set = ENTITY_SETS["inspections"]
    dv_data = _map_to_dv(data, "inspections")
    dv_data["iw_name"] = f"Inspection: {data.get('inspectorName', 'Unknown')} — {data.get('inspectionType', 'routine')}"
    
    resp = requests.post(_api_url(entity_set), headers=_headers(), json=dv_data, timeout=15)
    if resp.status_code in (200, 201, 204):
        result = resp.json() if resp.content else dv_data
        mapped = _map_from_dv(result, "inspections")
        mapped.setdefault("id", str(uuid.uuid4()))
        mapped.setdefault("createdAt", datetime.now(timezone.utc).isoformat())
        return mapped
    else:
        raise RuntimeError(f"Dataverse create inspection failed ({resp.status_code}): {resp.text[:300]}")


def get_inspections(
    dispatch_id: Optional[str] = None,
    work_order_id: Optional[str] = None,
    inspection_type: Optional[str] = None,
) -> list:
    entity_set = ENTITY_SETS["inspections"]
    filters = []
    if dispatch_id:
        filters.append(f"iw_dispatchid eq '{_sanitize_odata_value(dispatch_id)}'")
    if work_order_id:
        filters.append(f"iw_workorderid eq '{_sanitize_odata_value(work_order_id)}'")
    if inspection_type:
        filters.append(f"iw_inspectiontype eq '{_sanitize_odata_value(inspection_type)}'")
    
    url = _api_url(entity_set)
    params: dict[str, str] = {"$orderby": "createdon desc", "$top": "100"}
    if filters:
        params["$filter"] = " and ".join(filters)
    
    resp = requests.get(url, headers=_headers(), params=params, timeout=15)
    if resp.status_code == 200:
        return [_map_from_dv(e, "inspections") for e in resp.json().get("value", [])]
    return []


# ============================================
# AI Decision Log CRUD
# ============================================

def log_decision(data: dict) -> dict:
    """Log an AI decision for governance/audit."""
    entity_set = ENTITY_SETS["decisions"]
    dv_data = _map_to_dv(data, "decisions")
    agent = data.get("agentName", "system")
    dtype = data.get("decisionType", "general")
    dv_data["iw_name"] = f"AI: {agent} — {dtype}"
    
    resp = requests.post(_api_url(entity_set), headers=_headers(), json=dv_data, timeout=15)
    if resp.status_code in (200, 201, 204):
        result = resp.json() if resp.content else dv_data
        mapped = _map_from_dv(result, "decisions")
        mapped.setdefault("id", str(uuid.uuid4()))
        mapped.setdefault("createdAt", datetime.now(timezone.utc).isoformat())
        return mapped
    else:
        raise RuntimeError(f"Dataverse log decision failed ({resp.status_code}): {resp.text[:300]}")


def get_decisions(
    agent_name: Optional[str] = None,
    decision_type: Optional[str] = None,
    work_order_id: Optional[str] = None,
    limit: int = 100,
) -> list:
    entity_set = ENTITY_SETS["decisions"]
    filters = []
    if agent_name:
        filters.append(f"iw_agentname eq '{_sanitize_odata_value(agent_name)}'")
    if decision_type:
        filters.append(f"iw_decisiontype eq '{_sanitize_odata_value(decision_type)}'")
    if work_order_id:
        filters.append(f"contains(iw_relatedworkorderids, '{_sanitize_odata_value(work_order_id)}')")
    
    url = _api_url(entity_set)
    params: dict[str, str] = {"$orderby": "createdon desc", "$top": str(limit)}
    if filters:
        params["$filter"] = " and ".join(filters)
    
    resp = requests.get(url, headers=_headers(), params=params, timeout=15)
    if resp.status_code == 200:
        return [_map_from_dv(e, "decisions") for e in resp.json().get("value", [])]
    return []


def get_decision_stats() -> dict:
    """Compute aggregate stats over AI decisions."""
    all_decisions = get_decisions(limit=500)
    if not all_decisions:
        return {
            "total": 0,
            "byAgent": {},
            "overrideRate": 0.0,
            "avgConfidence": 0.0,
            "avgProcessingTime": 0.0,
        }
    
    by_agent: dict[str, int] = {}
    overrides = 0
    total_conf = 0.0
    total_time = 0.0
    conf_count = 0
    time_count = 0
    
    for d in all_decisions:
        agent = d.get("agentName", "unknown")
        by_agent[agent] = by_agent.get(agent, 0) + 1
        if d.get("humanOverride"):
            overrides += 1
        conf = d.get("confidenceScore")
        if conf is not None:
            total_conf += float(conf)
            conf_count += 1
        pt = d.get("processingTimeMs")
        if pt is not None:
            total_time += float(pt)
            time_count += 1
    
    return {
        "total": len(all_decisions),
        "byAgent": by_agent,
        "overrideRate": overrides / len(all_decisions) if all_decisions else 0,
        "avgConfidence": total_conf / conf_count if conf_count else 0,
        "avgProcessingTime": total_time / time_count if time_count else 0,
    }


# ============================================
# Schedule CRUD
# ============================================

def create_schedule(data: dict) -> dict:
    entity_set = ENTITY_SETS["schedules"]
    dv_data = _map_to_dv(data, "schedules")
    dv_data["iw_name"] = f"Schedule: {data.get('crewName', 'Unknown')} — {data.get('weekStart', 'TBD')}"
    
    resp = requests.post(_api_url(entity_set), headers=_headers(), json=dv_data, timeout=15)
    if resp.status_code in (200, 201, 204):
        result = resp.json() if resp.content else dv_data
        mapped = _map_from_dv(result, "schedules")
        mapped.setdefault("id", str(uuid.uuid4()))
        return mapped
    raise RuntimeError(f"Failed ({resp.status_code}): {resp.text[:200]}")


def get_schedules(crew_id: Optional[str] = None, week_start: Optional[str] = None) -> list:
    entity_set = ENTITY_SETS["schedules"]
    filters = []
    if crew_id:
        filters.append(f"iw_crewid eq '{_sanitize_odata_value(crew_id)}'")
    if week_start:
        filters.append(f"iw_weekstart eq '{_sanitize_odata_value(week_start)}'")
    
    params: dict[str, str] = {"$orderby": "createdon desc", "$top": "50"}
    if filters:
        params["$filter"] = " and ".join(filters)
    
    resp = requests.get(_api_url(entity_set), headers=_headers(), params=params, timeout=15)
    if resp.status_code == 200:
        return [_map_from_dv(e, "schedules") for e in resp.json().get("value", [])]
    return []


# ============================================
# Work Order Update CRUD
# ============================================

def log_work_order_update(data: dict) -> dict:
    entity_set = ENTITY_SETS["updates"]
    dv_data = _map_to_dv(data, "updates")
    dv_data["iw_name"] = f"Update: {data.get('workOrderId', '?')} → {data.get('newStatus', '?')}"
    
    resp = requests.post(_api_url(entity_set), headers=_headers(), json=dv_data, timeout=15)
    if resp.status_code in (200, 201, 204):
        result = resp.json() if resp.content else dv_data
        mapped = _map_from_dv(result, "updates")
        mapped.setdefault("id", str(uuid.uuid4()))
        return mapped
    raise RuntimeError(f"Failed ({resp.status_code}): {resp.text[:200]}")


def get_work_order_updates(work_order_id: Optional[str] = None) -> list:
    entity_set = ENTITY_SETS["updates"]
    params: dict[str, str] = {"$orderby": "createdon desc", "$top": "100"}
    if work_order_id:
        params["$filter"] = f"iw_workorderid eq '{_sanitize_odata_value(work_order_id)}'"
    
    resp = requests.get(_api_url(entity_set), headers=_headers(), params=params, timeout=15)
    if resp.status_code == 200:
        return [_map_from_dv(e, "updates") for e in resp.json().get("value", [])]
    return []


# ============================================
# Crew Member CRUD
# ============================================

def create_crew_member(data: dict) -> dict:
    """Create a crew member record in Dataverse."""
    entity_set = ENTITY_SETS["crewmembers"]
    dv_data = _map_to_dv(data, "crewmembers")
    dv_data["iw_name"] = data.get("name", f"Crew: {data.get('crewId', 'Unknown')}")

    resp = requests.post(_api_url(entity_set), headers=_headers(), json=dv_data, timeout=15)
    if resp.status_code in (200, 201, 204):
        result = resp.json() if resp.content else dv_data
        mapped = _map_from_dv(result, "crewmembers")
        mapped.setdefault("id", str(uuid.uuid4()))
        mapped.setdefault("name", dv_data.get("iw_name", ""))
        mapped.setdefault("createdAt", datetime.now(timezone.utc).isoformat())
        return mapped
    else:
        raise RuntimeError(f"Dataverse create crew member failed ({resp.status_code}): {resp.text[:300]}")


def get_crew_members(
    specialization: Optional[str] = None,
    status: Optional[str] = None,
    active_only: bool = True,
) -> list:
    """List crew member records with optional filters."""
    entity_set = ENTITY_SETS["crewmembers"]
    filters = []
    if specialization:
        filters.append(f"iw_specialization eq '{_sanitize_odata_value(specialization)}'")
    if status:
        filters.append(f"iw_status eq '{_sanitize_odata_value(status)}'")
    if active_only:
        filters.append("iw_isactive eq true")

    url = _api_url(entity_set)
    params: dict[str, str] = {"$orderby": "iw_name asc", "$top": "200"}
    if filters:
        params["$filter"] = " and ".join(filters)

    resp = requests.get(url, headers=_headers(), params=params, timeout=15)
    if resp.status_code == 200:
        entities = resp.json().get("value", [])
        return [_map_from_dv(e, "crewmembers") for e in entities]
    else:
        print(f"Dataverse get crew members failed ({resp.status_code}): {resp.text[:200]}")
        return []


def get_crew_member(crew_member_id: str) -> Optional[dict]:
    """Get a single crew member by Dataverse row ID."""
    return get_entity("crewmembers", crew_member_id)


def update_crew_member(crew_member_id: str, data: dict) -> Optional[dict]:
    """Update a crew member record by ID."""
    entity_set = ENTITY_SETS["crewmembers"]
    dv_data = _map_to_dv(data, "crewmembers")
    if "name" in data:
        dv_data["iw_name"] = data["name"]

    url = f"{_api_url(entity_set)}({crew_member_id})"
    resp = requests.patch(url, headers=_headers(), json=dv_data, timeout=15)
    if resp.status_code in (200, 204):
        return {"id": crew_member_id, **data, "updated": True}
    elif resp.status_code == 404:
        return None
    else:
        raise RuntimeError(f"Dataverse update crew member failed ({resp.status_code}): {resp.text[:300]}")


def delete_crew_member(crew_member_id: str) -> bool:
    """Delete a crew member (or soft-delete by setting isActive=false)."""
    return delete_entity("crewmembers", crew_member_id)


def seed_crew_members(crews: list[dict]) -> list[dict]:
    """Bulk-create crew member records from a list of crew dicts."""
    created = []
    for c in crews:
        try:
            result = create_crew_member(c)
            created.append(result)
        except Exception as e:
            print(f"  Failed to seed crew '{c.get('name', '?')}': {e}")
    return created


# ============================================
# Statistics
# ============================================

def get_dispatch_stats() -> dict:
    """Aggregate dispatch statistics."""
    all_dispatches = get_dispatches()
    if not all_dispatches:
        return {
            "total": 0,
            "byStatus": {},
            "totalEstimatedCost": 0,
            "totalActualCost": 0,
            "avgAiConfidence": 0,
            "completionRate": 0,
        }
    
    by_status: dict[str, int] = {}
    est_cost = 0.0
    act_cost = 0.0
    conf_sum = 0.0
    conf_count = 0
    completed = 0
    
    for d in all_dispatches:
        st = d.get("status", "unknown")
        by_status[st] = by_status.get(st, 0) + 1
        ec = d.get("estimatedCost")
        if ec:
            est_cost += float(ec)
        ac = d.get("actualCost")
        if ac:
            act_cost += float(ac)
        c = d.get("aiConfidence")
        if c:
            conf_sum += float(c)
            conf_count += 1
        if st == "completed":
            completed += 1
    
    return {
        "total": len(all_dispatches),
        "byStatus": by_status,
        "totalEstimatedCost": est_cost,
        "totalActualCost": act_cost,
        "avgAiConfidence": conf_sum / conf_count if conf_count else 0,
        "completionRate": completed / len(all_dispatches) if all_dispatches else 0,
    }


# ============================================
# Delete / Generic
# ============================================

def delete_entity(table_key: str, entity_id: str) -> bool:
    """Delete an entity by ID."""
    entity_set = ENTITY_SETS.get(table_key)
    if not entity_set:
        return False
    url = f"{_api_url(entity_set)}({entity_id})"
    resp = requests.delete(url, headers=_headers(), timeout=15)
    return resp.status_code == 204


def get_entity(table_key: str, entity_id: str) -> Optional[dict]:
    """Get a single entity by ID."""
    entity_set = ENTITY_SETS.get(table_key)
    if not entity_set:
        return None
    url = f"{_api_url(entity_set)}({entity_id})"
    resp = requests.get(url, headers=_headers(), timeout=15)
    if resp.status_code == 200:
        return _map_from_dv(resp.json(), table_key)
    return None


def update_entity(table_key: str, entity_id: str, data: dict) -> Optional[dict]:
    """Generic update for any entity."""
    entity_set = ENTITY_SETS.get(table_key)
    if not entity_set:
        return None
    dv_data = _map_to_dv(data, table_key)
    url = f"{_api_url(entity_set)}({entity_id})"
    resp = requests.patch(url, headers=_headers(), json=dv_data, timeout=15)
    if resp.status_code in (200, 204):
        return {"id": entity_id, **data}
    return None
