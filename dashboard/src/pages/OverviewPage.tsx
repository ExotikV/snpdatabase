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

      {stats && (
        <>
          <div className="card-grid">
            <div className="card">
              <div className="card-label">Total bookings tracked</div>
              <div className="card-value">{stats.totalBookings}</div>
            </div>
            <div className="card">
              <div className="card-label">SMS sent</div>
              <div className="card-value">{stats.sms.sent}</div>
            </div>
            <div className="card">
              <div className="card-label">SMS conversions</div>
              <div className="card-value">{stats.sms.converted}</div>
            </div>
            <div className="card">
              <div className="card-label">SMS conversion rate</div>
              <div className="card-value">{stats.sms.conversionRate}%</div>
            </div>
          </div>

          <div className="card-grid">
            {stats.bySource.map((row) => (
              <div className="card" key={row.source}>
                <div className="card-label">{row.label}</div>
                <div className="card-value">{row.count}</div>
                <div className="muted">{row.percentage}% of bookings</div>
              </div>
            ))}
          </div>

          <div className="panel">
            <h2>Bookings by source over time</h2>
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
                    <Bar dataKey="sms_reminder" stackId="a" fill="#2563eb" name="SMS reminder" />
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
                <th>Phone</th>
                <th>Booked at</th>
                <th>Reminder link</th>
                <th>Converted</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((row) => (
                <tr key={row.id}>
                  <td>{row.sourceLabel}</td>
                  <td>{row.phone ?? "—"}</td>
                  <td>{formatDate(row.bookedAt)}</td>
                  <td>
                    {row.linkedSms ? (
                      <span className={`badge badge-${row.linkedSms.status}`}>
                        {row.linkedSms.status}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {row.linkedSms?.converted ? (
                      <span className="badge badge-converted">yes</span>
                    ) : (
                      "—"
                    )}
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
