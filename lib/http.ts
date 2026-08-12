import { NextResponse } from 'next/server';

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  console.error(error);
  return NextResponse.json({ error: message }, { status: 500 });
}

export function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
