"""
MAINTAIN AI — Dataverse CRUD Service Tests

Tests the dataverseCrudService module by mocking Dataverse HTTP calls.
Verifies field mapping, OData filter sanitization, and all CRUD operations
for every entity type (dispatches, inspections, decisions, schedules,
work-order updates, and crew members).
"""

import sys
import json
import uuid
from pathlib import Path
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import dataverseCrudService as dv


# ============================================
# Fixtures
# ============================================

@pytest.fixture(autouse=True)
def mock_token():
    """Bypass real token acquisition for all tests."""
    with patch.object(dv, "_get_access_token", return_value="mock-token-12345"):
        yield


@pytest.fixture
def mock_post_success():
    """Mock a successful POST (201) returning a Dataverse entity."""
    def _factory(entity_body: dict):
        resp = MagicMock()
        resp.status_code = 201
        resp.content = b'{"ok": true}'
        resp.json.return_value = entity_body
        return resp
    return _factory


@pytest.fixture
def mock_get_success():
    """Mock a successful GET returning a list of entities."""
    def _factory(entities: list):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"value": entities}
        return resp
    return _factory


# ============================================
# OData Sanitization
# ============================================

class TestODataSanitization:
    """Verify OData filter injection prevention."""

    def test_clean_value_passes(self):
        assert dv._sanitize_odata_value("pending") == "pending"

    def test_single_quote_rejected(self):
        with pytest.raises(ValueError, match="prohibited characters"):
            dv._sanitize_odata_value("it's bad")

    def test_parentheses_rejected(self):
        with pytest.raises(ValueError, match="prohibited characters"):
            dv._sanitize_odata_value("value()")

    def test_semicolon_rejected(self):
        with pytest.raises(ValueError, match="prohibited characters"):
            dv._sanitize_odata_value("drop;table")

    def test_backslash_rejected(self):
        with pytest.raises(ValueError, match="prohibited characters"):
            dv._sanitize_odata_value("path\\inject")

    def test_odata_operator_rejected(self):
        with pytest.raises(ValueError, match="OData operator"):
            dv._sanitize_odata_value("value eq injected")


# ============================================
# Field Mapping
# ============================================

class TestFieldMapping:
    """Verify frontend → Dataverse column mapping and back."""

    def test_dispatch_map_to_dv(self):
        data = {"workOrderId": "WO-100", "status": "pending", "priority": "high"}
        result = dv._map_to_dv(data, "dispatches")
        assert result["iw_workorderid"] == "WO-100"
        assert result["iw_status"] == "pending"
        assert result["iw_priority"] == "high"

    def test_dispatch_map_from_dv(self):
        entity = {
            "iw_crewdispatchid": "abc-123",
            "iw_workorderid": "WO-100",
            "iw_status": "completed",
            "iw_priority": "high",
            "iw_crewname": "Alpha",
            "createdon": "2025-01-01T00:00:00Z",
            "modifiedon": "2025-01-02T00:00:00Z",
        }
        result = dv._map_from_dv(entity, "dispatches")
        assert result["id"] == "abc-123"
        assert result["workOrderId"] == "WO-100"
        assert result["status"] == "completed"
        assert result["crewName"] == "Alpha"
        assert result["createdAt"] == "2025-01-01T00:00:00Z"
        assert result["updatedAt"] == "2025-01-02T00:00:00Z"

    def test_list_field_serialized_as_json(self):
        data = {"certifications": ["plumbing", "electrical"]}
        result = dv._map_to_dv(data, "crewmembers")
        assert result["iw_certifications"] == '["plumbing", "electrical"]'

    def test_list_field_deserialized_from_json(self):
        entity = {"iw_certifications": '["plumbing", "electrical"]'}
        result = dv._map_from_dv(entity, "crewmembers")
        assert result["certifications"] == ["plumbing", "electrical"]

    def test_boolean_preserved(self):
        data = {"nearSchool": True}
        result = dv._map_to_dv(data, "dispatches")
        assert result["iw_nearschool"] is True

    def test_numeric_preserved(self):
        data = {"estimatedCost": 1250.50}
        result = dv._map_to_dv(data, "dispatches")
        assert result["iw_estimatedcost"] == 1250.50

    def test_none_value_mapped(self):
        data = {"notes": None}
        result = dv._map_to_dv(data, "dispatches")
        # None gets mapped only if column exists
        # 'notes' is not in DISPATCH_COLUMNS, so should NOT appear
        assert "iw_notes" not in result

    def test_unknown_key_skipped(self):
        data = {"unknownField": "value"}
        result = dv._map_to_dv(data, "dispatches")
        assert len(result) == 0


