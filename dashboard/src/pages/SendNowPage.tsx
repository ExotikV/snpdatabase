import { useCallback, useEffect, useState } from "react";
import {
  EligibleClient,
  REFRESH_MS,
  fetchEligible,
  sendReminder,
} from "../lib/api";

function EligibleTable({
  title,
  rows,
  sendingId,
  sendingAll,
  onSend,
}: {
  title: string;
  rows: EligibleClient[];
  sendingId: string | null;
  sendingAll: boolean;
  onSend: (clientId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="panel">
        <h2>{title}</h2>
        <p className="muted">No clients due on this track right now.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th>City</th>
            <th>Phone</th>
            <th>Days since</th>
            <th>Step</th>
            <th>Last service</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((client) => (
            <tr key={client.clientId}>
              <td>{client.name}</td>
              <td>{client.city ?? "—"}</td>
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
                  onClick={() => onSend(client.clientId)}
                >
                  {sendingId === client.clientId ? "Sending…" : "Send now"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SendNowPage() {
  const [maintenance, setMaintenance] = useState<EligibleClient[]>([]);
  const [general, setGeneral] = useState<EligibleClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchEligible();
      setMaintenance(data.maintenance);
      setGeneral(data.general);
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
    const total = maintenance.length + general.length;
    if (!window.confirm(`Send all ${total} due reminder(s)?`)) return;
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

  const totalDue = maintenance.length + general.length;

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        <strong>Maintenance</strong> reminders are limited to your service-area cities (detail
        within 60 days). <strong>General</strong> regular-detail reminders go to all other
        clients — any city, no location restriction.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="panel" style={{ background: "#ecfdf3" }}>{notice}</div>}

      <div className="inline-actions" style={{ marginBottom: "1rem" }}>
        <button
          type="button"
          className="btn"
          disabled={totalDue === 0 || sendingAll}
          onClick={handleSendAll}
        >
          {sendingAll ? "Sending…" : `Send all due (${totalDue})`}
        </button>
      </div>

      <EligibleTable
        title={`Maintenance track (${maintenance.length})`}
        rows={maintenance}
        sendingId={sendingId}
        sendingAll={sendingAll}
        onSend={handleSend}
      />

      <EligibleTable
        title={`General track (${general.length})`}
        rows={general}
        sendingId={sendingId}
        sendingAll={sendingAll}
        onSend={handleSend}
      />
    </>
  );
}
