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
      SELECT entity_id, name, state_jurisdiction, legacy_ancestry_ids, is_active, created_at
      FROM sys_entities
      ORDER BY is_active DESC, name ASC
    `;
    return NextResponse.json({ entities: rows });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const state = String(body.state_jurisdiction || 'QLD').trim().toUpperCase();
    const ancestry = String(body.legacy_ancestry_ids || '').trim();
    const operator = String(body.operator || defaultOperator()).trim();
    if (!name) return badRequest('Entity name is required.');
    if (!/^[A-Z]{2,4}$/.test(state)) return badRequest('State/jurisdiction must be a short code such as QLD, NSW or ACT.');

    const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'ENTITY';
    const entityId = String(body.entity_id || `${base}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`).trim();
    const sql = getSql();
    const [entity] = await sql`
      INSERT INTO sys_entities(entity_id, name, state_jurisdiction, legacy_ancestry_ids)
      VALUES (${entityId}, ${name}, ${state}, ${ancestry || null})
      RETURNING *
    `;
    await sql`
      INSERT INTO audit_timeline(matter_id, operator_id, action_performed, new_state, event_metadata)
      VALUES (NULL, ${operator}, 'ENTITY_CREATED', ${JSON.stringify({ entity_id: entityId, name, state })}::jsonb, '{}'::jsonb)
    `;
    return NextResponse.json({ entity }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