# ============================================
# Primary Key Lookup
# ============================================

class TestPrimaryKey:
    def test_dispatch_pk(self):
        assert dv._get_pk_column("dispatches") == "iw_crewdispatchid"

    def test_inspection_pk(self):
        assert dv._get_pk_column("inspections") == "iw_fieldinspectionid"

    def test_decision_pk(self):
        assert dv._get_pk_column("decisions") == "iw_aidecisionlogid"

    def test_schedule_pk(self):
        assert dv._get_pk_column("schedules") == "iw_crewscheduleid"

    def test_update_pk(self):
        assert dv._get_pk_column("updates") == "iw_workorderupdateid"

    def test_crewmember_pk(self):
        assert dv._get_pk_column("crewmembers") == "iw_crewmemberid"

    def test_unknown_returns_empty(self):
        assert dv._get_pk_column("nonexistent") == ""


# ============================================
# Entity Set Names
# ============================================

class TestEntitySets:
    def test_all_entity_sets_defined(self):
        expected = {"dispatches", "inspections", "decisions", "schedules", "updates", "crewmembers"}
        assert set(dv.ENTITY_SETS.keys()) == expected

    def test_entity_set_names_have_prefix(self):
        for key, name in dv.ENTITY_SETS.items():
            assert name.startswith("iw_"), f"Entity set '{key}' = '{name}' missing iw_ prefix"


# ============================================
# Dispatch CRUD
# ============================================

class TestDispatchCRUD:

    @patch("dataverseCrudService.requests.post")
    def test_create_dispatch(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=201,
            content=b'{}',
            json=MagicMock(return_value={
                "iw_crewdispatchid": "new-id-123",
                "iw_workorderid": "WO-100",
                "iw_status": "pending",
                "iw_crewname": "Alpha",
                "createdon": "2025-03-01T00:00:00Z",
            }),
        )
        result = dv.create_dispatch({
            "workOrderId": "WO-100",
            "status": "pending",
            "crewName": "Alpha",
            "address": "123 Main St",
        })
        assert result["id"] == "new-id-123"
        assert result["workOrderId"] == "WO-100"
        assert result["crewName"] == "Alpha"
        mock_post.assert_called_once()

    @patch("dataverseCrudService.requests.post")
    def test_create_dispatch_failure(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=400,
            text="Bad request: missing required field",
        )
        with pytest.raises(RuntimeError, match="Dataverse create dispatch failed"):
            dv.create_dispatch({"status": "pending"})

    @patch("dataverseCrudService.requests.get")
    def test_get_dispatches_no_filter(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"value": [
                {"iw_crewdispatchid": "d1", "iw_status": "pending"},
                {"iw_crewdispatchid": "d2", "iw_status": "completed"},
            ]}),
        )
        result = dv.get_dispatches()
        assert len(result) == 2
        assert result[0]["id"] == "d1"

    @patch("dataverseCrudService.requests.get")
    def test_get_dispatches_with_filter(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"value": []}),
        )
        dv.get_dispatches(status="pending", priority="high")
        call_args = mock_get.call_args
        params = call_args.kwargs.get("params", call_args[1].get("params", {}))
        assert "$filter" in params
        assert "iw_status eq 'pending'" in params["$filter"]
        assert "iw_priority eq 'high'" in params["$filter"]

    @patch("dataverseCrudService.requests.patch")
    def test_update_dispatch(self, mock_patch):
        mock_patch.return_value = MagicMock(status_code=204)
        result = dv.update_dispatch("abc-123", {"status": "in-progress"})
        assert result is not None
        assert result["id"] == "abc-123"
        assert result["updated"] is True

    @patch("dataverseCrudService.requests.patch")
    def test_update_dispatch_not_found(self, mock_patch):
        mock_patch.return_value = MagicMock(status_code=404)
        result = dv.update_dispatch("nonexistent", {"status": "in-progress"})
        assert result is None

    @patch("dataverseCrudService.requests.patch")
    def test_complete_dispatch(self, mock_patch):
        mock_patch.return_value = MagicMock(status_code=204)
        result = dv.complete_dispatch("abc-123", actual_duration=2.5, actual_cost=450.0)
        assert result is not None
        assert result["status"] == "completed"
        assert result["actualDuration"] == 2.5
        assert result["actualCost"] == 450.0


