"""
InfraWatch AI — Azure Table Storage Service

Production-grade data persistence using Azure Table Storage
(from the procertaistor2026 storage account in procert-ai-rg).

Replaces localStorage demo with real Azure infrastructure.

Tables:
  - CrewDispatches       : crew dispatch records (the main workflow entity)
  - FieldInspections     : field inspection reports (crew-submitted)
  - AIDecisionLogs       : AI agent decision audit trail
  - CrewSchedules        : crew weekly schedule blocks
  - WorkOrderUpdates     : work order status change history
"""

import os
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

from azure.data.tables import TableServiceClient, TableClient, UpdateMode
from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError

# ============================================
# Configuration
# ============================================

STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")

TABLE_NAMES = {
    "dispatches":  "CrewDispatches",
    "inspections": "FieldInspections",
    "decisions":   "AIDecisionLogs",
    "schedules":   "CrewSchedules",
    "updates":     "WorkOrderUpdates",
}

# ============================================
# Table Service Initialization
# ============================================

_table_service: Optional[TableServiceClient] = None
_tables: dict[str, TableClient] = {}


def get_table_service() -> TableServiceClient:
    """Lazily create the TableServiceClient."""
    global _table_service
    if _table_service is None:
        if not STORAGE_CONNECTION_STRING:
            raise RuntimeError("AZURE_STORAGE_CONNECTION_STRING not set")
        _table_service = TableServiceClient.from_connection_string(STORAGE_CONNECTION_STRING)
    return _table_service


def get_table(name: str) -> TableClient:
    """Get (and auto-create) a table client by logical name."""
    if name not in _tables:
        service = get_table_service()
        table_name = TABLE_NAMES.get(name, name)
        try:
            service.create_table(table_name)
        except ResourceExistsError:
            pass
        _tables[name] = service.get_table_client(table_name)
    return _tables[name]


def is_storage_configured() -> bool:
    """Check if Azure Table Storage connection string is set."""
    return bool(STORAGE_CONNECTION_STRING)


# ============================================
# Serialization Helpers
# ============================================

def _serialize_entity(data: dict) -> dict:
    """Flatten nested objects / lists to JSON strings for Table Storage.
    Table Storage only supports primitive types (str, int, float, bool, datetime).
    """
    entity = {}
    for key, value in data.items():
        if key in ("PartitionKey", "RowKey"):
            entity[key] = value
        elif isinstance(value, (dict, list)):
            entity[key] = json.dumps(value, default=str)
        elif isinstance(value, datetime):
            entity[key] = value.isoformat()
        elif value is None:
            entity[key] = ""
        else:
            entity[key] = value
    return entity


def _deserialize_entity(entity: dict) -> dict:
    """Reconstruct objects from JSON strings."""
    result = {}
    skip_keys = {"PartitionKey", "RowKey", "odata.etag", "Timestamp", "odata.metadata"}
    for key, value in entity.items():
        if key in skip_keys:
            continue
        if isinstance(value, str) and len(value) > 1:
            if (value.startswith("{") and value.endswith("}")) or \
               (value.startswith("[") and value.endswith("]")):
                try:
                    result[key] = json.loads(value)
                except json.JSONDecodeError:
                    result[key] = value
            else:
                result[key] = value
        else:
            result[key] = value
    return result


# ============================================
# Generic CRUD
# ============================================

def create_entity(table_key: str, data: dict, partition_key: str = "default") -> dict:
    """Insert a new entity into the specified table."""
    table = get_table(table_key)
    row_key = data.get("id") or str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    entity = _serialize_entity(data)
    entity["PartitionKey"] = partition_key
    entity["RowKey"] = row_key
    entity.setdefault("id", row_key)
    entity.setdefault("createdAt", now)
    entity.setdefault("updatedAt", now)

    table.create_entity(entity)
    return _deserialize_entity(entity) | {"id": row_key, "createdAt": entity["createdAt"]}


def get_entity(table_key: str, row_key: str, partition_key: Optional[str] = None) -> Optional[dict]:
    """Get a single entity by ID. Searches all partitions if partition_key is None."""
    table = get_table(table_key)

    if partition_key:
        try:
            entity = table.get_entity(partition_key=partition_key, row_key=row_key)
            return _deserialize_entity(dict(entity))
        except ResourceNotFoundError:
            return None

    # Search across partitions by RowKey
    entities = table.query_entities(query_filter=f"RowKey eq '{row_key}'")
    for e in entities:
        return _deserialize_entity(dict(e))
    return None


