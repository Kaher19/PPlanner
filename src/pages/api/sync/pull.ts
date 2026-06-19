/**
 * GET /api/sync/pull
 *
 * Pulls events from Google Calendar for the next 60 days (Google → local).
 *
 * Security:
 *  - Requires authentication (401 if not logged in)
 *  - Only fetches the user's own primary calendar (principle of least privilege)
 *  - All Google API responses are treated as untrusted and validated/mapped
 *  - Token refreshed transparently; updated session returned as HttpOnly cookie
 *  - Error messages are generic
 */

import type { APIRoute } from 'astro';
import { getSession, createSessionCookie } from '../../../lib/session.ts';
import {
  getValidAccessToken,
  listCalendarEvents,
  fromGoogleEvent,
} from '../../../lib/googleCalendar.ts';
import { addDays } from 'date-fns';

// Pull events for a 60-day window centered around today (30 past + 30 future)
const DAYS_PAST = 30;
const DAYS_FUTURE = 60;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);

  if (!session.userInfo) {
    return jsonError('Not authenticated', 401);
  }

  const tokenResult = await getValidAccessToken(session);
  if (!tokenResult) {
    return jsonError('Google authentication expired. Please sign in again.', 401);
  }

  const { accessToken, sessionUpdate } = tokenResult;

  const now = new Date();
  const timeMin = addDays(now, -DAYS_PAST).toISOString();
  const timeMax = addDays(now, DAYS_FUTURE).toISOString();

  let events;
  try {
    const googleEvents = await listCalendarEvents(accessToken, timeMin, timeMax);

    // Map Google Calendar events to PlannerEvent format
    // fromGoogleEvent validates and sanitizes each event — treats as untrusted input
    events = googleEvents
      .map(fromGoogleEvent)
      .filter((e): e is NonNullable<typeof e> => e !== null);
  } catch {
    console.error('[PPlaner] Failed to pull events from Google Calendar');
    return jsonError('Failed to fetch Google Calendar events. Please try again.', 502);
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };

  if (Object.keys(sessionUpdate).length > 0) {
    const newSession = { ...session, ...sessionUpdate };
    headers['Set-Cookie'] = await createSessionCookie(newSession);
  }

  return new Response(
    JSON.stringify({ events, pulled: events.length, lastSynced: new Date().toISOString() }),
    { status: 200, headers }
  );
};

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