# ============================================
# Inspection CRUD
# ============================================

class TestInspectionCRUD:

    @patch("dataverseCrudService.requests.post")
    def test_create_inspection(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=201,
            content=b'{}',
            json=MagicMock(return_value={
                "iw_fieldinspectionid": "insp-1",
                "iw_inspectorname": "John Doe",
                "iw_inspectiontype": "routine",
                "createdon": "2025-03-01T00:00:00Z",
            }),
        )
        result = dv.create_inspection({
            "inspectorName": "John Doe",
            "inspectionType": "routine",
            "dispatchId": "d-100",
        })
        assert result["id"] == "insp-1"
        assert result["inspectorName"] == "John Doe"

    @patch("dataverseCrudService.requests.get")
    def test_get_inspections_by_dispatch(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"value": [
                {"iw_fieldinspectionid": "i1", "iw_dispatchid": "d-100"},
            ]}),
        )
        result = dv.get_inspections(dispatch_id="d-100")
        assert len(result) == 1
        call_args = mock_get.call_args
        params = call_args.kwargs.get("params", call_args[1].get("params", {}))
        assert "iw_dispatchid eq 'd-100'" in params.get("$filter", "")


# ============================================
# AI Decision Log CRUD
# ============================================

class TestDecisionCRUD:

    @patch("dataverseCrudService.requests.post")
    def test_log_decision(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=201,
            content=b'{}',
            json=MagicMock(return_value={
                "iw_aidecisionlogid": "dec-1",
                "iw_agentname": "analysisAgent",
                "iw_decisiontype": "priority",
                "iw_confidencescore": 0.92,
            }),
        )
        result = dv.log_decision({
            "agentName": "analysisAgent",
            "decisionType": "priority",
            "confidenceScore": 0.92,
            "modelName": "gpt-4.1",
        })
        assert result["id"] == "dec-1"
        assert result["agentName"] == "analysisAgent"

    @patch("dataverseCrudService.requests.get")
    def test_get_decisions_with_filter(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"value": []}),
        )
        dv.get_decisions(agent_name="dispatchAgent", limit=50)
        call_args = mock_get.call_args
        params = call_args.kwargs.get("params", call_args[1].get("params", {}))
        assert "iw_agentname eq 'dispatchAgent'" in params.get("$filter", "")
        assert params["$top"] == "50"

    @patch("dataverseCrudService.requests.get")
    def test_get_decision_stats_empty(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"value": []}),
        )
        stats = dv.get_decision_stats()
        assert stats["total"] == 0
        assert stats["overrideRate"] == 0.0


# ============================================
# Schedule CRUD
# ============================================

class TestScheduleCRUD:

    @patch("dataverseCrudService.requests.post")
    def test_create_schedule(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=201,
            content=b'{}',
            json=MagicMock(return_value={
                "iw_crewscheduleid": "sched-1",
                "iw_crewid": "crew-alpha",
                "iw_weekstart": "2025-03-03",
            }),
        )
        result = dv.create_schedule({
            "crewId": "crew-alpha",
            "crewName": "Alpha",
            "weekStart": "2025-03-03",
            "scheduledHours": 40.0,
        })
        assert result["id"] == "sched-1"

    @patch("dataverseCrudService.requests.get")
    def test_get_schedules_by_crew(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"value": []}),
        )
        dv.get_schedules(crew_id="crew-alpha")
        call_args = mock_get.call_args
        params = call_args.kwargs.get("params", call_args[1].get("params", {}))
        assert "iw_crewid eq 'crew-alpha'" in params.get("$filter", "")


