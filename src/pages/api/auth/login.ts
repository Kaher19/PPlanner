/**
 * GET /api/auth/login
 *
 * Initiates the Google OAuth2 Authorization Code flow.
 *
 * Security:
 *  - Generates a cryptographically random `state` parameter (CSRF protection)
 *  - Stores state in an encrypted session cookie
 *  - Uses `access_type=offline` to receive a refresh_token
 *  - Only requests the minimum necessary scopes (principle of least privilege)
 *  - Validates that GOOGLE_CLIENT_ID is configured before proceeding
 */

import type { APIRoute } from 'astro';
import { getSession, createSessionCookie } from '../../../lib/session.js';

export const GET: APIRoute = async ({ request }) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=not_configured' },
    });
  }

  // Generate cryptographically random state for CSRF protection
  const state = crypto.randomUUID();

  // Read current session (to preserve any existing data) and add state
  const session = await getSession(request);
  const sessionCookie = await createSessionCookie({ ...session, oauthState: state });

  // Determine redirect URI based on request origin (works for both local + Vercel)
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', [
    'openid',
    'profile',
    'email',
    // Minimum required scope for Google Calendar event management
    'https://www.googleapis.com/auth/calendar.events',
  ].join(' '));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('access_type', 'offline'); // Required to receive refresh_token
  authUrl.searchParams.set('prompt', 'consent');       // Ensures refresh_token is returned

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Set-Cookie': sessionCookie,
      'Cache-Control': 'no-store',
    },
  });
};