def list_entities(
    table_key: str,
    filter_str: Optional[str] = None,
    partition_key: Optional[str] = None,
    top: Optional[int] = None,
) -> list[dict]:
    """List entities with optional OData filter and partition scoping."""
    table = get_table(table_key)
    filters = []
    if partition_key:
        filters.append(f"PartitionKey eq '{partition_key}'")
    if filter_str:
        filters.append(filter_str)

    query = " and ".join(filters) if filters else None

    if query:
        entities = table.query_entities(query_filter=query)
    else:
        entities = table.list_entities()

    results = [_deserialize_entity(dict(e)) for e in entities]

    # Sort by createdAt descending (newest first)
    results.sort(key=lambda x: x.get("createdAt", ""), reverse=True)

    if top:
        results = results[:top]

    return results


def update_entity(table_key: str, row_key: str, data: dict, partition_key: Optional[str] = None) -> Optional[dict]:
    """Merge-update an entity by ID."""
    table = get_table(table_key)

    # Find the entity first if partition_key not given
    if not partition_key:
        existing_list = list(table.query_entities(query_filter=f"RowKey eq '{row_key}'"))
        if not existing_list:
            return None
        existing = dict(existing_list[0])
        partition_key = existing["PartitionKey"]
    else:
        try:
            existing = dict(table.get_entity(partition_key=partition_key, row_key=row_key))
        except ResourceNotFoundError:
            return None

    updated = dict(existing)
    updated.update(_serialize_entity(data))
    updated["updatedAt"] = datetime.now(timezone.utc).isoformat()
    updated["PartitionKey"] = partition_key
    updated["RowKey"] = row_key

    table.update_entity(updated, mode=UpdateMode.MERGE)
    return _deserialize_entity(updated)


def delete_entity(table_key: str, row_key: str, partition_key: Optional[str] = None) -> bool:
    """Delete an entity by ID."""
    table = get_table(table_key)

    if not partition_key:
        existing_list = list(table.query_entities(query_filter=f"RowKey eq '{row_key}'"))
        if not existing_list:
            return False
        partition_key = dict(existing_list[0])["PartitionKey"]

    try:
        table.delete_entity(partition_key=partition_key, row_key=row_key)
        return True
    except ResourceNotFoundError:
        return False


# ============================================
# Table-Specific Operations
# ============================================

_dispatch_seq = 0
_inspection_seq = 0
_decision_seq = 0


def create_dispatch(data: dict) -> dict:
    """Create a new crew dispatch record."""
    global _dispatch_seq
    _dispatch_seq += 1
    year = datetime.now().year
    data.setdefault("name", f"DISP-{year}-{str(_dispatch_seq).zfill(4)}")
    return create_entity("dispatches", data, partition_key=data.get("status", "pending"))


def get_dispatches(status: Optional[str] = None, crew_id: Optional[str] = None,
                   priority: Optional[str] = None) -> list[dict]:
    """List dispatches with optional filters."""
    filters = []
    if status:
        filters.append(f"status eq '{status}'")
    if crew_id:
        filters.append(f"crewId eq '{crew_id}'")
    if priority:
        filters.append(f"priority eq '{priority}'")
    filter_str = " and ".join(filters) if filters else None
    return list_entities("dispatches", filter_str=filter_str)


def update_dispatch(dispatch_id: str, data: dict) -> Optional[dict]:
    """Update a dispatch record (status changes, completion, etc.)."""
    data["updatedAt"] = datetime.now(timezone.utc).isoformat()
    return update_entity("dispatches", dispatch_id, data)


def complete_dispatch(dispatch_id: str, actual_duration: float, actual_cost: float) -> Optional[dict]:
    """Mark a dispatch as completed with actual data."""
    return update_dispatch(dispatch_id, {
        "status": "completed",
        "actualDuration": actual_duration,
        "actualCost": actual_cost,
        "completedAt": datetime.now(timezone.utc).isoformat(),
    })


def create_inspection(data: dict) -> dict:
    """Create a new field inspection record."""
    global _inspection_seq
    _inspection_seq += 1
    year = datetime.now().year
    data.setdefault("name", f"INSP-{year}-{str(_inspection_seq).zfill(4)}")
    return create_entity("inspections", data, partition_key=data.get("inspectionType", "routine"))


def get_inspections(dispatch_id: Optional[str] = None, work_order_id: Optional[str] = None,
                    inspection_type: Optional[str] = None) -> list[dict]:
    """List inspections with optional filters."""
    filters = []
    if dispatch_id:
        filters.append(f"dispatchId eq '{dispatch_id}'")
    if work_order_id:
        filters.append(f"workOrderId eq '{work_order_id}'")
    if inspection_type:
        filters.append(f"inspectionType eq '{inspection_type}'")
    filter_str = " and ".join(filters) if filters else None
    return list_entities("inspections", filter_str=filter_str)


