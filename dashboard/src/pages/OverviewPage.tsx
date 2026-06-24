import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  REFRESH_MS,
  StatsResponse,
  WeeklyOverviewResponse,
  fetchStats,
  fetchWeeklyOverview,
} from "../lib/api";

function formatCad(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

function formatTrackingDate(ymd: string) {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type PerformanceTab = "sms" | "qr";

export default function OverviewPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [weekly, setWeekly] = useState<WeeklyOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [performanceTab, setPerformanceTab] = useState<PerformanceTab>("sms");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [statsData, weeklyData] = await Promise.all([fetchStats(), fetchWeeklyOverview()]);
      setStats(statsData);
      setWeekly(weeklyData);
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

      {weekly?.revenueMigrationRequired && (
        <div
          className="error-banner"
          style={{ background: "#fff8e6", color: "#7a5c00", borderColor: "#fde68a" }}
        >
          Run <code>schema/booking_attempts_revenue.sql</code> in Supabase to enable revenue on the
          weekly overview and Revenue tab.
        </div>
      )}

      {weekly && (
        <>
          <h2 className="section-title">This week</h2>
          <p className="muted section-intro">
            {weekly.weekLabel}. Sunday–Saturday (Eastern).{" "}
            <Link to="/revenue">Full revenue history</Link> · <Link to="/expenses">Expenses</Link>
          </p>
          <div className="card-grid">
            <div className="card">
              <div className="card-label">Revenue</div>
              <div className="card-value">{formatCad(weekly.stats.actualRevenueCents)}</div>
              <div className="muted">
                {weekly.stats.completedAppointmentsCount} completed appointment
                {weekly.stats.completedAppointmentsCount === 1 ? "" : "s"} so far
              </div>
            </div>
            <div className="card">
              <div className="card-label">Still to do</div>
              <div className="card-value">{formatCad(weekly.stats.remainingRevenueCents)}</div>
              <div className="muted">
                {weekly.stats.appointmentsRemainingCount} upcoming appointment
                {weekly.stats.appointmentsRemainingCount === 1 ? "" : "s"} left this week
              </div>
            </div>
            <div className="card">
              <div className="card-label">New bookings</div>
              <div className="card-value">{weekly.stats.bookingsCount}</div>
              <div className="muted">
                Booked this week (site + Square)
                {weekly.stats.clientsBookedCount > 0
                  ? ` · ${weekly.stats.clientsBookedCount} client${weekly.stats.clientsBookedCount === 1 ? "" : "s"}`
                  : ""}
              </div>
            </div>
            <div className="card">
              <div className="card-label">New revenue booked</div>
              <div className="card-value">{formatCad(weekly.stats.bookedRevenueCents)}</div>
              <div className="muted">From new bookings this week</div>
            </div>
            <div className="card">
              <div className="card-label">Expenses</div>
              <div className="card-value">{formatCad(weekly.stats.expensesCents)}</div>
              <div className="muted">{weekly.stats.expenseCount} logged</div>
            </div>
            <div className="card">
              <div className="card-label">Net</div>
              <div className="card-value">{formatCad(weekly.stats.netAfterExpensesCents)}</div>
              <div className="muted">Revenue minus expenses</div>
            </div>
          </div>
        </>
      )}

      {stats && (
        <>
          {stats.smsSubscribers && (
            <>
              <h2 className="section-title">SMS subscribers</h2>
              <p className="muted section-intro">
                Clients who texted <strong>STOP</strong> are marked unsubscribed automatically.{" "}
                <Link to="/sms-subscribers">View full list</Link>
              </p>
              <div className="card-grid">
                <div className="card">
                  <div className="card-label">Receiving SMS</div>
                  <div className="card-value">{stats.smsSubscribers.receiving}</div>
                </div>
                <div className="card">
                  <div className="card-label">Unsubscribed (STOP)</div>
                  <div className="card-value">{stats.smsSubscribers.unsubscribedStop}</div>
                </div>
                <div className="card">
                  <div className="card-label">Excluded manually</div>
                  <div className="card-value">{stats.smsSubscribers.excludedManual}</div>
                </div>
                <div className="card">
                  <div className="card-label">Total clients</div>
                  <div className="card-value">{stats.smsSubscribers.total}</div>
                </div>
              </div>
            </>
          )}

          <h2 className="section-title">SMS &amp; QR performance</h2>
          <div className="tab-row">
            <button
              type="button"
              className={performanceTab === "sms" ? "btn" : "btn btn-secondary"}
              onClick={() => setPerformanceTab("sms")}
            >
              SMS
            </button>
            <button
              type="button"
              className={performanceTab === "qr" ? "btn" : "btn btn-secondary"}
              onClick={() => setPerformanceTab("qr")}
            >
              QR codes
            </button>
          </div>

          {performanceTab === "sms" ? (
            <>
              <p className="muted section-intro">
                Conversion rate = website bookings from that SMS track ÷ SMS sent. Includes
                automated reminders and <strong>bulk manual</strong> sends. Bookings are counted at
                checkout.
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
                        <strong>{stats.sms.converted}</strong>
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
            </>
          ) : (
            <>
              <p className="muted section-intro">
                Conversion rate = QR bookings ÷ completed Square details (one card handed out per
                detail). Tracking since{" "}
                <strong>{formatTrackingDate(stats.qr.trackingStartDate)}</strong>. Clients in your
                maintenance service area get a maintenance card; everyone else gets a general card.
              </p>
              <div className="panel">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Card type</th>
                      <th>Cards handed out</th>
                      <th>Bookings</th>
                      <th>Conv. rate</th>
                      <th>Booked revenue</th>
                      <th>Actual revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.qr.byTrack.map((row) => (
                      <tr key={row.source}>
                        <td>{row.label}</td>
                        <td>{row.cardsHandedOut}</td>
                        <td>{row.bookings}</td>
                        <td>{row.conversionRate == null ? "—" : `${row.conversionRate}%`}</td>
                        <td>{formatCad(row.bookedCents)}</td>
                        <td>{formatCad(row.actualCents)}</td>
                      </tr>
                    ))}
                    <tr className="stats-table-total">
                      <td>
                        <strong>All QR</strong>
                      </td>
                      <td>
                        <strong>{stats.qr.cardsHandedOut}</strong>
                      </td>
                      <td>
                        <strong>{stats.qr.bookings}</strong>
                      </td>
                      <td>
                        <strong>
                          {stats.qr.conversionRate == null ? "—" : `${stats.qr.conversionRate}%`}
                        </strong>
                      </td>
                      <td>
                        <strong>
                          {formatCad(
                            stats.qr.byTrack.reduce((sum, row) => sum + row.bookedCents, 0),
                          )}
                        </strong>
                      </td>
                      <td>
                        <strong>
                          {formatCad(
                            stats.qr.byTrack.reduce((sum, row) => sum + row.actualCents, 0),
                          )}
                        </strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

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
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
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
                    <Bar
                      dataKey="qr_maintenance"
                      stackId="a"
                      fill="#15803d"
                      name="QR — Maintenance"
                    />
                    <Bar dataKey="qr_general" stackId="a" fill="#4ade80" name="QR — General" />
                    <Bar dataKey="other" stackId="a" fill="#d97706" name="Other" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
