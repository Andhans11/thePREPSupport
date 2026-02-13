import { useState } from 'react';
import { Calendar, Plus } from 'lucide-react';

const DAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8–17

export function PlanningPage() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  });

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const prevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(d);
  };
  const nextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(d);
  };
  const today = new Date();
  const goToToday = () => {
    const d = new Date(today);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    setCurrentWeekStart(new Date(d.setDate(diff)));
  };

  return (
    <div className="p-6 flex flex-col h-full max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="w-6 h-6 text-[var(--hiver-accent)]" />
          <h1 className="text-2xl font-semibold text-[var(--hiver-text)]">Kapasitetsplanlegging</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevWeek}
            className="px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
          >
            ← Forrige
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
          >
            I dag
          </button>
          <button
            type="button"
            onClick={nextWeek}
            className="px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
          >
            Neste →
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
          >
            <Plus className="w-4 h-4" />
            Legg til time
          </button>
        </div>
      </div>
      <p className="text-sm text-[var(--hiver-text-muted)] mb-4">
        Planlegg supporttimer og kapasitet. Åpningstider kan konfigureres under Innstillinger.
      </p>

      <div className="card-panel flex-1 overflow-auto min-h-[400px]">
        <div className="grid grid-cols-8 border-b border-[var(--hiver-border)] sticky top-0 bg-[var(--hiver-panel-bg)] z-10">
          <div className="p-2 text-xs font-semibold text-[var(--hiver-text-muted)]" />
          {weekDates.map((d) => (
            <div
              key={d.toISOString()}
              className={`p-2 text-center text-sm font-medium ${
                d.toDateString() === today.toDateString()
                  ? 'text-[var(--hiver-accent)] bg-[var(--hiver-accent-light)]'
                  : 'text-[var(--hiver-text)]'
              }`}
            >
              {DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]}
              <br />
              <span className="text-xs">{d.getDate()}</span>
            </div>
          ))}
        </div>
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="grid grid-cols-8 border-b border-[var(--hiver-border)] min-h-[48px]"
          >
            <div className="p-2 text-xs text-[var(--hiver-text-muted)] border-r border-[var(--hiver-border)]">
              {hour}:00
            </div>
            {weekDates.map((d) => (
              <div
                key={d.toISOString()}
                className="p-1 border-r border-[var(--hiver-border)] last:border-r-0 hover:bg-[var(--hiver-bg)]/50"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
