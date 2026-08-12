import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function requireAccess(request: NextRequest) {
  const expected = process.env.APP_ADMIN_KEY;
  if (!expected) return null; // setup/demo mode only

  const provided = request.headers.get('x-genevieve-key') || '';
  if (!safeEqual(provided, expected)) {
    return NextResponse.json(
      { error: 'Access key required or incorrect.' },
      { status: 401 }
    );
  }
  return null;
}
