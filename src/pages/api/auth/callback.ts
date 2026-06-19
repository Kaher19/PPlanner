/**
 * GET /api/auth/callback
 *
 * OAuth2 Authorization Code callback from Google.
 *
 * Security:
 *  - Validates the `state` parameter against the session (CSRF protection)
 *  - Exchanges the code server-side — client_secret never leaves the server
 *  - Stores tokens in an encrypted HttpOnly session cookie
 *  - Only userInfo (name, email, picture) is ever sent to the client
 *  - Tokens are NEVER included in the redirect URL or any client-visible response
 *  - Handles all error cases with generic messages to avoid information leakage
 */

import type { APIRoute } from 'astro';
import { getSession, createSessionCookie } from '../../../lib/session.js';
import type { SessionData, UserInfo } from '../../../types/index.js';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // User denied access or Google returned an error
  if (error) {
    return redirectTo('/?error=oauth_denied');
  }

  if (!code || !state) {
    return redirectTo('/?error=invalid_callback');
  }

  // Validate CSRF state
  const session = await getSession(request);

  if (!session.oauthState || session.oauthState !== state) {
    return redirectTo('/?error=invalid_state');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return redirectTo('/?error=not_configured');
  }

  // Exchange authorization code for tokens (server-side only)
  let tokens: GoogleTokenResponse;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${url.origin}/api/auth/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      console.error('[PPlaner] Token exchange failed:', tokenRes.status);
      return redirectTo('/?error=token_exchange_failed');
    }

    tokens = await tokenRes.json() as GoogleTokenResponse;
  } catch (err) {
    console.error('[PPlaner] Token exchange network error');
    return redirectTo('/?error=token_exchange_failed');
  }

  // Fetch user profile (name, email, picture) — NEVER log this data
  let userInfo: GoogleUserInfo;
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      return redirectTo('/?error=token_exchange_failed');
    }

    userInfo = await userRes.json() as GoogleUserInfo;
  } catch {
    return redirectTo('/?error=token_exchange_failed');
  }

  // Build new session — tokens NEVER reach the client
  const newSession: SessionData = {
    userInfo: {
      googleId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
    } satisfies UserInfo,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
    // Clear the used OAuth state
    oauthState: undefined,
  };

  const sessionCookie = await createSessionCookie(newSession);

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': sessionCookie,
      'Cache-Control': 'no-store',
    },
  });
};

function redirectTo(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store' },
  });
}
