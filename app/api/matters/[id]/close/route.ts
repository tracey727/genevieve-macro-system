import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/auth';
import { defaultOperator, getSql } from '@/lib/db';
import { serverError } from '@/lib/http';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = requireAccess(request);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const operator = String(body.operator || defaultOperator()).trim();
    const sql = getSql();
    const [result] = await sql`SELECT * FROM close_matter_with_gate(${id}, ${operator})`;
    return NextResponse.json(result, { status: result?.success ? 200 : 409 });
  } catch (error) {
    return serverError(error);
  }
}
