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
    const expenseType = String(body.expense_type || '').trim();
    const directCost = Number(body.direct_cost);
    const supplier = String(body.supplier || '').trim();
    const hourlyRate = body.hourly_rate === '' || body.hourly_rate == null ? null : Number(body.hourly_rate);
    const hours = body.hours === '' || body.hours == null ? null : Number(body.hours);
    const operator = String(body.operator || defaultOperator()).trim();

    if (!expenseType) return badRequest('Expense type is required.');
    if (!Number.isFinite(directCost) || directCost < 0) return badRequest('Direct cost must be zero or greater.');
    if (hourlyRate !== null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) return badRequest('Hourly rate is invalid.');
    if (hours !== null && (!Number.isFinite(hours) || hours < 0)) return badRequest('Hours are invalid.');

    const sql = getSql();
    const [entry] = await sql`
      INSERT INTO cost_ledger(
        matter_id, expense_type, supplier_contractor_name, hourly_rate, hours_logged,
        direct_cost, is_clawback_eligible
      ) VALUES (
        ${id}, ${expenseType}, ${supplier || null}, ${hourlyRate}, ${hours},
        ${directCost}, ${Boolean(body.is_clawback_eligible)}
      ) RETURNING *
    `;

    await sql`
      INSERT INTO audit_timeline(matter_id, operator_id, action_performed, new_state)
      VALUES (${id}, ${operator}, 'COST_RECORDED', ${JSON.stringify({ expense_type: expenseType, direct_cost: directCost })}::jsonb)
    `;

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
