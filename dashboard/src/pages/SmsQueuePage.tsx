import { useCallback, useEffect, useMemo, useState } from "react";
import {
  REFRESH_MS,
  ScheduleTrack,
  SmsQueuePreview,
  SmsQueueRow,
  fetchSmsQueue,
} from "../lib/api";

type TabId = "due" | "upcoming" | "blocked";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function TrackFilter({
  value,
  onChange,
}: {
  value: ScheduleTrack | "all";
  onChange: (value: ScheduleTrack | "all") => void;
}) {
  return (
    <label>
      Track{" "}
      <select value={value} onChange={(e) => onChange(e.target.value as ScheduleTrack | "all")}>
        <option value="all">All tracks</option>
        <option value="maintenance">Maintenance</option>
        <option value="general">General</option>
        <option value="general_after_maintenance">After maintenance</option>
      </select>
    </label>
  );
}

function QueueTable({ rows }: { rows: SmsQueueRow[] }) {
  if (rows.length === 0) {
    return <p className="muted">No clients in this category.</p>;
  }

  return (
    <div className="panel-table">
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th>Track</th>
            <th>Step</th>
            <th>Days since detail</th>
            <th>Schedule day</th>
            <th>When</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.clientId}-${row.track}-${row.sequenceNumber}`}>
              <td>
                <div>{row.name}</div>
                <div className="muted" style={{ fontSize: "0.85rem" }}>{row.phone ?? "—"}</div>
                {row.city && <div className="muted" style={{ fontSize: "0.85rem" }}>{row.city}</div>}
              </td>
              <td>{row.trackLabel}</td>
              <td>
                {row.sequenceNumber}
                <span className="muted" style={{ fontSize: "0.85rem", display: "block" }}>
                  {row.preferredLanguage.toUpperCase()}
                </span>
              </td>
              <td>
                {row.daysSinceLastDetail}
                <span className="muted" style={{ fontSize: "0.85rem", display: "block" }}>
                  since {row.lastDetailDateFormatted}
                </span>
              </td>
              <td>
                {row.requiredDays}
                {row.status === "upcoming" && row.daysUntilSend > 0 && (
                  <span className="muted" style={{ fontSize: "0.85rem", display: "block" }}>
                    in {row.daysUntilSend}d
                  </span>
                )}
              </td>
              <td>
                <div>{row.sendTiming}</div>
                {row.blockReason && (
                  <div className="muted" style={{ fontSize: "0.85rem" }}>{row.blockReason}</div>
                )}
                {row.lastSmsSentAt && (
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    Last SMS: {formatDate(row.lastSmsSentAt)}
                  </div>
                )}
              </td>
              <td style={{ maxWidth: "280px" }}>
                <details>
                  <summary>Preview</summary>
                  <pre className="message-preview">{row.messagePreview}</pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SmsQueuePage() {
  const [preview, setPreview] = useState<SmsQueuePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("due");
  const [trackFilter, setTrackFilter] = useState<ScheduleTrack | "all">("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchSmsQueue();
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scheduled SMS");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const filtered = useMemo(() => {
    if (!preview) return { due: [], upcoming: [], blocked: [] };

    const filterTrack = (rows: SmsQueueRow[]) =>
      trackFilter === "all" ? rows : rows.filter((row) => row.track === trackFilter);

    return {
      due: filterTrack(preview.dueNow),
      upcoming: filterTrack(preview.upcoming),
      blocked: filterTrack(preview.blocked),
    };
  }, [preview, trackFilter]);

  const activeRows =
    tab === "due" ? filtered.due : tab === "upcoming" ? filtered.upcoming : filtered.blocked;

  if (loading) {
    return <div className="loading">Loading scheduled SMS…</div>;
  }

  if (!preview) {
    return <div className="error-banner">Could not load scheduled SMS.</div>;
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <h2>Scheduled SMS</h2>
        <p className="muted">
          Upcoming automated reminder texts from your sequence schedules. Refreshed{" "}
          {formatDate(preview.generatedAt)}.
        </p>

        <div className="card-grid">
          <div className="card">
            <div className="card-label">Due now</div>
            <div className="card-value">{preview.summary.dueNow}</div>
            <div className="muted">
              {preview.inSendWindow
                ? `Up to ${preview.summary.dueNowWillSendThisHour} on next hourly run`
                : `Outside ${preview.rules.sendWindow}`}
            </div>
          </div>
          <div className="card">
            <div className="card-label">Upcoming</div>
            <div className="card-value">{preview.summary.upcoming}</div>
            <div className="muted">Not at schedule day yet</div>
          </div>
          <div className="card">
            <div className="card-label">Cooldown</div>
            <div className="card-value">{preview.summary.blockedCooldown}</div>
            <div className="muted">{preview.rules.cooldownDays}-day gap after any SMS</div>
          </div>
        </div>

        <p className="muted">
          Sends run hourly, {preview.rules.sendWindow}, max {preview.rules.maxPerHour} per run.{" "}
          {preview.rules.note}
        </p>
      </div>

      <div className="panel">
        <div className="inline-actions" style={{ marginBottom: "1rem" }}>
          <div className="tab-row" style={{ marginBottom: 0, flex: 1 }}>
            <button
              type="button"
              className={tab === "due" ? "btn" : "btn btn-secondary"}
              onClick={() => setTab("due")}
            >
              Due now ({filtered.due.length})
            </button>
            <button
              type="button"
              className={tab === "upcoming" ? "btn" : "btn btn-secondary"}
              onClick={() => setTab("upcoming")}
            >
              Upcoming ({filtered.upcoming.length})
            </button>
            <button
              type="button"
              className={tab === "blocked" ? "btn" : "btn btn-secondary"}
              onClick={() => setTab("blocked")}
            >
              Cooldown ({filtered.blocked.length})
            </button>
          </div>
          <TrackFilter value={trackFilter} onChange={setTrackFilter} />
        </div>

        <QueueTable rows={activeRows} />
      </div>
    </>
  );
}