# ============================================
# Work Order Update CRUD
# ============================================

class TestWorkOrderUpdateCRUD:

    @patch("dataverseCrudService.requests.post")
    def test_log_work_order_update(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=201,
            content=b'{}',
            json=MagicMock(return_value={
                "iw_workorderupdateid": "upd-1",
                "iw_workorderid": "WO-100",
                "iw_newstatus": "in-progress",
            }),
        )
        result = dv.log_work_order_update({
            "workOrderId": "WO-100",
            "previousStatus": "pending",
            "newStatus": "in-progress",
            "updatedBy": "AI Dispatch Agent",
        })
        assert result["id"] == "upd-1"

    @patch("dataverseCrudService.requests.get")
    def test_get_work_order_updates_by_wo(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"value": [
                {"iw_workorderupdateid": "u1", "iw_workorderid": "WO-100"},
            ]}),
        )
        result = dv.get_work_order_updates(work_order_id="WO-100")
        assert len(result) == 1


# ============================================
# Crew Member CRUD
# ============================================

class TestCrewMemberCRUD:

    @patch("dataverseCrudService.requests.post")
    def test_create_crew_member(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=201,
            content=b'{}',
            json=MagicMock(return_value={
                "iw_crewmemberid": "cm-1",
                "iw_crewid": "crew-alpha",
                "iw_specialization": "plumbing",
                "iw_isactive": True,
                "iw_name": "Crew Alpha",
            }),
        )
        result = dv.create_crew_member({
            "name": "Crew Alpha",
            "crewId": "crew-alpha",
            "specialization": "plumbing",
            "isActive": True,
        })
        assert result["id"] == "cm-1"
        assert result["name"] == "Crew Alpha"

    @patch("dataverseCrudService.requests.get")
    def test_get_crew_members_active_only(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"value": []}),
        )
        dv.get_crew_members(active_only=True)
        call_args = mock_get.call_args
        params = call_args.kwargs.get("params", call_args[1].get("params", {}))
        assert "iw_isactive eq true" in params.get("$filter", "")

    @patch("dataverseCrudService.requests.get")
    def test_get_crew_members_with_specialization(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"value": []}),
        )
        dv.get_crew_members(specialization="electrical", active_only=False)
        call_args = mock_get.call_args
        params = call_args.kwargs.get("params", call_args[1].get("params", {}))
        assert "iw_specialization eq 'electrical'" in params.get("$filter", "")

    @patch("dataverseCrudService.requests.patch")
    def test_update_crew_member(self, mock_patch):
        mock_patch.return_value = MagicMock(status_code=204)
        result = dv.update_crew_member("cm-1", {"status": "on-break"})
        assert result is not None
        assert result["id"] == "cm-1"
        assert result["updated"] is True

    @patch("dataverseCrudService.requests.patch")
    def test_update_crew_member_with_name(self, mock_patch):
        mock_patch.return_value = MagicMock(status_code=204)
        result = dv.update_crew_member("cm-1", {"name": "New Name", "status": "available"})
        # Verify iw_name is set when 'name' is in data
        call_args = mock_patch.call_args
        payload = call_args.kwargs.get("json", call_args[1].get("json", {}))
        assert payload.get("iw_name") == "New Name"

    @patch("dataverseCrudService.requests.delete")
    def test_delete_crew_member(self, mock_delete):
        mock_delete.return_value = MagicMock(status_code=204)
        assert dv.delete_crew_member("cm-1") is True

    @patch("dataverseCrudService.requests.delete")
    def test_delete_crew_member_not_found(self, mock_delete):
        mock_delete.return_value = MagicMock(status_code=404)
        assert dv.delete_crew_member("nonexistent") is False

    @patch("dataverseCrudService.requests.post")
    def test_seed_crew_members(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=201,
            content=b'{}',
            json=MagicMock(return_value={"iw_crewmemberid": "seeded-1", "iw_name": "Test"}),
        )
        result = dv.seed_crew_members([
            {"name": "Crew A", "crewId": "c-a"},
            {"name": "Crew B", "crewId": "c-b"},
        ])
        assert len(result) == 2
        assert mock_post.call_count == 2