def log_decision(data: dict) -> dict:
    """Log an AI decision for the audit trail."""
    global _decision_seq
    _decision_seq += 1
    year = datetime.now().year
    data.setdefault("name", f"AID-{year}-{str(_decision_seq).zfill(4)}")
    return create_entity("decisions", data, partition_key=data.get("agentName", "system"))


def get_decisions(agent_name: Optional[str] = None, decision_type: Optional[str] = None,
                  work_order_id: Optional[str] = None, limit: int = 100) -> list[dict]:
    """List AI decisions with optional filters."""
    filters = []
    if agent_name:
        filters.append(f"agentName eq '{agent_name}'")
    if decision_type:
        filters.append(f"decisionType eq '{decision_type}'")
    # workOrderId requires searching in a JSON array — can't directly filter in Table Storage
    filter_str = " and ".join(filters) if filters else None
    results = list_entities("decisions", filter_str=filter_str, top=limit)
    if work_order_id:
        results = [
            r for r in results
            if work_order_id in (r.get("relatedWorkOrderIds") or [])
        ]
    return results


def create_schedule(data: dict) -> dict:
    """Create a crew schedule entry."""
    return create_entity("schedules", data, partition_key=data.get("crewId", "default"))


def get_schedules(crew_id: Optional[str] = None, week_start: Optional[str] = None) -> list[dict]:
    """List schedules with optional filters."""
    filters = []
    if crew_id:
        filters.append(f"crewId eq '{crew_id}'")
    if week_start:
        filters.append(f"weekStart eq '{week_start}'")
    filter_str = " and ".join(filters) if filters else None
    return list_entities("schedules", filter_str=filter_str)


def log_work_order_update(data: dict) -> dict:
    """Log a work order status change."""
    return create_entity("updates", data, partition_key=data.get("workOrderId", "default"))


def get_work_order_updates(work_order_id: Optional[str] = None) -> list[dict]:
    """List work order updates."""
    filter_str = f"workOrderId eq '{work_order_id}'" if work_order_id else None
    return list_entities("updates", filter_str=filter_str)


# ============================================
# Statistics
# ============================================

def get_dispatch_stats() -> dict:
    """Get aggregate dispatch statistics."""
    all_dispatches = list_entities("dispatches")
    total = len(all_dispatches)
    by_status: dict[str, int] = {}
    total_cost = 0.0
    total_hours = 0.0
    completed = 0

    for d in all_dispatches:
        status = d.get("status", "unknown")
        by_status[status] = by_status.get(status, 0) + 1
        if status == "completed":
            completed += 1
            total_cost += float(d.get("actualCost") or d.get("estimatedCost") or 0)
            total_hours += float(d.get("actualDuration") or d.get("estimatedDuration") or 0)

    avg_confidence = 0.0
    if total > 0:
        confidences = [float(d.get("aiConfidence", 0)) for d in all_dispatches if d.get("aiConfidence")]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0

    return {
        "totalDispatches": total,
        "byStatus": by_status,
        "completedCount": completed,
        "totalCost": round(total_cost, 2),
        "totalHours": round(total_hours, 1),
        "avgAIConfidence": round(avg_confidence, 3),
    }


def get_decision_stats() -> dict:
    """Get aggregate AI decision statistics."""
    all_decisions = list_entities("decisions")
    total = len(all_decisions)
    by_agent: dict[str, int] = {}
    by_type: dict[str, int] = {}
    overrides = 0
    total_tokens = 0

    for d in all_decisions:
        agent = d.get("agentName", "unknown")
        dtype = d.get("decisionType", "unknown")
        by_agent[agent] = by_agent.get(agent, 0) + 1
        by_type[dtype] = by_type.get(dtype, 0) + 1
        if d.get("humanOverride"):
            overrides += 1
        total_tokens += int(d.get("tokensUsed", 0) or 0)

    return {
        "totalDecisions": total,
        "byAgent": by_agent,
        "byType": by_type,
        "humanOverrides": overrides,
        "overrideRate": round(overrides / total, 3) if total > 0 else 0,
        "totalTokensUsed": total_tokens,
    }


# ============================================
# Table Initialization
# ============================================

def initialize_tables() -> bool:
    """Create all tables on startup if they don't exist.
    Returns True if connected, False otherwise.
    """
    if not is_storage_configured():
        print("⚠️  AZURE_STORAGE_CONNECTION_STRING not set — Table Storage disabled")
        return False
    try:
        for key in TABLE_NAMES:
            get_table(key)
        print(f"✅ Azure Table Storage connected — {len(TABLE_NAMES)} tables ready")
        return True
    except Exception as e:
        print(f"❌ Azure Table Storage init failed: {e}")
        return False
