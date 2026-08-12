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
    const category = request.nextUrl.searchParams.get('category');
    const sql = getSql();

    const rows = category
      ? await sql`
          SELECT COUNT(*)::int AS incident_count,
                 COALESCE(SUM(direct_cost), 0)::numeric AS total_cost
          FROM cost_ledger
          WHERE matter_id = ${id} AND LOWER(expense_type) = LOWER(${category})
        `
      : await sql`
          SELECT COUNT(*)::int AS incident_count,
                 COALESCE(SUM(direct_cost), 0)::numeric AS total_cost
          FROM cost_ledger
          WHERE matter_id = ${id}
        `;

    const data = rows[0] || { incident_count: 0, total_cost: 0 };
    const count = Number(data.incident_count || 0);
    const total = Number(data.total_cost || 0);
    const label = category ? ` matching “${category}”` : '';
    const statement = `GENEVIEVE AI ADVISORY: ${count} recorded cost entries${label} total approximately $${total.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. This is an advisory pattern signal only. It is not a clinical, procurement, employment, legal or financial decision and requires authorised human verification.`;

    return NextResponse.json({ count, total, category, statement, advisory_only: true });
  } catch (error) {
    return serverError(error);
  }
}
