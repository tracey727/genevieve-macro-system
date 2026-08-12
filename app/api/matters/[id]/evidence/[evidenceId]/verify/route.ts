import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/auth';
import { defaultOperator, getSql } from '@/lib/db';
import { serverError } from '@/lib/http';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; evidenceId: string }> }
) {
  const denied = requireAccess(request);
  if (denied) return denied;

  try {
    const { id, evidenceId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const operator = String(body.operator || defaultOperator()).trim();
    const sql = getSql();

    const rows = await sql`
      UPDATE evidence_workspace
      SET is_compliance_verified = TRUE,
          verified_by = ${operator},
          verified_at = NOW()
      WHERE evidence_id = ${evidenceId}
        AND matter_id = ${id}
        AND is_compliance_verified = FALSE
      RETURNING evidence_id, matter_id, document_type, is_compliance_verified, verified_by, verified_at
    `;

    if (!rows.length) {
      return NextResponse.json({ error: 'Evidence not found or already verified.' }, { status: 409 });
    }

    await sql`
      INSERT INTO audit_timeline(matter_id, operator_id, action_performed, previous_state, new_state)
      VALUES (
        ${id}, ${operator}, 'EVIDENCE_HUMAN_VERIFIED',
        ${JSON.stringify({ evidence_id: evidenceId, verified: false })}::jsonb,
        ${JSON.stringify({ evidence_id: evidenceId, verified: true })}::jsonb
      )
    `;

    return NextResponse.json({ evidence: rows[0], message: 'Evidence verified by authorised human operator.' });
  } catch (error) {
    return serverError(error);
  }
}
