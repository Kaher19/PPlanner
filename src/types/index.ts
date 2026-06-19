// =============================================================================
// PPlaner — Core Types
// =============================================================================

/** Recurring event frequency options */
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly';

/** Predefined event color keys */
export type EventColor =
  | 'violet'
  | 'blue'
  | 'teal'
  | 'green'
  | 'amber'
  | 'rose'
  | 'orange';

/** Color palette for events */
export const EVENT_COLORS: Record<EventColor, { bg: string; text: string; border: string }> = {
  violet: { bg: '#7c3aed', text: '#f1f0f9', border: '#9f67fa' },
  blue:   { bg: '#2563eb', text: '#f1f0f9', border: '#60a5fa' },
  teal:   { bg: '#0d9488', text: '#f1f0f9', border: '#2dd4bf' },
  green:  { bg: '#16a34a', text: '#f1f0f9', border: '#4ade80' },
  amber:  { bg: '#d97706', text: '#f1f0f9', border: '#fbbf24' },
  rose:   { bg: '#e11d48', text: '#f1f0f9', border: '#fb7185' },
  orange: { bg: '#ea580c', text: '#f1f0f9', border: '#fb923c' },
};

/** Recurrence configuration for a planner event */
export interface Recurrence {
  type: Exclude<RecurrenceType, 'none'>;
  /** ISO date string (YYYY-MM-DD). If omitted, event repeats indefinitely. */
  endDate?: string;
}

/** A planner event stored in localStorage */
export interface PlannerEvent {
  /** Unique identifier (UUID) */
  id: string;
  /** Event title — validated: 1–200 characters */
  title: string;
  /** Optional description — max 1000 characters */
  description?: string;
  /** ISO datetime string for event start */
  startTime: string;
  /** ISO datetime string for event end */
  endTime: string;
  /** Event color key */
  color: EventColor;
  /** Recurrence config, undefined means one-time event */
  recurrence?: Recurrence;
  /** Google Calendar event ID after successful sync */
  googleCalendarEventId?: string;
  /** ISO datetime of last successful sync */
  lastSynced?: string;
  /** ISO datetime of creation */
  createdAt: string;
  /** ISO datetime of last local update */
  updatedAt: string;
}

/** An expanded event instance (recurring events get one instance per day/week/month) */
export interface EventInstance extends PlannerEvent {
  /** The actual date/time this specific instance occurs */
  instanceStart: Date;
  /** Whether this instance is part of a recurring series */
  isRecurringInstance: boolean;
}

/** User info returned to the client from /api/auth/me */
export interface UserInfo {
  googleId: string;
  email: string;
  name: string;
  /** URL to Google profile picture */
  picture: string;
}

/** Auth state used in useAuth hook */
export interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: UserInfo | null;
}

/** Sync result returned from the backend */
export interface SyncResult {
  pushed: number;
  pulled: number;
  updatedEvents: PlannerEvent[];
  lastSynced: string;
}

/** Encrypted session data (stored server-side in cookie, never exposed to client) */
export interface SessionData {
  userInfo?: UserInfo;
  /** Google OAuth2 access token — NEVER sent to client */
  accessToken?: string;
  /** Google OAuth2 refresh token — NEVER sent to client */
  refreshToken?: string;
  /** Unix timestamp (ms) when access token expires */
  tokenExpiry?: number;
  /** CSRF state parameter for OAuth2 flow */
  oauthState?: string;
}
