-- OPTIONAL DEMO DATA ONLY. Do not run this in a live database if you do not want sample records.

INSERT INTO operational_matters(
  matter_id, entity_id, title, description, category, accountable_owner_id,
  escalation_deadline, funding_stream
)
VALUES (
  'MAT-MBS-042',
  'GENEVIEVE-DEMO',
  'Medicare MHCP Billing Alignment Friction',
  'Demonstration operational matter based on the original engine dry-run. No real patient information.',
  'Clinical Admin Leakage',
  'Practice_Manager_Admin',
  NOW() + INTERVAL '7 days',
  'Medicare_MBS'
)
ON CONFLICT (matter_id) DO NOTHING;

INSERT INTO cost_ledger(matter_id, expense_type, supplier_contractor_name, hours_logged, direct_cost)
SELECT 'MAT-MBS-042', 'Contractor_Premium', 'External Billing Advisory Corp', 15, 4500.00
WHERE NOT EXISTS (
  SELECT 1 FROM cost_ledger WHERE matter_id='MAT-MBS-042' AND expense_type='Contractor_Premium'
);

INSERT INTO cost_ledger(matter_id, expense_type, supplier_contractor_name, direct_cost)
SELECT 'MAT-MBS-042', 'Rework_Admin', 'Internal Admin Overtime', 1200.00
WHERE NOT EXISTS (
  SELECT 1 FROM cost_ledger WHERE matter_id='MAT-MBS-042' AND expense_type='Rework_Admin'
);
