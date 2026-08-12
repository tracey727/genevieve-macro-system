import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/auth';
import { getSql } from '@/lib/db';
import { serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied) return denied;

  try {
    const sql = getSql();
    const [summary] = await sql`
      SELECT
        COUNT(*)::int AS total_matters,
        COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_matters,
        COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS closed_matters,
        COUNT(*) FILTER (WHERE status = 'REOPENED_FOR_HUMAN_REVIEW')::int AS reopened_matters,
        COUNT(*) FILTER (WHERE escalation_deadline < NOW() AND status <> 'CLOSED')::int AS overdue_matters
      FROM operational_matters
    `;

    const [costs] = await sql`
      SELECT COALESCE(SUM(direct_cost), 0)::numeric AS total_cost,
             COUNT(*)::int AS cost_entries
      FROM cost_ledger
    `;

    const [evidence] = await sql`
      SELECT COUNT(*)::int AS total_evidence,
             COUNT(*) FILTER (WHERE is_compliance_verified)::int AS verified_evidence
      FROM evidence_workspace
    `;

    const recent = await sql`
      SELECT m.matter_id, m.title, m.category, m.status, m.accountable_owner_id,
             m.escalation_deadline, m.updated_at,
             COALESCE(SUM(c.direct_cost), 0)::numeric AS total_cost
      FROM operational_matters m
      LEFT JOIN cost_ledger c ON c.matter_id = m.matter_id
      GROUP BY m.matter_id
      ORDER BY m.updated_at DESC
      LIMIT 8
    `;

    return NextResponse.json({ summary, costs, evidence, recent });
  } catch (error) {
    return serverError(error);
  }
}
