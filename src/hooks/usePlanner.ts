/**
 * PPlaner — usePlanner Hook
 *
 * Manages CRUD operations for planner events in localStorage.
 * Provides reactive state for the React component tree.
 *
 * Security:
 *  - All events validated on load (corrupt/tampered data rejected)
 *  - Only non-sensitive data (title, time, color) stored in localStorage
 *  - Auth tokens are NEVER stored here (they live in HttpOnly cookies)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  loadEvents,
  saveEvents,
  createEvent,
  updateEvent as storageUpdateEvent,
  deleteEvent as storageDeleteEvent,
  mergeRemoteEvents,
} from '../lib/eventStorage.js';
import type { PlannerEvent, EventColor, Recurrence } from '../types/index.js';

export interface CreateEventInput {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  color: EventColor;
  recurrence?: Recurrence;
}

export interface UsePlannerReturn {
  events: PlannerEvent[];
  addEvent: (input: CreateEventInput) => PlannerEvent;
  updateEvent: (id: string, updates: Partial<CreateEventInput>) => PlannerEvent | null;
  deleteEvent: (id: string) => void;
  mergeFromRemote: (remoteEvents: PlannerEvent[]) => void;
  markAsSynced: (id: string, googleCalendarEventId: string) => void;
  isLoading: boolean;
}

export function usePlanner(): UsePlannerReturn {
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load events from localStorage on mount
  useEffect(() => {
    const loaded = loadEvents();
    setEvents(loaded);
    setIsLoading(false);
  }, []);

  const addEvent = useCallback((input: CreateEventInput): PlannerEvent => {
    const created = createEvent(input);
    setEvents(prev => [...prev, created]);
    return created;
  }, []);

  const updateEvent = useCallback(
    (id: string, updates: Partial<CreateEventInput>): PlannerEvent | null => {
      const updated = storageUpdateEvent(id, updates);
      if (updated) {
        setEvents(prev => prev.map(e => (e.id === id ? updated : e)));
      }
      return updated;
    },
    []
  );

  const deleteEvent = useCallback((id: string): void => {
    storageDeleteEvent(id);
    setEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  const mergeFromRemote = useCallback((remoteEvents: PlannerEvent[]): void => {
    const merged = mergeRemoteEvents(remoteEvents);
    setEvents(merged);
  }, []);

  const markAsSynced = useCallback(
    (id: string, googleCalendarEventId: string): void => {
      const updated = storageUpdateEvent(id, {
        googleCalendarEventId,
        lastSynced: new Date().toISOString(),
      });
      if (updated) {
        setEvents(prev => prev.map(e => (e.id === id ? updated : e)));
      }
    },
    []
  );

  return { events, addEvent, updateEvent, deleteEvent, mergeFromRemote, markAsSynced, isLoading };
}
