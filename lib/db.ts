import { neon } from '@neondatabase/serverless';

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not configured. Add it in Vercel Environment Variables or .env.local.');
  }
  return neon(url);
}

export function defaultOperator() {
  return process.env.DEFAULT_OPERATOR_ID || 'GENEVIEVE_ADMIN';
}
