/**
 * EventModal — React Island
 *
 * Modal dialog for creating and editing planner events.
 * Supports recurring events (daily, weekly, monthly) with optional end date.
 *
 * Security:
 *  - All inputs use React controlled components (framework-native XSS protection)
 *  - No dangerouslySetInnerHTML anywhere
 *  - Input lengths validated client-side (also validated server-side on sync)
 *  - Uses native <dialog>-like modal with focus trap via role="dialog"
 *  - Uses modal-native alert() is replaced with inline form error rendering
 */

import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { format } from 'date-fns';
import { EVENT_COLORS } from '../types/index.js';
import type { PlannerEvent, EventColor, Recurrence, RecurrenceType } from '../types/index.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

interface FormState {
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  color: EventColor;
  recurrence: RecurrenceType;
  recurrenceEndDate: string;
}

function validate(form: FormState): string[] {
  const errors: string[] = [];
  const title = form.title.trim();

  if (!title) errors.push('Title is required.');
  else if (title.length > 200) errors.push('Title must be 200 characters or less.');

  if (!form.date || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errors.push('A valid date is required.');
  if (!form.startTime || !/^\d{2}:\d{2}$/.test(form.startTime)) errors.push('A valid start time is required.');
  if (!form.endTime || !/^\d{2}:\d{2}$/.test(form.endTime)) errors.push('A valid end time is required.');

  if (form.startTime && form.endTime) {
    if (timeToMinutes(form.endTime) <= timeToMinutes(form.startTime)) {
      errors.push('End time must be after start time.');
    }
  }

  if (form.description.length > 1000) errors.push('Description must be 1000 characters or less.');

  if (form.recurrence !== 'none' && form.recurrenceEndDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.recurrenceEndDate)) {
      errors.push('Recurrence end date must be a valid date.');
    } else if (form.recurrenceEndDate < form.date) {
      errors.push('Recurrence end date must be on or after the event date.');
    }
  }

  return errors;
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface EventModalProps {
  event: PlannerEvent | null;
  defaultDate?: Date;
  defaultHour?: number;
  onSave: (data: Omit<PlannerEvent, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export default function EventModal({
  event,
  defaultDate,
  defaultHour = 9,
  onSave,
  onDelete,
  onClose,
}: EventModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const getDefaultForm = useCallback((): FormState => {
    if (event) {
      const start = new Date(event.startTime);
      const end = new Date(event.endTime);
      return {
        title: event.title,
        description: event.description ?? '',
        date: format(start, 'yyyy-MM-dd'),
        startTime: format(start, 'HH:mm'),
        endTime: format(end, 'HH:mm'),
        color: event.color,
        recurrence: event.recurrence?.type ?? 'none',
        recurrenceEndDate: event.recurrence?.endDate ?? '',
      };
    }

    const d = defaultDate ?? new Date();
    const h = defaultHour;
    const end = Math.min(h + 1, 23);
    return {
      title: '',
      description: '',
      date: format(d, 'yyyy-MM-dd'),
      startTime: `${String(h).padStart(2, '0')}:00`,
      endTime: `${String(end).padStart(2, '0')}:00`,
      color: 'violet',
      recurrence: 'none',
      recurrenceEndDate: '',
    };
  }, [event, defaultDate, defaultHour]);

  const [form, setForm] = useState<FormState>(getDefaultForm);
  const [errors, setErrors] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Focus title on open
  useEffect(() => { titleRef.current?.focus(); }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent background scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors.length > 0) setErrors([]);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const validationErrors = validate(form);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    const startTime = new Date(`${form.date}T${form.startTime}:00`).toISOString();
    const endTime = new Date(`${form.date}T${form.endTime}:00`).toISOString();

    const recurrence: Recurrence | undefined =
      form.recurrence !== 'none'
        ? { type: form.recurrence, endDate: form.recurrenceEndDate || undefined }
        : undefined;

    onSave({
      title: form.title.trim().slice(0, 200),
      description: form.description.trim().slice(0, 1000) || undefined,
      startTime,
      endTime,
      color: form.color,
      recurrence,
      googleCalendarEventId: event?.googleCalendarEventId,
      lastSynced: event?.lastSynced,
    });

    onClose();
  };

  const handleDelete = () => {
    if (!event || !onDelete) return;
    setIsDeleting(true);
    onDelete(event.id);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal" ref={modalRef}>
        <div className="modal-header">
          <h2 className="modal-title" id="modal-title">
            {event ? 'Edit Event' : 'New Event'}
          </h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {/* Title */}
            <div className="form-group">
              <label className="form-label" htmlFor="event-title">Title *</label>
              <input
                id="event-title"
                ref={titleRef}
                className="form-input"
                type="text"
                placeholder="Add a title…"
                value={form.title}
                onChange={e => setField('title', e.target.value)}
                maxLength={200}
                required
                autoComplete="off"
              />
            </div>

            {/* Date + Time row */}
            <div className="modal-row">
              <div className="form-group">
                <label className="form-label" htmlFor="event-date">Date *</label>
                <input
                  id="event-date"
                  className="form-input"
                  type="date"
                  value={form.date}
                  min={today}
                  onChange={e => setField('date', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="event-color">Color</label>
                <div className="color-picker" role="group" aria-label="Event color">
                  {(Object.keys(EVENT_COLORS) as EventColor[]).map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`color-swatch${form.color === color ? ' active' : ''}`}
                      style={{ backgroundColor: EVENT_COLORS[color].bg }}
                      onClick={() => setField('color', color)}
                      aria-label={color}
                      aria-pressed={form.color === color}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Start + End time */}
            <div className="modal-row">
              <div className="form-group">
                <label className="form-label" htmlFor="event-start">Start *</label>
                <input
                  id="event-start"
                  className="form-input"
                  type="time"
                  value={form.startTime}
                  onChange={e => setField('startTime', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="event-end">End *</label>
                <input
                  id="event-end"
                  className="form-input"
                  type="time"
                  value={form.endTime}
                  onChange={e => setField('endTime', e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Recurrence */}
            <div className="modal-row">
              <div className="form-group">
                <label className="form-label" htmlFor="event-recurrence">Repeat</label>
                <select
                  id="event-recurrence"
                  className="form-select"
                  value={form.recurrence}
                  onChange={e => setField('recurrence', e.target.value as RecurrenceType)}
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {form.recurrence !== 'none' && (
                <div className="form-group">
                  <label className="form-label" htmlFor="event-recur-end">Until (optional)</label>
                  <input
                    id="event-recur-end"
                    className="form-input"
                    type="date"
                    value={form.recurrenceEndDate}
                    min={form.date}
                    onChange={e => setField('recurrenceEndDate', e.target.value)}
                    placeholder="No end date"
                  />
                </div>
              )}
            </div>

            {/* Description */}
            <div className="form-group">
              <label className="form-label" htmlFor="event-description">
                Description
                <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>optional</span>
              </label>
              <textarea
                id="event-description"
                className="form-textarea"
                placeholder="Add notes or details…"
                value={form.description}
                onChange={e => setField('description', e.target.value)}
                maxLength={1000}
                rows={3}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                {form.description.length}/1000
              </span>
            </div>

            {/* Validation errors */}
            {errors.length > 0 && (
              <ul
                role="alert"
                aria-label="Form errors"
                style={{
                  background: 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.30)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px',
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {errors.map((err, i) => (
                  <li key={i} className="form-error">
                    <span aria-hidden="true">•</span> {err}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="modal-footer">
            {event && onDelete && (
              <button
                id="btn-delete-event"
                type="button"
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={isDeleting}
                aria-label="Delete this event"
              >
                {isDeleting ? 'Deleting…' : '🗑 Delete'}
              </button>
            )}

            <div className="modal-footer-spacer" />

            <button
              id="btn-cancel-event"
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              id="btn-save-event"
              type="submit"
              className="btn btn-primary"
            >
              {event ? '✓ Update' : '+ Add Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
