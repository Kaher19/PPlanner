/**
 * PPlaner — Event Storage Utilities
 *
 * Client-side utilities for working with planner events in localStorage.
 * Only non-sensitive event data (title, time, color, etc.) is stored here.
 * Auth tokens are NEVER stored in localStorage (they live in HttpOnly cookies).
 *
 * Security:
 *  - All events are validated before being written to storage
 *  - All events are validated after being read from storage
 *  - No dangerouslySetInnerHTML or innerHTML is used anywhere in this module
 */

import { EVENT_COLORS } from '../types/index.js';
import type { PlannerEvent, EventColor, RecurrenceType } from '../types/index.js';

export const STORAGE_KEY = 'pplaner-events';
export const STORAGE_VERSION = 1;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validates that a value is a non-empty string within the given length bounds */
function isValidString(value: unknown, min = 1, max = 200): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

/** Validates an ISO datetime string */
function isValidISODate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

const VALID_COLORS = new Set(Object.keys(EVENT_COLORS));
const VALID_RECURRENCE_TYPES = new Set<string>(['daily', 'weekly', 'monthly']);

/**
 * Type-guards an unknown value as a PlannerEvent.
 * Rejects any event that fails validation to protect against corrupt/tampered localStorage.
 */
export function isValidEvent(e: unknown): e is PlannerEvent {
  if (!e || typeof e !== 'object') return false;
  const ev = e as Record<string, unknown>;

  if (!isValidString(ev.id, 1, 128)) return false;
  if (!isValidString(ev.title, 1, 200)) return false;
  if (ev.description !== undefined && !isValidString(ev.description, 0, 1000)) return false;
  if (!isValidISODate(ev.startTime)) return false;
  if (!isValidISODate(ev.endTime)) return false;

  const start = new Date(ev.startTime as string);
  const end = new Date(ev.endTime as string);
  if (end <= start) return false;

  if (!VALID_COLORS.has(ev.color as string)) return false;

  if (ev.recurrence !== undefined) {
    if (!ev.recurrence || typeof ev.recurrence !== 'object') return false;
    const rec = ev.recurrence as Record<string, unknown>;
    if (!VALID_RECURRENCE_TYPES.has(rec.type as string)) return false;
    if (rec.endDate !== undefined && !isValidISODate(rec.endDate)) return false;
  }

  if (!isValidISODate(ev.createdAt)) return false;
  if (!isValidISODate(ev.updatedAt)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Reads all planner events from localStorage, validating each one.
 * Silently drops any corrupted or invalid events.
 */
export function loadEvents(): PlannerEvent[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isValidEvent);
  } catch {
    // Corrupt JSON in localStorage — start fresh
    console.warn('[PPlaner] Could not load events from localStorage. Starting fresh.');
    return [];
  }
}

/**
 * Writes events to localStorage.
 * Validates all events before writing.
 */
export function saveEvents(events: PlannerEvent[]): void {
  if (typeof window === 'undefined') return;

  try {
    const validated = events.filter(isValidEvent);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
  } catch {
    console.warn('[PPlaner] Could not save events to localStorage.');
  }
}

/**
 * Creates a new event and saves it. Returns the created event.
 */
export function createEvent(
  input: Omit<PlannerEvent, 'id' | 'createdAt' | 'updatedAt'>
): PlannerEvent {
  const now = new Date().toISOString();
  const event: PlannerEvent = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const events = loadEvents();
  saveEvents([...events, event]);
  return event;
}

/**
 * Updates an event by ID. Returns the updated event or null if not found.
 */
export function updateEvent(
  id: string,
  updates: Partial<Omit<PlannerEvent, 'id' | 'createdAt'>>
): PlannerEvent | null {
  const events = loadEvents();
  let updated: PlannerEvent | null = null;

  const newEvents = events.map(e => {
    if (e.id === id) {
      updated = { ...e, ...updates, id: e.id, createdAt: e.createdAt, updatedAt: new Date().toISOString() };
      return updated;
    }
    return e;
  });

  if (updated) saveEvents(newEvents);
  return updated;
}

/**
 * Deletes an event by ID.
 */
export function deleteEvent(id: string): void {
  const events = loadEvents();
  saveEvents(events.filter(e => e.id !== id));
}

