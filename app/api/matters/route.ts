import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/auth';
import { defaultOperator, getSql } from '@/lib/db';
import { badRequest, serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied) return denied;

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT m.*,
             COALESCE((SELECT SUM(c.direct_cost) FROM cost_ledger c WHERE c.matter_id = m.matter_id), 0)::numeric AS total_cost,
             (SELECT COUNT(*)::int FROM evidence_workspace e WHERE e.matter_id = m.matter_id) AS evidence_count,
             (SELECT COUNT(*)::int FROM evidence_workspace e WHERE e.matter_id = m.matter_id AND e.is_compliance_verified) AS verified_evidence_count
      FROM operational_matters m
      ORDER BY m.updated_at DESC
    `;
    return NextResponse.json({ matters: rows });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const title = String(body.title || '').trim();
    const category = String(body.category || '').trim();
    const owner = String(body.owner || '').trim();
    const entityId = String(body.entity_id || 'GENEVIEVE-DEMO').trim();
    const fundingStream = String(body.funding_stream || '').trim();
    const description = String(body.description || '').trim();
    const operator = String(body.operator || owner || defaultOperator()).trim();

    if (!title || !category || !owner) {
      return badRequest('Title, category and accountable owner are required.');
    }

    const deadline = body.escalation_deadline
      ? new Date(body.escalation_deadline)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(deadline.getTime())) return badRequest('Invalid escalation deadline.');

    const matterId = String(body.matter_id || `MAT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
    const sql = getSql();

    const entities = await sql`SELECT entity_id FROM sys_entities WHERE entity_id = ${entityId}`;
    if (entities.length === 0) return badRequest(`Unknown entity_id: ${entityId}`);

    const [matter] = await sql`
      INSERT INTO operational_matters(
        matter_id, entity_id, title, description, category, accountable_owner_id,
        escalation_deadline, funding_stream
      ) VALUES (
        ${matterId}, ${entityId}, ${title}, ${description || null}, ${category}, ${owner},
        ${deadline.toISOString()}, ${fundingStream || null}
      )
      RETURNING *
    `;

    await sql`
      INSERT INTO audit_timeline(matter_id, operator_id, action_performed, previous_state, new_state)
      VALUES (
        ${matterId}, ${operator}, 'MATTER_CREATED', NULL,
        ${JSON.stringify({ status: 'OPEN', title, category })}::jsonb
      )
    `;

    return NextResponse.json({ matter }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
