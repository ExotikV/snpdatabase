import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BookingRow,
  REFRESH_MS,
  StatsResponse,
  fetchBookings,
  fetchStats,
} from "../lib/api";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatCad(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

function revenueStatusLabel(status: string | null) {
  if (status === "realized") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "booked") return "Booked (pending)";
  return status ?? "—";
}

export default function OverviewPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [statsData, bookingsData] = await Promise.all([fetchStats(), fetchBookings()]);
      setStats(statsData);
      setBookings(bookingsData.bookings);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  if (loading && !stats) {
    return <div className="loading">Loading dashboard…</div>;
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      {lastUpdated && (
        <p className="muted" style={{ marginTop: 0 }}>
          Last updated {lastUpdated.toLocaleString()}
        </p>
      )}

      {stats?.revenue?.migrationRequired && (
        <div
          className="error-banner"
          style={{ background: "#fff8e6", color: "#7a5c00", borderColor: "#fde68a" }}
        >
          Run <code>schema/booking_attempts_revenue.sql</code> in Supabase to enable booked vs actual
          revenue tracking.
        </div>
      )}

      {stats && (
        <>
          <h2 className="section-title">Revenue from tracked bookings</h2>
          <p className="muted section-intro">
            <strong>Booked revenue</strong> is recorded when someone completes checkout on the
            website. <strong>Actual revenue</strong> counts only after the Square detail is in the
            past and not cancelled.
          </p>
          <div className="card-grid">
            <div className="card">
              <div className="card-label">Booked revenue</div>
              <div className="card-value">{formatCad(stats.revenue.bookedCents)}</div>
            </div>
            <div className="card">
              <div className="card-label">Actual revenue</div>
              <div className="card-value">{formatCad(stats.revenue.actualCents)}</div>
            </div>
            <div className="card">
              <div className="card-label">Pending booked</div>
              <div className="card-value">{formatCad(stats.revenue.pendingBookedCents)}</div>
              <div className="muted">Future appointments not yet completed</div>
            </div>
            <div className="card">
              <div className="card-label">Total bookings tracked</div>
              <div className="card-value">{stats.totalBookings}</div>
            </div>
          </div>

          <h2 className="section-title">SMS &amp; QR performance</h2>
          <p className="muted section-intro">
            Conversion rate = bookings from that channel ÷ SMS sent (QR has no send count).
            Bookings and revenue are counted when checkout completes, not when the appointment
            happens.
          </p>
          <div className="panel">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Track</th>
                  <th>Sent</th>
                  <th>Failed</th>
                  <th>Bookings</th>
                  <th>Conv. rate</th>
                  <th>Booked revenue</th>
                  <th>Actual revenue</th>
                </tr>
              </thead>
              <tbody>
                {stats.sms.byTrack.map((row) => (
                  <tr key={row.triggerType}>
                    <td>{row.label}</td>
                    <td>{row.sent}</td>
                    <td>{row.failed}</td>
                    <td>{row.bookings}</td>
                    <td>{row.conversionRate == null ? "—" : `${row.conversionRate}%`}</td>
                    <td>{formatCad(row.bookedCents)}</td>
                    <td>{formatCad(row.actualCents)}</td>
                  </tr>
                ))}
                <tr className="stats-table-total">
                  <td>
                    <strong>All SMS</strong>
                  </td>
                    <td>
                    <strong>{stats.sms.sent}</strong>
                  </td>
                  <td>
                    <strong>{stats.sms.failed}</strong>
                  </td>
                  <td>
                    <strong>
                      {stats.sms.byTrack
                        .filter((row) => row.triggerType !== "qr_code")
                        .reduce((sum, row) => sum + row.bookings, 0)}
                    </strong>
                  </td>
                  <td>
                    <strong>{stats.sms.conversionRate}%</strong>
                  </td>
                  <td>
                    <strong>
                      {formatCad(
                        stats.sms.byTrack.reduce((sum, row) => sum + row.bookedCents, 0),
                      )}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {formatCad(
                        stats.sms.byTrack.reduce((sum, row) => sum + row.actualCents, 0),
                      )}
                    </strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="section-title">Bookings by source</h2>
          <div className="card-grid">
            {stats.bySource.map((row) => (
              <div className="card" key={row.source}>
                <div className="card-label">{row.label}</div>
                <div className="card-value">{row.count}</div>
                <div className="muted">{row.percentage}% of bookings</div>
                <div className="muted" style={{ marginTop: "0.35rem", fontSize: "0.85rem" }}>
                  Booked {formatCad(row.bookedCents)} · Actual {formatCad(row.actualCents)}
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Bookings by source over time</h2>
            {stats.trend.length === 0 ? (
              <p className="muted">No booking data yet.</p>
            ) : (
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={stats.trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="direct" stackId="a" fill="#64748b" name="Website" />
                    <Bar dataKey="sms_reminder" stackId="a" fill="#2563eb" name="Maintenance SMS" />
                    <Bar dataKey="general_reminder" stackId="a" fill="#7c3aed" name="General SMS" />
                    <Bar
                      dataKey="general_after_maintenance_reminder"
                      stackId="a"
                      fill="#db2777"
                      name="After maintenance SMS"
                    />
                    <Bar dataKey="qr_code" stackId="a" fill="#16a34a" name="QR code" />
                    <Bar dataKey="other" stackId="a" fill="#d97706" name="Other" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}

      <div className="panel">
        <h2>Recent bookings</h2>
        {bookings.length === 0 ? (
          <p className="muted">No bookings recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>SMS track</th>
                <th>Phone</th>
                <th>Booked at</th>
                <th>Booked $</th>
                <th>Actual $</th>
                <th>Revenue status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((row) => (
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
        )}
      </div>
    </>
  );
}
