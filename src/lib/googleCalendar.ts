/**
 * PPlaner — Google Calendar API Client
 *
 * This module runs SERVER-SIDE ONLY (Astro API routes / Vercel serverless).
 * The access_token is NEVER exposed to the browser.
 *
 * Security:
 *  - All requests use HTTPS to Google APIs
 *  - Access tokens are automatically refreshed using the refresh_token
 *  - Input from local events is validated and sanitized before sending to Google
 *  - Output from Google is treated as untrusted and mapped to our own types
 */

import type { PlannerEvent, SessionData } from '../types/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  recurrence?: string[];
  status?: string;
  extendedProperties?: {
    private?: {
      pplanerId?: string;
      ppplanerColor?: string;
      ppplanerRecurrence?: string;
    };
  };
}

interface GoogleCalendarEventInput {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  recurrence?: string[];
  extendedProperties?: {
    private: Record<string, string>;
  };
}

interface TokenRefreshResult {
  accessToken: string;
  tokenExpiry: number;
}

// ---------------------------------------------------------------------------
// Token Management
// ---------------------------------------------------------------------------

/**
 * Returns a valid access token, refreshing it if expired.
 * Returns null if the session has no tokens (user not authenticated).
 */
export async function getValidAccessToken(
  session: SessionData
): Promise<{ accessToken: string; sessionUpdate: Partial<SessionData> } | null> {
  const { accessToken, refreshToken, tokenExpiry } = session;

  if (!accessToken) return null;

  // Token still valid? (5-minute buffer for clock skew)
  const BUFFER_MS = 5 * 60 * 1000;
  if (tokenExpiry && Date.now() < tokenExpiry - BUFFER_MS) {
    return { accessToken, sessionUpdate: {} };
  }

  // Need to refresh
  if (!refreshToken) return null;

  try {
    const refreshed = await refreshAccessToken(refreshToken);
    return {
      accessToken: refreshed.accessToken,
      sessionUpdate: {
        accessToken: refreshed.accessToken,
        tokenExpiry: refreshed.tokenExpiry,
      },
    };
  } catch {
    return null;
  }
}

async function refreshAccessToken(refreshToken: string): Promise<TokenRefreshResult> {
  const clientId = import.meta.env.GOOGLE_CLIENT_ID;
  const clientSecret = import.meta.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth2 credentials not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    tokenExpiry: Date.now() + data.expires_in * 1000,
  };
}

// ---------------------------------------------------------------------------
// Calendar API Calls
// ---------------------------------------------------------------------------

/**
 * Lists Google Calendar events within a time range.
 * Uses singleEvents=true so recurring events are expanded into instances.
 */
export async function listCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleCalendarEvent[]> {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '500');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google Calendar list failed: ${response.status}`);
  }

  const data = await response.json() as { items?: GoogleCalendarEvent[] };
  return (data.items ?? []).filter(e => e.status !== 'cancelled');
}

/**
 * Creates a new event in Google Calendar.
 */
export async function createCalendarEvent(
  accessToken: string,
  event: GoogleCalendarEventInput
): Promise<GoogleCalendarEvent> {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    throw new Error(`Google Calendar create failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Updates an existing Google Calendar event.
 */
export async function updateCalendarEvent(
  accessToken: string,
  googleEventId: string,
  event: Partial<GoogleCalendarEventInput>
): Promise<GoogleCalendarEvent> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    throw new Error(`Google Calendar update failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Deletes a Google Calendar event.
 */
export async function deleteCalendarEvent(
  accessToken: string,
  googleEventId: string
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Google Calendar delete failed: ${response.status}`);
  }
}

// ---------------------------------------------------------------------------
// Conversion: PlannerEvent ↔ GoogleCalendarEvent
// ---------------------------------------------------------------------------

/** Converts a PlannerEvent to a Google Calendar API payload */
export function toGoogleEvent(
  event: PlannerEvent,
  timeZone: string = 'UTC'
): GoogleCalendarEventInput {
  // Validate and sanitize title (max 1000 chars for Google Calendar)
  const summary = event.title.slice(0, 1000);
  const description = event.description?.slice(0, 8192) ?? undefined;

  const result: GoogleCalendarEventInput = {
    summary,
    description,
    start: { dateTime: event.startTime, timeZone },
    end: { dateTime: event.endTime, timeZone },
    extendedProperties: {
      private: {
        pplanerId: event.id,
        ppplanerColor: event.color,
      },
    },
  };

  if (event.recurrence) {
    result.recurrence = [buildRRule(event.recurrence.type, event.recurrence.endDate)];
  }

  return result;
}

/** Converts a Google Calendar event to a PlannerEvent */
export function fromGoogleEvent(gcEvent: GoogleCalendarEvent): PlannerEvent | null {
  const startTime = gcEvent.start.dateTime ?? gcEvent.start.date;
  const endTime = gcEvent.end.dateTime ?? gcEvent.end.date;

  if (!startTime || !endTime || !gcEvent.id) return null;

  // Validate dates
  if (isNaN(new Date(startTime).getTime()) || isNaN(new Date(endTime).getTime())) {
    return null;
  }

  const pplanerId = gcEvent.extendedProperties?.private?.pplanerId;
  const color = (gcEvent.extendedProperties?.private?.ppplanerColor ?? 'violet') as PlannerEvent['color'];

  const now = new Date().toISOString();

  return {
    id: pplanerId ?? `gcal-${gcEvent.id}`,
    title: gcEvent.summary?.slice(0, 200) ?? '(no title)',
    description: gcEvent.description?.slice(0, 1000) ?? undefined,
    startTime,
    endTime,
    color,
    googleCalendarEventId: gcEvent.id,
    lastSynced: now,
    createdAt: now,
    updatedAt: now,
  };
}

function buildRRule(type: string, endDate?: string): string {
  const freq = type === 'daily' ? 'DAILY' : type === 'weekly' ? 'WEEKLY' : 'MONTHLY';
  let rule = `RRULE:FREQ=${freq}`;
  if (endDate) {
    // Format UNTIL as YYYYMMDDTHHMMSSZ
    const until = new Date(endDate + 'T23:59:59Z').toISOString().replace(/[-:]/g, '').replace('.000', '');
    rule += `;UNTIL=${until}`;
  }
  return rule;
}
