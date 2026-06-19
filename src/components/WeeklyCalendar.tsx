/**
 * WeeklyCalendar — React Island (client:load)
 *
 * The core daily planner component. Shows a full 7-day week view with:
 *  - 24-hour time grid (1px per minute, 60px per hour)
 *  - Recurring event expansion (daily/weekly/monthly)
 *  - Event overlap detection and side-by-side layout
 *  - Current-time red indicator line
 *  - Click empty cell → create event at that date/time
 *  - Click event → edit event
 *
 * Security:
 *  - All text displayed via React JSX (framework-native XSS protection)
 *  - No dangerouslySetInnerHTML anywhere
 *  - Events loaded from localStorage via validated hook (isValidEvent)
 *  - No native alert/confirm/prompt dialogs
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  format,
  addDays,
  startOfWeek,
  isToday,
  getHours,
  getMinutes,
  differenceInMinutes,
  isSameDay,
} from 'date-fns';

import { usePlanner } from '../hooks/usePlanner.js';
import { expandEventsForWeek } from '../lib/eventStorage.js';
import { EVENT_COLORS } from '../types/index.js';
import type { PlannerEvent, EventInstance } from '../types/index.js';
import EventModal from './EventModal.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 60; // px per hour → 1px per minute
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Overlap Layout Helpers ────────────────────────────────────────────────────

interface LayoutInfo {
  column: number;
  totalColumns: number;
}

function computeOverlapLayout(instances: EventInstance[]): Map<string, LayoutInfo> {
  const result = new Map<string, LayoutInfo>();
  const sorted = [...instances].sort(
    (a, b) => a.instanceStart.getTime() - b.instanceStart.getTime()
  );

  // Greedy interval coloring
  type Active = { id: string; endMs: number; column: number };
  const columns: Active[][] = [];

  for (const inst of sorted) {
    const startMs = inst.instanceStart.getTime();
    const endMs = new Date(inst.endTime).getTime();
    let placed = false;

    for (let col = 0; col < columns.length; col++) {
      const lastInCol = columns[col][columns[col].length - 1];
      if (lastInCol && lastInCol.endMs <= startMs) {
        columns[col].push({ id: inst.id, endMs, column: col });
        result.set(inst.id, { column: col, totalColumns: 0 }); // totalColumns fixed below
        placed = true;
        break;
      }
    }

    if (!placed) {
      const col = columns.length;
      columns.push([{ id: inst.id, endMs, column: col }]);
      result.set(inst.id, { column: col, totalColumns: 0 });
    }
  }

  // Fix totalColumns for all events in overlapping groups
  const total = columns.length;
  for (const [id, info] of result.entries()) {
    result.set(id, { ...info, totalColumns: total || 1 });
  }

  // Recalculate per-group total columns (events that don't actually overlap each other
  // shouldn't use the full column count of the entire day). Simple approximation:
  // group events by whether they share any overlap.
  const groups: Set<string>[] = [];
  const idToGroup = new Map<string, number>();

  for (const inst of sorted) {
    const startMs = inst.instanceStart.getTime();
    const endMs = new Date(inst.endTime).getTime();
    let merged = false;

    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      const anyOverlap = sorted
        .filter(i => group.has(i.id))
        .some(i => {
          const iStart = i.instanceStart.getTime();
          const iEnd = new Date(i.endTime).getTime();
          return startMs < iEnd && endMs > iStart;
        });

      if (anyOverlap) {
        group.add(inst.id);
        idToGroup.set(inst.id, g);
        merged = true;
        break;
      }
    }

    if (!merged) {
      const g = groups.length;
      groups.push(new Set([inst.id]));
      idToGroup.set(inst.id, g);
    }
  }

  // Now re-assign column + totalColumns within each group
  for (const group of groups) {
    const members = sorted.filter(i => group.has(i.id));
    const cols: string[][] = [];

    for (const inst of members) {
      const startMs = inst.instanceStart.getTime();
      const endMs = new Date(inst.endTime).getTime();
      let placed = false;

      for (let col = 0; col < cols.length; col++) {
        const lastId = cols[col][cols[col].length - 1];
        const last = members.find(m => m.id === lastId);
        if (last && new Date(last.endTime).getTime() <= startMs) {
          cols[col].push(inst.id);
          placed = true;
          break;
        }
      }

      if (!placed) cols.push([inst.id]);
    }

    const total = cols.length;
    cols.forEach((col, colIdx) => {
      col.forEach(id => result.set(id, { column: colIdx, totalColumns: total }));
    });
  }

  return result;
}

// ── Event Block ───────────────────────────────────────────────────────────────

interface EventBlockProps {
  instance: EventInstance;
  layout: LayoutInfo;
  onClick: (event: PlannerEvent, e: React.MouseEvent) => void;
}

function EventBlock({ instance, layout, onClick }: EventBlockProps) {
  const startMinutes = getHours(instance.instanceStart) * 60 + getMinutes(instance.instanceStart);
  const endDate = new Date(instance.endTime);
  const durationMinutes = Math.max(differenceInMinutes(endDate, instance.instanceStart), 15);

  const top = startMinutes; // 1px per minute
  const height = durationMinutes;

  const { column, totalColumns } = layout;
  const widthPct = 100 / totalColumns;
  const leftPct = column * widthPct;

  const colors = EVENT_COLORS[instance.color];
  const isShort = height < 40;

  return (
    <div
      className="cal-event"
      role="button"
      tabIndex={0}
      aria-label={`Event: ${instance.title} at ${format(instance.instanceStart, 'h:mm a')}`}
      style={{
        top,
        height: Math.max(height, 22),
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        backgroundColor: `${colors.bg}cc`,
        borderLeftColor: colors.border,
        color: colors.text,
      }}
      onClick={e => onClick(instance, e)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(instance, e as unknown as React.MouseEvent); } }}
    >
      {/* Using textContent-equivalent (React JSX) — no dangerouslySetInnerHTML */}
      <div className="cal-event-title">{instance.title}</div>
      {!isShort && (
        <div className="cal-event-time">
          {format(instance.instanceStart, 'h:mm')}–{format(endDate, 'h:mm a')}
          {instance.isRecurringInstance && (
            <span className="cal-event-recur-icon" aria-label="Recurring event"> ↻</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Day Column ────────────────────────────────────────────────────────────────

interface DayColumnProps {
  day: Date;
  instances: EventInstance[];
  onCellClick: (hour: number) => void;
  onEventClick: (event: PlannerEvent, e: React.MouseEvent) => void;
  nowMinutes: number | null;
}

function DayColumn({ day, instances, onCellClick, onEventClick, nowMinutes }: DayColumnProps) {
  const isCurrentDay = isToday(day);
  const layout = useMemo(() => computeOverlapLayout(instances), [instances]);

  return (
    <div className="cal-day-col" aria-label={format(day, 'EEEE, MMMM d')}>
      {HOURS.map(hour => (
        <div
          key={hour}
          className="cal-hour-cell"
          role="gridcell"
          aria-label={`${format(day, 'MMM d')} ${String(hour).padStart(2, '0')}:00`}
          onClick={() => onCellClick(hour)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCellClick(hour); }
          }}
          tabIndex={0}
          style={{ position: 'relative' }}
        />
      ))}

      {/* Current time line */}
      {isCurrentDay && nowMinutes !== null && (
        <div
          className="cal-now-line"
          aria-hidden="true"
          style={{ top: nowMinutes }}
        />
      )}

      {/* Event blocks (positioned absolutely over the hour cells) */}
      {instances.map(inst => {
        const info = layout.get(inst.id) ?? { column: 0, totalColumns: 1 };
        return (
          <EventBlock
            key={inst.id}
            instance={inst}
            layout={info}
            onClick={onEventClick}
          />
        );
      })}
    </div>
  );
}

// ── Weekly Calendar ───────────────────────────────────────────────────────────

interface ModalState {
  isOpen: boolean;
  event: PlannerEvent | null;
  defaultDate?: Date;
  defaultHour?: number;
}

export default function WeeklyCalendar() {
  const { events, addEvent, updateEvent, deleteEvent, isLoading } = usePlanner();

  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday start
  );

  const [modal, setModal] = useState<ModalState>({ isOpen: false, event: null });
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  // Update current time indicator every minute
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setNowMinutes(getHours(now) * 60 + getMinutes(now));
    };
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to current time (or 8am) on mount
  useEffect(() => {
    if (!gridScrollRef.current) return;
    const now = new Date();
    const target = isToday(weekStart) || isSameDay(now, addDays(weekStart, 6))
      ? getHours(now) * HOUR_HEIGHT - 100
      : 8 * HOUR_HEIGHT - 40;
    gridScrollRef.current.scrollTop = Math.max(target, 0);
  }, [weekStart]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const expandedInstances = useMemo(
    () => expandEventsForWeek(events, weekStart),
    [events, weekStart]
  );

  // Group instances by day index
  const instancesByDay = useMemo(() => {
    return weekDays.map(day =>
      expandedInstances.filter(inst => isSameDay(inst.instanceStart, day))
    );
  }, [expandedInstances, weekDays]);

  const goToPrevWeek = useCallback(() => setWeekStart(d => addDays(d, -7)), []);
  const goToNextWeek = useCallback(() => setWeekStart(d => addDays(d, 7)), []);
  const goToToday = useCallback(() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 })), []);

  const openCreateModal = useCallback((day: Date, hour: number) => {
    setModal({ isOpen: true, event: null, defaultDate: day, defaultHour: hour });
  }, []);

  const openEditModal = useCallback((event: PlannerEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setModal({ isOpen: true, event });
  }, []);

  const closeModal = useCallback(() => setModal({ isOpen: false, event: null }), []);

  const handleSave = useCallback(
    (data: Omit<PlannerEvent, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (modal.event) {
        updateEvent(modal.event.id, data);
      } else {
        addEvent(data);
      }
    },
    [modal.event, addEvent, updateEvent]
  );

  const handleDelete = useCallback(
    (id: string) => { deleteEvent(id); },
    [deleteEvent]
  );

  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`;

  return (
    <>
      <div className="calendar-wrap">
        {/* Toolbar */}
        <div className="cal-toolbar" role="toolbar" aria-label="Calendar navigation">
          <button
            id="btn-prev-week"
            className="btn btn-ghost btn-icon"
            onClick={goToPrevWeek}
            aria-label="Previous week"
          >
            ‹
          </button>

          <button
            id="btn-next-week"
            className="btn btn-ghost btn-icon"
            onClick={goToNextWeek}
            aria-label="Next week"
          >
            ›
          </button>

          <span className="cal-week-label" aria-live="polite">{weekLabel}</span>

          <div className="cal-toolbar-spacer" />

          <button
            id="btn-today"
            className="btn btn-ghost"
            onClick={goToToday}
            aria-label="Go to current week"
            style={{ fontSize: 12 }}
          >
            Today
          </button>

          <button
            id="btn-new-event"
            className="btn btn-primary"
            onClick={() => openCreateModal(new Date(), new Date().getHours())}
            aria-label="Create new event"
            style={{ fontSize: 12 }}
          >
            + New Event
          </button>
        </div>

        {/* Day headers */}
        <div className="cal-day-headers" role="row">
          <div style={{ borderBottom: '1px solid var(--border)' }} aria-hidden="true" />
          {weekDays.map((day, i) => (
            <div
              key={day.toISOString()}
              className={`cal-day-header${isToday(day) ? ' today' : ''}`}
              role="columnheader"
              aria-label={format(day, 'EEEE, MMMM d')}
            >
              <div className="cal-day-name">{DAY_NAMES[i]}</div>
              <div className="cal-day-num">{format(day, 'd')}</div>
            </div>
          ))}
        </div>

        {/* Scrollable grid */}
        <div className="cal-grid-scroll" ref={gridScrollRef} role="presentation">
          <div
            className="cal-grid"
            style={{ height: `${24 * HOUR_HEIGHT}px` }}
            role="grid"
            aria-label="Weekly calendar grid"
          >
            {/* Time column */}
            <div className="cal-time-col" aria-hidden="true">
              {HOURS.map(h => (
                <div key={h} className="cal-time-label">
                  {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day, i) => (
              <DayColumn
                key={day.toISOString()}
                day={day}
                instances={instancesByDay[i] ?? []}
                onCellClick={hour => openCreateModal(day, hour)}
                onEventClick={openEditModal}
                nowMinutes={isToday(day) ? nowMinutes : null}
              />
            ))}
          </div>
        </div>

        {/* Empty state (no events yet) */}
        {!isLoading && events.length === 0 && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '55%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none',
              zIndex: 1,
            }}
            aria-live="polite"
          >
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }} aria-hidden="true">📅</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Click any time slot to create your first event
            </p>
          </div>
        )}
      </div>

      {/* Event Modal */}
      {modal.isOpen && (
        <EventModal
          event={modal.event}
          defaultDate={modal.defaultDate}
          defaultHour={modal.defaultHour}
          onSave={handleSave}
          onDelete={modal.event ? handleDelete : undefined}
          onClose={closeModal}
        />
      )}
    </>
  );
}
