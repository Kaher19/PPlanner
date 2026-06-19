/**
 * POST /api/sync/push
 *
 * Pushes local planner events to Google Calendar (local → Google).
 *
 * Security:
 *  - Requires authentication (401 if not logged in)
 *  - Validates request body: must be JSON array of events
 *  - Sanitizes each event's title and description before sending to Google
 *  - Handles token refresh transparently
 *  - Returns updated events with googleCalendarEventId (not tokens)
 *  - Error messages are generic to avoid information leakage
 */

import type { APIRoute } from 'astro';
import { getSession, createSessionCookie } from '../../../../lib/session.js';
import {
  getValidAccessToken,
  toGoogleEvent,
  createCalendarEvent,
  updateCalendarEvent,
} from '../../../../lib/googleCalendar.js';
import { isValidEvent } from '../../../../lib/eventStorage.js';
import type { PlannerEvent } from '../../../../types/index.js';

const MAX_EVENTS_PER_REQUEST = 100;

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);

  if (!session.userInfo) {
    return jsonError('Not authenticated', 401);
  }

  // Parse and validate request body
  let events: unknown[];
  try {
    const body = await request.json() as unknown;
    if (!Array.isArray(body)) {
      return jsonError('Request body must be a JSON array of events', 400);
    }
    events = body.slice(0, MAX_EVENTS_PER_REQUEST); // Limit to prevent abuse
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  // Validate each event
  const validEvents = events.filter(isValidEvent) as PlannerEvent[];
  if (validEvents.length === 0) {
    return json({ pushed: 0, updatedEvents: [], lastSynced: new Date().toISOString() });
  }

  // Get a valid access token (refreshes automatically if expired)
  const tokenResult = await getValidAccessToken(session);
  if (!tokenResult) {
    return jsonError('Google authentication expired. Please sign in again.', 401);
  }

  const { accessToken, sessionUpdate } = tokenResult;

  const updatedEvents: PlannerEvent[] = [];
  let pushed = 0;

  for (const event of validEvents) {
    try {
      const googlePayload = toGoogleEvent(event);

      if (event.googleCalendarEventId) {
        // Update existing Google Calendar event
        await updateCalendarEvent(accessToken, event.googleCalendarEventId, googlePayload);
        updatedEvents.push({
          ...event,
          lastSynced: new Date().toISOString(),
        });
      } else {
        // Create new Google Calendar event
        const created = await createCalendarEvent(accessToken, googlePayload);
        updatedEvents.push({
          ...event,
          googleCalendarEventId: created.id,
          lastSynced: new Date().toISOString(),
        });
      }
      pushed++;
    } catch {
      // Log server-side only — do not expose details to client
      console.error(`[PPlaner] Failed to sync event ${event.id} to Google Calendar`);
    }
  }

  const responseBody = {
    pushed,
    updatedEvents,
    lastSynced: new Date().toISOString(),
  };

  // Build response headers — update session if token was refreshed
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };

  if (Object.keys(sessionUpdate).length > 0) {
    const newSession = { ...session, ...sessionUpdate };
    headers['Set-Cookie'] = await createSessionCookie(newSession);
  }

  return new Response(JSON.stringify(responseBody), { status: 200, headers });
};

export const GET: APIRoute = async () =>
  jsonError('Method not allowed', 405, { Allow: 'POST' });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function jsonError(message: string, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}
