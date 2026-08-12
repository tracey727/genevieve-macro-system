import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/auth';
import { defaultOperator, getSql } from '@/lib/db';
import { badRequest, serverError } from '@/lib/http';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = requireAccess(request);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const docType = String(body.document_type || '').trim();
    const checksum = String(body.file_checksum || '').trim();
    const author = String(body.source_author || '').trim();
    const verified = Boolean(body.verified);
    const operator = String(body.operator || defaultOperator()).trim();

    if (!docType || !checksum || !author) return badRequest('Document type, checksum and source author are required.');
    if (checksum.length < 32) return badRequest('Checksum must be at least 32 characters.');

    const evidenceId = String(body.evidence_id || `EVI-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
    const sql = getSql();
    const [entry] = await sql`
      INSERT INTO evidence_workspace(
        evidence_id, matter_id, document_type, file_checksum, source_author,
        is_compliance_verified, verified_by, verified_at
      ) VALUES (
        ${evidenceId}, ${id}, ${docType}, ${checksum}, ${author},
        ${verified}, ${verified ? operator : null}, ${verified ? new Date().toISOString() : null}
      ) RETURNING *
    `;

    await sql`
      INSERT INTO audit_timeline(matter_id, operator_id, action_performed, new_state)
      VALUES (
        ${id}, ${operator}, 'EVIDENCE_RECORDED',
        ${JSON.stringify({ evidence_id: evidenceId, document_type: docType, verified })}::jsonb
      )
    `;

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