/**
 * Merges remote events from Google Calendar into local storage (bidirectional sync).
 * - Remote events linked by googleCalendarEventId update existing local events
 * - New remote events (not in local) are added
 * - Local-only events are preserved
 */
export function mergeRemoteEvents(remoteEvents: PlannerEvent[]): PlannerEvent[] {
  const local = loadEvents();

  const googleIdToLocal = new Map<string, PlannerEvent>();
  for (const ev of local) {
    if (ev.googleCalendarEventId) {
      googleIdToLocal.set(ev.googleCalendarEventId, ev);
    }
  }

  const updatedLocal = local.map(ev => {
    const remote = ev.googleCalendarEventId
      ? remoteEvents.find(r => r.googleCalendarEventId === ev.googleCalendarEventId)
      : undefined;
    if (!remote) return ev;
    // Remote wins for synced events (remote is source of truth for Google Calendar data)
    return { ...ev, ...remote, id: ev.id, createdAt: ev.createdAt };
  });

  const newFromRemote = remoteEvents.filter(r =>
    r.googleCalendarEventId && !googleIdToLocal.has(r.googleCalendarEventId)
  );

  const merged = [...updatedLocal, ...newFromRemote].filter(isValidEvent);
  saveEvents(merged);
  return merged;
}

// ---------------------------------------------------------------------------
// Event expansion (recurring events)
// ---------------------------------------------------------------------------

import {
  addDays,
  addMonths,
  differenceInMilliseconds,
  getDate,
  getDay,
  getHours,
  getMinutes,
  setHours,
  setMinutes,
  setDate,
  startOfDay,
  isAfter,
  isBefore,
  isSameDay,
} from 'date-fns';

import type { EventInstance } from '../types/index.js';

/**
 * Expands all events (including recurring ones) into instances for a given week.
 * @param events - the full list of PlannerEvents
 * @param weekStart - Monday of the target week (start of day)
 * @returns array of EventInstances sorted by instanceStart
 */
export function expandEventsForWeek(
  events: PlannerEvent[],
  weekStart: Date
): EventInstance[] {
  const weekEnd = addDays(weekStart, 6);
  const instances: EventInstance[] = [];

  for (const event of events) {
    const eventStart = new Date(event.startTime);
    const eventEnd = new Date(event.endTime);
    const duration = differenceInMilliseconds(eventEnd, eventStart);
    const recurrenceEnd = event.recurrence?.endDate
      ? new Date(event.recurrence.endDate + 'T23:59:59')
      : addMonths(weekEnd, 24); // Show recurring events up to 2 years if no end

    if (!event.recurrence) {
      // One-time event
      if (
        isAfter(eventStart, startOfDay(addDays(weekStart, -1))) &&
        isBefore(eventStart, addDays(weekEnd, 1))
      ) {
        instances.push(makeInstance(event, eventStart, false));
      }
    } else {
      // Recurring event — find instances within this week
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const day = addDays(weekStart, dayOffset);

        if (
          isBefore(day, startOfDay(eventStart)) ||
          isAfter(day, recurrenceEnd)
        ) {
          continue;
        }

        let match = false;

        switch (event.recurrence.type) {
          case 'daily':
            match = true;
            break;
          case 'weekly':
            match = getDay(day) === getDay(eventStart);
            break;
          case 'monthly':
            match = getDate(day) === getDate(eventStart);
            break;
        }

        if (match) {
          // Build instance start time: same day but same hour:minute as original
          let instanceStart = setHours(
            setMinutes(startOfDay(day), getMinutes(eventStart)),
            getHours(eventStart)
          );
          const instanceEnd = new Date(instanceStart.getTime() + duration);

          instances.push(
            makeInstance(
              {
                ...event,
                id: `${event.id}__${day.toISOString().slice(0, 10)}`,
                startTime: instanceStart.toISOString(),
                endTime: instanceEnd.toISOString(),
              },
              instanceStart,
              true
            )
          );
        }
      }
    }
  }

  return instances.sort(
    (a, b) => a.instanceStart.getTime() - b.instanceStart.getTime()
  );
}

function makeInstance(
  event: PlannerEvent,
  instanceStart: Date,
  isRecurringInstance: boolean
): EventInstance {
  return { ...event, instanceStart, isRecurringInstance };
}
