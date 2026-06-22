import { useCallback, useEffect, useState } from "react";
import { EligibleClient, REFRESH_MS, fetchEligible, sendReminder } from "../lib/api";

export default function SendNowPage() {
  const [eligible, setEligible] = useState<EligibleClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchEligible();
      setEligible(data.eligible);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load eligible clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  async function handleSend(clientId: string) {
    setSendingId(clientId);
    setNotice(null);
    setError(null);
    try {
      const result = await sendReminder(clientId);
      if (result.ok) {
        setNotice(`Reminder sent to ${result.result?.name ?? "client"}.`);
        await load();
      } else {
        setError(result.result?.reason ?? "Send failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSendingId(null);
    }
  }

  async function handleSendAll() {
    if (!window.confirm(`Send reminders to all ${eligible.length} eligible client(s)?`)) {
      return;
    }
    setSendingAll(true);
    setNotice(null);
    setError(null);
    try {
      const result = await sendReminder();
      setNotice(`Sent ${result.sentCount ?? 0}, failed ${result.failedCount ?? 0}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk send failed");
    } finally {
      setSendingAll(false);
    }
  }

  if (loading) {
    return <div className="loading">Loading eligible clients…</div>;
  }

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Clients enrolled in the maintenance program who have reached the next scheduled reminder
        day. The scheduled function also sends these automatically every hour.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="panel" style={{ background: "#ecfdf3" }}>{notice}</div>}

      <div className="panel">
        <div className="inline-actions" style={{ marginBottom: "1rem" }}>
          <button
            type="button"
            className="btn"
            disabled={eligible.length === 0 || sendingAll}
            onClick={handleSendAll}
          >
            {sendingAll ? "Sending…" : `Send all eligible (${eligible.length})`}
          </button>
        </div>

        {eligible.length === 0 ? (
          <p className="muted">No clients are due for a reminder right now.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Phone</th>
                <th>Days since last detail</th>
                <th>Step</th>
                <th>Last service</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {eligible.map((client) => (
                <tr key={client.clientId}>
                  <td>{client.name}</td>
                  <td>{client.phone ?? "—"}</td>
                  <td>{client.daysSince}</td>
                  <td>#{client.sequenceNumber}</td>
                  <td>
                    {client.lastServiceType ?? "—"}
                    <div className="muted">{client.lastDetailDate}</div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      disabled={sendingId === client.clientId || sendingAll}
                      onClick={() => handleSend(client.clientId)}
                    >
                      {sendingId === client.clientId ? "Sending…" : "Send now"}
                    </button>
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
