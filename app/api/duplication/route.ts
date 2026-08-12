import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/auth';
import { getSql } from '@/lib/db';
import { badRequest, serverError } from '@/lib/http';

export async function POST(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const systemName = String(body.system_name || '').trim();
    if (!systemName) return badRequest('System/asset name is required.');

    const sql = getSql();
    const matches = await sql`
      SELECT asset_code, display_name, owning_entity, notes
      FROM shared_asset_registry
      WHERE is_active = TRUE AND LOWER(asset_code) = LOWER(${systemName})
      LIMIT 1
    `;

    if (matches.length) {
      return NextResponse.json({
        duplicate: true,
        message: 'DUPLICATION SIGNAL: a matching active asset exists in the shared registry. Human procurement review is required before any decision.',
        match: matches[0]
      });
    }

    return NextResponse.json({ duplicate: false, message: 'No exact active registry match found. This does not constitute procurement approval.' });
  } catch (error) {
    return serverError(error);
  }
}
