import { useCallback, useEffect, useMemo, useState } from "react";
import { BookingRevenueDashboardResponse, fetchBookingRevenue } from "../lib/api";

type PeriodId =
  | "today"
  | "this_week"
  | "last_week"
  | "last_30_days"
  | "this_month"
  | "all"
  | `month_${number}`;

const QUICK_PERIODS: { id: PeriodId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "last_30_days", label: "Last 30 days" },
  { id: "this_month", label: "This month" },
  { id: "all", label: "All time" },
];

function formatCad(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

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

function revenueStatusLabel(status: string | null) {
  if (status === "realized") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "booked") return "Booked (pending)";
  return status ?? "—";
}

export default function RevenuePage() {
  const [data, setData] = useState<BookingRevenueDashboardResponse | null>(null);
  const [period, setPeriod] = useState<PeriodId>("this_month");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetchBookingRevenue(period, year);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load revenue");
    } finally {
      setLoading(false);
    }
  }, [period, year]);

  useEffect(() => {
    load();
  }, [load]);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1];
  }, []);

  if (loading && !data) {
    return <div className="loading">Loading revenue…</div>;
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      {data?.migrationRequired && (
        <div
          className="error-banner"
          style={{ background: "#fff8e6", color: "#7a5c00", borderColor: "#fde68a" }}
        >
          Run <code>schema/booking_attempts_revenue.sql</code> in Supabase to enable booked vs
          attributed revenue on booking rows.
        </div>
      )}

      {data?.stats.squareUnavailable && (
        <div
          className="error-banner"
          style={{ background: "#fff8e6", color: "#7a5c00", borderColor: "#fde68a" }}
        >
          Square order totals could not be loaded — showing attributed booking revenue instead.
          Check Square API credentials and redeploy.
        </div>
      )}

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>Revenue</h2>
          <p className="muted" style={{ margin: "0.35rem 0 0" }}>
            <strong>Actual revenue</strong> is the total from completed Square orders in the
            selected period (by payment date). <strong>Booked revenue</strong> is checkout totals
            from tracked website, SMS, and QR bookings.
          </p>
        </div>

        <div className="card-grid">
          <div className="card">
            <div className="card-label">{data?.periodLabel ?? "Booked revenue"}</div>
            <div className="card-value">{formatCad(data?.stats.bookedCents ?? 0)}</div>
            <div className="muted">{data?.stats.bookingCount ?? 0} bookings</div>
          </div>
          <div className="card">
            <div className="card-label">Actual revenue (Square)</div>
            <div className="card-value">{formatCad(data?.stats.actualCents ?? 0)}</div>
            <div className="muted">
              {data?.stats.squareUnavailable
                ? "Square unavailable — attributed totals shown"
                : `${data?.stats.squareOrderCount ?? 0} completed Square order${
                    (data?.stats.squareOrderCount ?? 0) === 1 ? "" : "s"
                  } in ${data?.periodLabel?.toLowerCase() ?? "period"}`}
            </div>
          </div>
          <div className="card">
            <div className="card-label">Pending booked</div>
            <div className="card-value">{formatCad(data?.stats.pendingBookedCents ?? 0)}</div>
            <div className="muted">Future appointments not yet completed</div>
          </div>
          <div className="card">
            <div className="card-label">Clients booked</div>
            <div className="card-value">{data?.stats.uniqueClients ?? 0}</div>
            <div className="muted">Unique phone numbers</div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h3 className="section-title">Filter</h3>
        <div className="tab-row">
          {QUICK_PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={period === item.id ? "btn" : "btn btn-secondary"}
              onClick={() => setPeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="inline-actions" style={{ marginTop: "1rem" }}>
          <label>
            Year{" "}
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h3 className="section-title">{year} by month</h3>
        <p className="muted section-intro">
          Click a month to filter the booking list below. Each total matches completed Square orders
          for that month (same as Actual revenue above).
        </p>
        <div className="card-grid">
          {(data?.monthlyBreakdown ?? []).map((bucket) => {
            const monthPeriod = `month_${bucket.month}` as PeriodId;
            const active = period === monthPeriod;
            return (
              <button
                key={bucket.month}
                type="button"
                className="card"
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  borderColor: active ? "#2563eb" : undefined,
                }}
                onClick={() => setPeriod(monthPeriod)}
              >
                <div className="card-label">{bucket.label}</div>
                <div className="card-value">{formatCad(bucket.actualCents)}</div>
                <div className="muted">
                  {bucket.squareOrderCount != null
                    ? `${bucket.squareOrderCount} Square order${
                        bucket.squareOrderCount === 1 ? "" : "s"
                      }`
                    : "Square revenue"}
                  {bucket.bookingCount > 0
                    ? ` · ${bucket.bookingCount} tracked booking${
                        bucket.bookingCount === 1 ? "" : "s"
                      }`
                    : ""}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h3 className="section-title">Bookings — {data?.periodLabel ?? "Revenue"}</h3>
        {!data?.bookings.length ? (
          <p className="muted">No tracked bookings for this period.</p>
        ) : (
          <div className="panel-table">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>SMS track</th>
                  <th>Phone</th>
                  <th>Booked at</th>
                  <th>Booked $</th>
                  <th>Actual $</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.bookings.map((row) => (
                  <tr key={row.id}>
                    <td>{row.sourceLabel}</td>
                    <td>{row.linkedSms?.trackLabel ?? "—"}</td>
                    <td>{row.phone ?? "—"}</td>
                    <td>{formatDate(row.bookedAt)}</td>
                    <td>{formatCad(row.bookedRevenueCents)}</td>
                    <td>{formatCad(row.actualRevenueCents)}</td>
                    <td>
                      <span
                        className={`badge ${
                          row.revenueStatus === "realized"
                            ? "badge-converted"
                            : row.revenueStatus === "cancelled"
                              ? "badge-failed"
                              : "badge-pending"
                        }`}
                      >
                        {revenueStatusLabel(row.revenueStatus)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
