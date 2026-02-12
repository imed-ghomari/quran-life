#!/usr/bin/env node

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3010';
const secret = process.env.E2E_AUTH_SECRET || '';
const email = process.env.E2E_TEST_EMAIL || process.env.E2E_DEFAULT_EMAIL || 'e2e@local.test';
const nextPath = process.env.E2E_NEXT_PATH || '/dashboard';

if (!secret) {
  console.error('Missing E2E_AUTH_SECRET.');
  process.exit(1);
}

const url = new URL('/api/e2e/session', baseUrl);
url.searchParams.set('secret', secret);
url.searchParams.set('email', email);
url.searchParams.set('next', nextPath);

process.stdout.write(url.toString());
