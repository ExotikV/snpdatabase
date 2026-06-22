import { useCallback, useEffect, useState } from "react";
import {
  EligibleClient,
  REFRESH_MS,
  fetchEligible,
  fetchTestSmsOptions,
  sendReminder,
} from "../lib/api";

function EligibleTable({
  title,
  rows,
  sendingId,
  sendingAll,
  productionDisabled,
  onSend,
}: {
  title: string;
  rows: EligibleClient[];
  sendingId: string | null;
  sendingAll: boolean;
  productionDisabled: boolean;
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
                  disabled={
                    productionDisabled || sendingId === client.clientId || sendingAll
                  }
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
  const [generalAfterMaintenance, setGeneralAfterMaintenance] = useState<EligibleClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [productionSendsEnabled, setProductionSendsEnabled] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [eligibleData, testOptions] = await Promise.all([
        fetchEligible(),
        fetchTestSmsOptions(),
      ]);
      setMaintenance(eligibleData.maintenance);
      setGeneral(eligibleData.general);
      setGeneralAfterMaintenance(eligibleData.generalAfterMaintenance ?? []);
      setProductionSendsEnabled(testOptions.productionSendsEnabled);
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
    const total = maintenance.length + general.length + generalAfterMaintenance.length;
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

  const totalDue = maintenance.length + general.length + generalAfterMaintenance.length;

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        <strong>Maintenance</strong> reminders are limited to your service-area cities (days 30–60).{" "}
        <strong>General</strong> reminders go to clients outside the service area (from day 60).{" "}
        <strong>After maintenance miss</strong> is for service-area clients who did not book by day 60
        (from day 90). Automatic sends are capped at <strong>20 per hour</strong>, one sequence step
        per client at a time, on the <strong>exact schedule day only</strong> (not after it passes).
        Automated retries stop after <strong>2 failed send attempts</strong> on the same step. Texts only go out{" "}
        <strong>1 PM – 7 PM Eastern</strong>.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="panel" style={{ background: "#ecfdf3" }}>{notice}</div>}

      {!productionSendsEnabled && (
        <div className="error-banner" style={{ background: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}>
          Production SMS is <strong>off</strong>. Clients will not receive reminders from Send now or
          the hourly job. Use <strong>Send test SMS</strong> on the Schedule page to text your test
          number only.
        </div>
      )}

      <div className="inline-actions" style={{ marginBottom: "1rem" }}>
        <button
          type="button"
          className="btn"
          disabled={!productionSendsEnabled || totalDue === 0 || sendingAll}
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
        productionDisabled={!productionSendsEnabled}
        onSend={handleSend}
      />

      <EligibleTable
        title={`General — standard (${general.length})`}
        rows={general}
        sendingId={sendingId}
        sendingAll={sendingAll}
        productionDisabled={!productionSendsEnabled}
        onSend={handleSend}
      />

      <EligibleTable
        title={`General — after maintenance miss (${generalAfterMaintenance.length})`}
        rows={generalAfterMaintenance}
        sendingId={sendingId}
        sendingAll={sendingAll}
        productionDisabled={!productionSendsEnabled}
        onSend={handleSend}
      />
    </>
  );
}
