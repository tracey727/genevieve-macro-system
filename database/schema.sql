-- GENEVIEVE Business Pattern, Waste & Prevention Command™
-- PostgreSQL / Neon schema
-- Run this once in a fresh database before deploying the app.

BEGIN;

CREATE TABLE IF NOT EXISTS sys_entities (
  entity_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state_jurisdiction TEXT NOT NULL DEFAULT 'QLD',
  legacy_ancestry_ids TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operational_matters (
  matter_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES sys_entities(entity_id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ELEVATED','CLOSED','REOPENED_FOR_HUMAN_REVIEW')),
  accountable_owner_id TEXT NOT NULL,
  escalation_deadline TIMESTAMPTZ NOT NULL,
  funding_stream TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operational_matters_entity_idx ON operational_matters(entity_id);
CREATE INDEX IF NOT EXISTS operational_matters_status_idx ON operational_matters(status);
CREATE INDEX IF NOT EXISTS operational_matters_deadline_idx ON operational_matters(escalation_deadline);

CREATE TABLE IF NOT EXISTS cost_ledger (
  entry_id BIGSERIAL PRIMARY KEY,
  matter_id TEXT NOT NULL REFERENCES operational_matters(matter_id) ON DELETE RESTRICT,
  expense_type TEXT NOT NULL,
  supplier_contractor_name TEXT,
  hourly_rate NUMERIC(12,2),
  hours_logged NUMERIC(12,2),
  direct_cost NUMERIC(14,2) NOT NULL CHECK (direct_cost >= 0),
  is_clawback_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cost_ledger_matter_idx ON cost_ledger(matter_id);
CREATE INDEX IF NOT EXISTS cost_ledger_type_idx ON cost_ledger(expense_type);

CREATE TABLE IF NOT EXISTS evidence_workspace (
  evidence_id TEXT PRIMARY KEY,
  matter_id TEXT NOT NULL REFERENCES operational_matters(matter_id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL,
  file_checksum TEXT NOT NULL CHECK (char_length(file_checksum) >= 32),
  source_author TEXT NOT NULL,
  is_compliance_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (is_compliance_verified = FALSE AND verified_at IS NULL)
    OR
    (is_compliance_verified = TRUE AND verified_at IS NOT NULL AND verified_by IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS evidence_workspace_matter_idx ON evidence_workspace(matter_id);

CREATE TABLE IF NOT EXISTS audit_timeline (
  audit_id BIGSERIAL PRIMARY KEY,
  matter_id TEXT,
  operator_id TEXT NOT NULL,
  action_performed TEXT NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_timeline_matter_idx ON audit_timeline(matter_id);
CREATE INDEX IF NOT EXISTS audit_timeline_time_idx ON audit_timeline(occurred_at DESC);

CREATE TABLE IF NOT EXISTS shared_asset_registry (
  asset_code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  owning_entity TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO shared_asset_registry(asset_code, display_name, owning_entity, notes)
VALUES
  ('sms_gateway_v2_enterprise','SMS Gateway V2 Enterprise','Shared Registry','Seed item from original GENEVIEVE engine'),
  ('standard_patient_intake_module','Standard Patient Intake Module','Shared Registry','Seed item from original GENEVIEVE engine'),
  ('proda_integration_bridge','PRODA Integration Bridge','Shared Registry','Registry marker only; this app does not connect to PRODA')
ON CONFLICT (asset_code) DO NOTHING;

INSERT INTO sys_entities(entity_id, name, state_jurisdiction)
VALUES ('GENEVIEVE-DEMO', 'GENEVIEVE Demonstration Entity', 'QLD')
ON CONFLICT (entity_id) DO NOTHING;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS operational_matters_set_updated_at ON operational_matters;
CREATE TRIGGER operational_matters_set_updated_at
BEFORE UPDATE ON operational_matters
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_timeline is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_timeline_no_update ON audit_timeline;
CREATE TRIGGER audit_timeline_no_update
BEFORE UPDATE OR DELETE ON audit_timeline
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE OR REPLACE FUNCTION close_matter_with_gate(p_matter_id TEXT, p_operator_id TEXT)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
  v_total INTEGER;
  v_verified INTEGER;
BEGIN
  SELECT status INTO v_status
  FROM operational_matters
  WHERE matter_id = p_matter_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Unknown matter identifier.';
    RETURN;
  END IF;

  IF v_status = 'CLOSED' THEN
    RETURN QUERY SELECT TRUE, 'Matter is already closed.';
    RETURN;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_compliance_verified)
  INTO v_total, v_verified
  FROM evidence_workspace
  WHERE matter_id = p_matter_id;

  IF v_total = 0 OR v_verified < v_total THEN
    RETURN QUERY SELECT FALSE, 'Closure blocked: every attached evidence record must be human-verified and at least one evidence record is required.';
    RETURN;
  END IF;

  UPDATE operational_matters SET status = 'CLOSED' WHERE matter_id = p_matter_id;

  INSERT INTO audit_timeline(matter_id, operator_id, action_performed, previous_state, new_state)
  VALUES (
    p_matter_id,
    p_operator_id,
    'MATTER_CLOSE_GATE_SUCCESS',
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'CLOSED')
  );

  RETURN QUERY SELECT TRUE, 'Matter closed through the human evidence verification gate.';
END;
$$;

CREATE OR REPLACE FUNCTION reopen_matter_for_human_review(p_matter_id TEXT, p_operator_id TEXT, p_reason TEXT)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM operational_matters
  WHERE matter_id = p_matter_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Unknown matter identifier.';
    RETURN;
  END IF;

  IF v_status <> 'CLOSED' THEN
    RETURN QUERY SELECT FALSE, 'Recurrence trigger only reopens a matter that is currently CLOSED.';
    RETURN;
  END IF;

  UPDATE operational_matters
  SET status = 'REOPENED_FOR_HUMAN_REVIEW'
  WHERE matter_id = p_matter_id;

  INSERT INTO audit_timeline(matter_id, operator_id, action_performed, previous_state, new_state, event_metadata)
  VALUES (
    p_matter_id,
    p_operator_id,
    'RECURRENCE_REOPEN_FOR_HUMAN_REVIEW',
    jsonb_build_object('status', 'CLOSED'),
    jsonb_build_object('status', 'REOPENED_FOR_HUMAN_REVIEW'),
    jsonb_build_object('reason', COALESCE(p_reason, 'Recurrence/anomaly signal'))
  );

  RETURN QUERY SELECT TRUE, 'Matter reopened and returned to the human review queue.';
END;
$$;


CREATE OR REPLACE FUNCTION protect_evidence_verification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_compliance_verified = TRUE THEN
    RAISE EXCEPTION 'Verified evidence records are immutable';
  END IF;

  IF NEW.evidence_id IS DISTINCT FROM OLD.evidence_id
     OR NEW.matter_id IS DISTINCT FROM OLD.matter_id
     OR NEW.document_type IS DISTINCT FROM OLD.document_type
     OR NEW.file_checksum IS DISTINCT FROM OLD.file_checksum
     OR NEW.source_author IS DISTINCT FROM OLD.source_author
     OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at THEN
    RAISE EXCEPTION 'Evidence content metadata is immutable; only verification fields may change';
  END IF;

  IF NEW.is_compliance_verified = FALSE THEN
    RAISE EXCEPTION 'Evidence verification update must set is_compliance_verified to TRUE';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evidence_verification_guard ON evidence_workspace;
CREATE TRIGGER evidence_verification_guard
BEFORE UPDATE ON evidence_workspace
FOR EACH ROW EXECUTE FUNCTION protect_evidence_verification();

CREATE OR REPLACE FUNCTION enforce_matter_closure_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_total INTEGER;
  v_verified INTEGER;
BEGIN
  IF NEW.status = 'CLOSED' AND OLD.status IS DISTINCT FROM 'CLOSED' THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE is_compliance_verified)
    INTO v_total, v_verified
    FROM evidence_workspace
    WHERE matter_id = NEW.matter_id;

    IF v_total = 0 OR v_total <> v_verified THEN
      RAISE EXCEPTION 'Closure blocked: all evidence must be verified and at least one evidence record is required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS operational_matters_closure_guard ON operational_matters;
CREATE TRIGGER operational_matters_closure_guard
BEFORE UPDATE OF status ON operational_matters
FOR EACH ROW EXECUTE FUNCTION enforce_matter_closure_evidence();

COMMIT;
