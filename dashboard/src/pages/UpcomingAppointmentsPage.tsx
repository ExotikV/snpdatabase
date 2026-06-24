import { useCallback, useEffect, useMemo, useState } from "react";
import {
  APPOINTMENTS_REFRESH_MS,
  UpcomingAppointmentRow,
  UpcomingAppointmentsResponse,
  fetchUpcomingAppointments,
} from "../lib/api";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-CA", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCad(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

function formatDuration(minutes: number | null) {
  if (minutes == null || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

function daysUntilClass(daysUntil: number | null) {
  if (daysUntil == null) return "badge";
  if (daysUntil <= 3) return "badge badge-pending";
  return "badge";
}

function AppointmentsTable({ rows }: { rows: UpcomingAppointmentRow[] }) {
  if (rows.length === 0) {
    return <p className="muted">No upcoming appointments in the next 90 days.</p>;
  }

  return (
    <div className="panel-table">
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Client</th>
            <th>Address</th>
            <th>Service</th>
            <th>Price</th>
            <th>Source</th>
            <th>Status</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.squareBookingId}>
              <td>
                <div>{formatDate(row.startAt)}</div>
                <span className={daysUntilClass(row.daysUntil)} style={{ marginTop: "0.25rem" }}>
                  {row.daysUntilLabel}
                </span>
                {row.durationMinutes != null && (
                  <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                    {formatDuration(row.durationMinutes)}
                  </div>
                )}
              </td>
              <td>
                <div>{row.clientName ?? "Unknown client"}</div>
                {row.phone && (
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {row.phone}
                  </div>
                )}
                {row.email && (
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {row.email}
                  </div>
                )}
              </td>
              <td style={{ maxWidth: "240px", fontSize: "0.9rem" }}>
                {row.address ?? row.city ?? "—"}
              </td>
              <td>{row.serviceType ?? "—"}</td>
              <td>
                <div>{formatCad(row.priceCents)}</div>
                {row.priceSource === "website" && (
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    Website booking
                  </div>
                )}
                {row.priceSource === "catalog" && (
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    Square catalog
                  </div>
                )}
              </td>
              <td>{row.bookingSourceLabel ?? "—"}</td>
              <td>
                <span className="badge badge-pending">{row.statusLabel}</span>
              </td>
              <td style={{ maxWidth: "220px" }}>
                {row.customerNote && (
                  <div style={{ fontSize: "0.85rem" }}>
                    <strong>Client:</strong> {row.customerNote}
                  </div>
                )}
                {row.sellerNote && (
                  <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                    <strong>Internal:</strong> {row.sellerNote}
                  </div>
                )}
                {!row.customerNote && !row.sellerNote && "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function UpcomingAppointmentsPage() {
  const [data, setData] = useState<UpcomingAppointmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [daysFilter, setDaysFilter] = useState<"all" | "7" | "30">("all");

  const load = useCallback(async (sync = false) => {
    setError(null);
    if (sync) setSyncing(true);
    try {
      const response = await fetchUpcomingAppointments(sync);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load upcoming appointments");
    } finally {
      setLoading(false);
      if (sync) setSyncing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(() => load(), APPOINTMENTS_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (daysFilter === "all") return data.appointments;
    const maxDays = Number(daysFilter);
    return data.appointments.filter((row) => row.daysUntil != null && row.daysUntil <= maxDays);
  }, [data, daysFilter]);

  if (loading) {
    return <div className="loading">Loading upcoming appointments…</div>;
  }

  if (!data) {
    return <div className="error-banner">Could not load upcoming appointments.</div>;
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Upcoming appointments</h2>
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              Cached from Square. Last synced {formatDate(data.syncedAt)}. Server auto-sync runs every
              15 minutes.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={syncing}
            onClick={() => load(true)}
          >
            {syncing ? "Syncing…" : "Sync from Square"}
          </button>
        </div>

        <div className="card-grid">
          <div className="card">
            <div className="card-label">Total upcoming</div>
            <div className="card-value">{data.summary.total}</div>
            <div className="muted">Next {data.lookaheadDays} days</div>
          </div>
          <div className="card">
            <div className="card-label">This week</div>
            <div className="card-value">{data.summary.thisWeek}</div>
            <div className="muted">
              {data.summary.today} today · {data.summary.tomorrow} tomorrow
            </div>
          </div>
          <div className="card">
            <div className="card-label">Expected revenue</div>
            <div className="card-value">{formatCad(data.summary.totalPriceCents)}</div>
            <div className="muted">
              {data.summary.pricedCount} of {data.summary.total} with a known price
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="inline-actions" style={{ marginBottom: "1rem" }}>
          <div className="tab-row" style={{ marginBottom: 0, flex: 1 }}>
            <button
              type="button"
              className={daysFilter === "all" ? "btn" : "btn btn-secondary"}
              onClick={() => setDaysFilter("all")}
            >
              All ({data.appointments.length})
            </button>
            <button
              type="button"
              className={daysFilter === "7" ? "btn" : "btn btn-secondary"}
              onClick={() => setDaysFilter("7")}
            >
              Next 7 days
            </button>
            <button
              type="button"
              className={daysFilter === "30" ? "btn" : "btn btn-secondary"}
              onClick={() => setDaysFilter("30")}
            >
              Next 30 days
            </button>
          </div>
        </div>

        <AppointmentsTable rows={filteredRows} />
      </div>
    </>
  );
}
