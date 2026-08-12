import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/auth';
import { getSql } from '@/lib/db';
import { badRequest, serverError } from '@/lib/http';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = requireAccess(request);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const dailyRate = Number(body.daily_recurrence_rate);
    const delayDays = Number(body.delay_days);
    if (!Number.isFinite(dailyRate) || dailyRate < 0) return badRequest('Daily recurrence rate must be zero or greater.');
    if (!Number.isInteger(delayDays) || delayDays < 0 || delayDays > 3650) return badRequest('Delay days must be an integer from 0 to 3650.');

    const sql = getSql();
    const rows = await sql`
      SELECT COALESCE(SUM(direct_cost), 0)::numeric AS historical_sunk_waste
      FROM cost_ledger WHERE matter_id = ${id}
    `;
    const historical = Number(rows[0]?.historical_sunk_waste || 0);
    const projected = dailyRate * delayDays;
    return NextResponse.json({
      historical_sunk_waste: historical,
      projected_inaction_penalty_cost: projected,
      total_risk_exposure: historical + projected,
      advisory_only: true
    });
  } catch (error) {
    return serverError(error);
  }
}
