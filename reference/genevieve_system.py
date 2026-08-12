"""Reference copy of the supplied GENEVIEVE engine, cleaned into valid Python syntax.

The deployable web application uses PostgreSQL + Next.js server routes instead of this
in-memory class. This file is retained so the original engine mapping remains visible.
"""

import json
import logging
from datetime import datetime
from typing import Dict, List, Tuple

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

SCHEMA_DDL = r"""
CREATE TABLE sys_entities (
    entity_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    state_jurisdiction VARCHAR(10) DEFAULT 'QLD',
    legacy_ancestry_ids TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE operational_matters (
    matter_id VARCHAR(50) PRIMARY KEY,
    entity_id VARCHAR(50) REFERENCES sys_entities(entity_id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    status VARCHAR(50) DEFAULT 'OPEN',
    accountable_owner_id VARCHAR(50) NOT NULL,
    escalation_deadline TIMESTAMP NOT NULL,
    funding_stream VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cost_ledger (
    entry_id SERIAL PRIMARY KEY,
    matter_id VARCHAR(50) REFERENCES operational_matters(matter_id),
    expense_type VARCHAR(100) NOT NULL,
    supplier_contractor_name VARCHAR(255),
    hourly_rate NUMERIC(10, 2),
    hours_logged NUMERIC(10, 2),
    direct_cost NUMERIC(12, 2) NOT NULL,
    is_clawback_eligible BOOLEAN DEFAULT FALSE,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE evidence_workspace (
    evidence_id VARCHAR(50) PRIMARY KEY,
    matter_id VARCHAR(50) REFERENCES operational_matters(matter_id),
    document_type VARCHAR(100),
    file_checksum VARCHAR(64) NOT NULL,
    source_author VARCHAR(255) NOT NULL,
    is_compliance_verified BOOLEAN DEFAULT FALSE,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_timeline (
    audit_id SERIAL PRIMARY KEY,
    matter_id VARCHAR(50) NOT NULL,
    operator_id VARCHAR(50) NOT NULL,
    action_performed VARCHAR(100) NOT NULL,
    previous_state TEXT,
    new_state TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


class GenevieveEngine:
    def __init__(self):
        self.matters: Dict[str, dict] = {}
        self.costs: List[dict] = []
        self.evidence: Dict[str, List[dict]] = {}
        self.audit_log: List[dict] = []
        self.shared_interagency_index: List[str] = [
            "sms_gateway_v2_enterprise",
            "standard_patient_intake_module",
            "proda_integration_bridge",
        ]

    def _write_audit(self, matter_id: str, operator: str, action: str, prev: str, new: str):
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "matter_id": matter_id,
            "operator": operator,
            "action": action,
            "prev": prev,
            "new": new,
        }
        self.audit_log.append(log_entry)
        logging.info("[AUDIT] Matter %s modified by %s: %s", matter_id, operator, action)

    def create_matter(self, matter_id: str, entity_id: str, title: str, owner: str, stream: str, category: str) -> dict:
        matter = {
            "matter_id": matter_id,
            "entity_id": entity_id,
            "title": title,
            "category": category,
            "status": "OPEN",
            "owner": owner,
            "funding_stream": stream,
            "escalation_deadline": datetime.now().isoformat(),
        }
        self.matters[matter_id] = matter
        self._write_audit(matter_id, owner, "MATTER_CREATION", "NONE", json.dumps(matter))
        return matter

    def log_cost(self, matter_id: str, exp_type: str, cost: float, supplier: str | None = None, hours: float = 0.0):
        self.costs.append({
            "matter_id": matter_id,
            "expense_type": exp_type,
            "supplier": supplier,
            "hours": hours,
            "cost": cost,
            "timestamp": datetime.now().isoformat(),
        })

    def cross_check_duplication(self, system_name: str) -> Tuple[bool, str]:
        if system_name.lower() in [s.lower() for s in self.shared_interagency_index]:
            return True, "DUPLICATION DETECTED: Asset already matches pre-existing shared framework code."
        return False, "Clear. No exact asset profile match."

    def add_verified_evidence(self, evidence_id: str, matter_id: str, doc_type: str, checksum: str, author: str, verified: bool):
        doc = {
            "evidence_id": evidence_id,
            "doc_type": doc_type,
            "checksum": checksum,
            "author": author,
            "is_compliance_verified": verified,
            "timestamp": datetime.now().isoformat(),
        }
        self.evidence.setdefault(matter_id, []).append(doc)

    def calculate_cost_of_inaction(self, matter_id: str, daily_recurrence_rate: float, delay_days: int) -> dict:
        historical_sum = sum(c["cost"] for c in self.costs if c["matter_id"] == matter_id)
        projected_penalty = daily_recurrence_rate * delay_days
        return {
            "historical_sunk_waste": historical_sum,
            "projected_inaction_penalty_cost": projected_penalty,
            "total_risk_exposure": historical_sum + projected_penalty,
        }

    def evaluate_closure_gate(self, matter_id: str, operator: str) -> Tuple[bool, str]:
        if matter_id not in self.matters:
            return False, "Error: Unknown matter footprint identifier."
        docs = self.evidence.get(matter_id, [])
        verified_count = sum(1 for d in docs if d["is_compliance_verified"])
        if not docs or verified_count < len(docs):
            return False, "CRITICAL PROTECTION FAILURE: Missing required verified regulatory documentation."
        prev_status = self.matters[matter_id]["status"]
        self.matters[matter_id]["status"] = "CLOSED"
        self._write_audit(matter_id, operator, "MATTER_CLOSE_ATTEMPT_SUCCESS", prev_status, "CLOSED")
        return True, "Matter successfully closed via human evidence verification gate rules."

    def trigger_recurrence_monitor(self, matter_id: str) -> dict:
        if matter_id in self.matters and self.matters[matter_id]["status"] == "CLOSED":
            self.matters[matter_id]["status"] = "REOPENED_FOR_HUMAN_REVIEW"
            self._write_audit(
                matter_id,
                "SYSTEM_AUTOMATION",
                "AUTOMATIC_REOPEN_TRIGGER",
                "CLOSED",
                "REOPENED_FOR_HUMAN_REVIEW",
            )
            return {"status": "TRIGGERED", "msg": "Anomalous event pattern detected post-closure. Returned to human review queue."}
        return {"status": "NO_ACTION", "msg": "Matter baseline remains intact or file state is already open."}

    def generate_ai_advisory(self, category: str) -> str:
        matching_costs = [c for c in self.costs if c.get("expense_type") == category]
        total_leakage = sum(c["cost"] for c in matching_costs)
        count = len(matching_costs)
        return (
            f"[GENEVIEVE AI ADVISORY STATEMENT] These {count} operational workflow incidents "
            f"cost approximately ${total_leakage:,.2f}. CRITICAL WARNING: This output is strictly "
            "ADVISORY and requires formal human verification."
        )


if __name__ == "__main__":
    print("Executing GENEVIEVE Engine dry-run verification sequence...")
    system = GenevieveEngine()
    system.create_matter(
        "MAT-MBS-042",
        "MOOD_MIND_HOPE_ISLAND",
        "Medicare MHCP Billing Alignment Friction",
        "Practice_Manager_Admin",
        "Medicare_MBS",
        "Clinical Admin Leakage",
    )
    system.log_cost("MAT-MBS-042", "Contractor_Premium", 4500.00, "External Billing Advisory Corp", 15)
    system.log_cost("MAT-MBS-042", "Rework_Admin", 1200.00, "Internal Admin Overtime")
    print(system.cross_check_duplication("sms_gateway_v2_enterprise"))
    print(system.calculate_cost_of_inaction("MAT-MBS-042", 350.00, 30))
    print(system.evaluate_closure_gate("MAT-MBS-042", "Clinic_Director_Human"))
