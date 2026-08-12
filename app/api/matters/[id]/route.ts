import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/auth';
import { getSql } from '@/lib/db';
import { serverError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = requireAccess(request);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const sql = getSql();
    const matters = await sql`
      SELECT m.*, e.name AS entity_name,
             COALESCE((SELECT SUM(direct_cost) FROM cost_ledger c WHERE c.matter_id = m.matter_id), 0)::numeric AS total_cost
      FROM operational_matters m
      JOIN sys_entities e ON e.entity_id = m.entity_id
      WHERE m.matter_id = ${id}
      LIMIT 1
    `;
    if (!matters.length) return NextResponse.json({ error: 'Matter not found.' }, { status: 404 });

    const costs = await sql`
      SELECT * FROM cost_ledger WHERE matter_id = ${id} ORDER BY recorded_at DESC
    `;
    const evidence = await sql`
      SELECT * FROM evidence_workspace WHERE matter_id = ${id} ORDER BY uploaded_at DESC
    `;
    const audit = await sql`
      SELECT * FROM audit_timeline WHERE matter_id = ${id} ORDER BY occurred_at DESC LIMIT 100
    `;
    return NextResponse.json({ matter: matters[0], costs, evidence, audit });
  } catch (error) {
    return serverError(error);
  }
}