# ============================================
# Generic Entity Operations
# ============================================

class TestGenericOperations:

    @patch("dataverseCrudService.requests.get")
    def test_get_entity(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={
                "iw_crewdispatchid": "abc-123",
                "iw_status": "pending",
            }),
        )
        result = dv.get_entity("dispatches", "abc-123")
        assert result is not None
        assert result["id"] == "abc-123"

    @patch("dataverseCrudService.requests.get")
    def test_get_entity_not_found(self, mock_get):
        mock_get.return_value = MagicMock(status_code=404)
        result = dv.get_entity("dispatches", "nonexistent")
        assert result is None

    @patch("dataverseCrudService.requests.get")
    def test_get_entity_invalid_table(self, mock_get):
        result = dv.get_entity("nonexistent_table", "abc-123")
        assert result is None
        mock_get.assert_not_called()

    @patch("dataverseCrudService.requests.delete")
    def test_delete_entity(self, mock_delete):
        mock_delete.return_value = MagicMock(status_code=204)
        assert dv.delete_entity("dispatches", "abc-123") is True

    @patch("dataverseCrudService.requests.delete")
    def test_delete_entity_not_found(self, mock_delete):
        mock_delete.return_value = MagicMock(status_code=404)
        assert dv.delete_entity("dispatches", "nonexistent") is False

    @patch("dataverseCrudService.requests.patch")
    def test_update_entity(self, mock_patch):
        mock_patch.return_value = MagicMock(status_code=204)
        result = dv.update_entity("decisions", "dec-1", {
            "humanOverride": True,
            "overrideReason": "Manual review required",
        })
        assert result is not None
        assert result["id"] == "dec-1"

    @patch("dataverseCrudService.requests.patch")
    def test_update_entity_returns_none_on_failure(self, mock_patch):
        mock_patch.return_value = MagicMock(status_code=404)
        result = dv.update_entity("decisions", "nonexistent", {"humanOverride": True})
        assert result is None


# ============================================
# Statistics
# ============================================

class TestStatistics:

    @patch("dataverseCrudService.requests.get")
    def test_dispatch_stats_empty(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"value": []}),
        )
        stats = dv.get_dispatch_stats()
        assert stats["total"] == 0
        assert stats["completionRate"] == 0

    @patch("dataverseCrudService.requests.get")
    def test_dispatch_stats_with_data(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"value": [
                {"iw_crewdispatchid": "d1", "iw_status": "completed",
                 "iw_estimatedcost": 500, "iw_actualcost": 480,
                 "iw_aiconfidence": 0.9},
                {"iw_crewdispatchid": "d2", "iw_status": "pending",
                 "iw_estimatedcost": 800, "iw_aiconfidence": 0.85},
            ]}),
        )
        stats = dv.get_dispatch_stats()
        assert stats["total"] == 2
        assert stats["byStatus"]["completed"] == 1
        assert stats["byStatus"]["pending"] == 1
        assert stats["completionRate"] == 0.5


# ============================================
# Column Maps Completeness
# ============================================

class TestColumnMaps:
    """Verify every table in ENTITY_SETS has a corresponding COLUMN_MAP."""

    def test_all_tables_have_column_maps(self):
        for key in dv.ENTITY_SETS:
            assert key in dv.COLUMN_MAPS, f"Missing COLUMN_MAP for table '{key}'"

    def test_all_tables_have_pk(self):
        for key in dv.ENTITY_SETS:
            pk = dv._get_pk_column(key)
            assert pk, f"Missing primary key for table '{key}'"
            assert pk.startswith("iw_"), f"PK '{pk}' for '{key}' missing iw_ prefix"

    def test_column_maps_have_values(self):
        for key, col_map in dv.COLUMN_MAPS.items():
            assert len(col_map) > 0, f"COLUMN_MAP for '{key}' is empty"
            for frontend_key, dv_col in col_map.items():
                assert dv_col.startswith("iw_"), f"Column '{dv_col}' for {key}.{frontend_key} missing iw_ prefix"
