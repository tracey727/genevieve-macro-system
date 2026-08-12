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
    const rows = await sql`
      SELECT audit_id, matter_id, operator_id, action_performed,
             previous_state, new_state, event_metadata, occurred_at
      FROM audit_timeline
      ORDER BY occurred_at DESC
      LIMIT 200
    `;
    return NextResponse.json({ audit: rows });
  } catch (error) {
    return serverError(error);
  }
}
