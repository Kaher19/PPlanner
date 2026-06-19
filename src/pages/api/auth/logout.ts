/**
 * POST /api/auth/logout
 *
 * Clears the session cookie, logging the user out.
 *
 * Security:
 *  - Accepts only POST (state-changing operation)
 *  - Clears the encrypted session cookie
 *  - Cache-Control: no-store to prevent caching
 *
 * TODO(security): For enhanced security, consider revoking the Google OAuth2
 * token server-side via https://oauth2.googleapis.com/revoke
 * This prevents the token from being usable even if intercepted.
 */

import type { APIRoute } from 'astro';
import { clearSessionCookie } from '../../../lib/session.js';

export const POST: APIRoute = async () => {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
      'Cache-Control': 'no-store',
    },
  });
};

// Reject non-POST methods
export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'POST' },
  });
