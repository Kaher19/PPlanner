/**
 * SyncPanel — React Island
 *
 * Shown only when the user is authenticated.
 * Provides bidirectional sync controls (push & pull) with Google Calendar.
 *
 * Security:
 *  - Uses credentials: 'same-origin' for all fetch calls (sends HttpOnly cookie)
 *  - Never stores or logs tokens
 *  - Input events sent to /api/sync/push are validated server-side
 *  - Output events from /api/sync/pull are validated client-side before merging
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { usePlanner } from '../hooks/usePlanner.js';
import type { PlannerEvent, SyncResult } from '../types/index.js';

type SyncStatus = 'idle' | 'pushing' | 'pulling' | 'success' | 'error';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export default function SyncPanel() {
  const { isAuthenticated } = useAuth();
  const { events, mergeFromRemote, markAsSynced } = usePlanner();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const handlePush = useCallback(async () => {
    if (syncStatus !== 'idle') return;
    setSyncStatus('pushing');

    try {
      const res = await fetch('/api/sync/push', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(events),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Push failed');
      }

      const result = await res.json() as SyncResult;

      // Update local events with their new googleCalendarEventId
      for (const updated of result.updatedEvents) {
        if (updated.googleCalendarEventId) {
          markAsSynced(updated.id, updated.googleCalendarEventId);
        }
      }

      setLastSynced(result.lastSynced);
      setSyncStatus('success');
      addToast('success', `✓ Pushed ${result.pushed} event${result.pushed === 1 ? '' : 's'} to Google Calendar`);
    } catch (err) {
      setSyncStatus('error');
      addToast('error', err instanceof Error ? err.message : 'Failed to push events');
    } finally {
      setTimeout(() => setSyncStatus('idle'), 2000);
    }
  }, [events, syncStatus, markAsSynced, addToast]);

  const handlePull = useCallback(async () => {
    if (syncStatus !== 'idle') return;
    setSyncStatus('pulling');

    try {
      const res = await fetch('/api/sync/pull', {
        credentials: 'same-origin',
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Pull failed');
      }

      const result = await res.json() as { events: PlannerEvent[]; pulled: number; lastSynced: string };

      mergeFromRemote(result.events);
      setLastSynced(result.lastSynced);
      setSyncStatus('success');
      addToast('success', `✓ Pulled ${result.pulled} event${result.pulled === 1 ? '' : 's'} from Google Calendar`);
    } catch (err) {
      setSyncStatus('error');
      addToast('error', err instanceof Error ? err.message : 'Failed to pull events');
    } finally {
      setTimeout(() => setSyncStatus('idle'), 2000);
    }
  }, [syncStatus, mergeFromRemote, addToast]);

  if (!isAuthenticated) return null;

  const dotClass =
    syncStatus === 'success' ? 'synced' :
    syncStatus === 'pushing' || syncStatus === 'pulling' ? 'syncing' :
    syncStatus === 'error' ? 'error' : '';

  const statusText =
    syncStatus === 'pushing' ? 'Pushing to Google Calendar…' :
    syncStatus === 'pulling' ? 'Pulling from Google Calendar…' :
    syncStatus === 'success' ? 'Sync complete' :
    syncStatus === 'error' ? 'Sync failed' :
    lastSynced
      ? `Last synced ${new Date(lastSynced).toLocaleTimeString()}`
      : 'Not yet synced';

  return (
    <>
      <div className="sync-panel" role="toolbar" aria-label="Google Calendar sync controls">
        <div className="sync-status" aria-live="polite">
          <div className={`sync-dot ${dotClass}`} aria-hidden="true" />
          <span>{statusText}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
          <span aria-hidden="true">🗓</span>
          Google Calendar
        </div>

        <div className="sync-panel-spacer" />

        <button
          id="btn-pull-calendar"
          className="btn btn-ghost"
          onClick={handlePull}
          disabled={syncStatus !== 'idle'}
          aria-label="Pull events from Google Calendar"
          style={{ fontSize: 12, padding: '6px 12px', height: 32 }}
        >
          {syncStatus === 'pulling' ? (
            <><div className="spinner" style={{ width: 12, height: 12 }} />Pulling…</>
          ) : (
            <><span aria-hidden="true">↓</span> Pull from Google</>
          )}
        </button>

        <button
          id="btn-push-calendar"
          className="btn btn-primary"
          onClick={handlePush}
          disabled={syncStatus !== 'idle'}
          aria-label="Push local events to Google Calendar"
          style={{ fontSize: 12, padding: '6px 14px', height: 32 }}
        >
          {syncStatus === 'pushing' ? (
            <><div className="spinner" style={{ width: 12, height: 12 }} />Pushing…</>
          ) : (
            <><span aria-hidden="true">↑</span> Push to Google</>
          )}
        </button>
      </div>

      {/* Toast notifications */}
      <div className="toast-container" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </>
  );
}
