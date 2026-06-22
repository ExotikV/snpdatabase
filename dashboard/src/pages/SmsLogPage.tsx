import { useCallback, useEffect, useState } from "react";
import { REFRESH_MS, SmsLogRow, fetchSmsLog } from "../lib/api";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function SmsLogPage() {
  const [rows, setRows] = useState<SmsLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchSmsLog();
      setRows(data.smsLog);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SMS log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  if (loading) {
    return <div className="loading">Loading SMS log…</div>;
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <h2>SMS log</h2>
        {rows.length === 0 ? (
          <p className="muted">No SMS sent yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Phone</th>
                <th>Step</th>
                <th>Status</th>
                <th>Sent at</th>
                <th>Converted</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.clientName ?? "—"}</td>
                  <td>{row.phone ?? "—"}</td>
                  <td>{row.sequenceNumber ?? "—"}</td>
                  <td>
                    <span className={`badge badge-${row.status}`}>{row.status}</span>
                  </td>
                  <td>{formatDate(row.sentAt)}</td>
                  <td>
                    {row.converted ? (
                      <span className="badge badge-converted">yes</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="muted">{row.errorMessage ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
