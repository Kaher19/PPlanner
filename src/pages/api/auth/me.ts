/**
 * GET /api/auth/me
 *
 * Returns the authenticated user's profile information.
 * Tokens are NEVER included in the response — only public profile data.
 *
 * Security:
 *  - Reads session from HttpOnly cookie (not accessible to JS)
 *  - Returns only { googleId, email, name, picture }
 *  - Returns 401 if not authenticated
 *  - Cache-Control: no-store to prevent caching of auth state
 */

import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/session.js';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);

  if (!session.userInfo) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  // Return only public profile info — NEVER include tokens
  return new Response(JSON.stringify(session.userInfo), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
};
