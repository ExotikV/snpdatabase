import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EnrollmentClient,
  fetchEnrollments,
  updateClientSmsExclusion,
} from "../lib/api";

type Filter = "all" | "receiving" | "stop" | "manual";

function statusBadgeClass(client: EnrollmentClient) {
  if (!client.optedOut) return "badge-converted";
  if (client.optedOutSource === "stop_reply") return "badge-failed";
  return "badge-pending";
}

function compareClients(a: EnrollmentClient, b: EnrollmentClient) {
  if (a.optedOut !== b.optedOut) return a.optedOut ? -1 : 1;
  if (a.optedOut && b.optedOut && a.optedOutAt && b.optedOutAt) {
    return new Date(b.optedOutAt).getTime() - new Date(a.optedOutAt).getTime();
  }
  return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
}

export default function SmsSubscribersPage() {
  const [clients, setClients] = useState<EnrollmentClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchEnrollments();
      setClients(data.clients);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscribers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const receiving = clients.filter((c) => !c.optedOut).length;
    const stop = clients.filter((c) => c.optedOut && c.optedOutSource === "stop_reply").length;
    const manual = clients.filter((c) => c.optedOut && c.optedOutSource !== "stop_reply").length;
    return { total: clients.length, receiving, stop, manual };
  }, [clients]);

  const filtered = useMemo(() => {
    const rows = clients.filter((client) => {
      if (filter === "receiving") return !client.optedOut;
      if (filter === "stop") return client.optedOut && client.optedOutSource === "stop_reply";
      if (filter === "manual") return client.optedOut && client.optedOutSource !== "stop_reply";
      return true;
    });
    return [...rows].sort(compareClients);
  }, [clients, filter]);

  async function handleToggleReceive(clientId: string, shouldReceive: boolean) {
    setBusyId(clientId);
    setNotice(null);
    setError(null);

    const previous = clients.find((client) => client.clientId === clientId);
    setClients((current) =>
      current.map((client) =>
        client.clientId === clientId
          ? {
              ...client,
              optedOut: !shouldReceive,
              optedOutSource: shouldReceive ? null : "manual",
              optedOutLabel: shouldReceive ? null : "Excluded manually",
            }
          : client,
      ),
    );

    try {
      await updateClientSmsExclusion(clientId, !shouldReceive);
      setNotice(
        shouldReceive ? "Client will receive SMS again." : "Client excluded from SMS in dashboard.",
      );
      await load();
    } catch (err) {
      if (previous) {
        setClients((current) =>
          current.map((client) => (client.clientId === clientId ? previous : client)),
        );
      }
      setError(err instanceof Error ? err.message : "Failed to update subscriber");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="loading">Loading SMS subscribers…</div>;
  }

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Twilio handles STOP/START on the phone. When someone texts <strong>STOP</strong>, we match
        their number to a client and mark them here as unsubscribed. Texting <strong>START</strong>{" "}
        turns reminders back on. You can also exclude or re-include anyone from this list.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="panel" style={{ background: "#ecfdf3" }}>{notice}</div>}

      <div className="card-grid" style={{ marginBottom: "1.25rem" }}>
        <div className="card">
          <div className="card-label">Total clients</div>
          <div className="card-value">{summary.total}</div>
        </div>
        <div className="card">
          <div className="card-label">Receiving SMS</div>
          <div className="card-value">{summary.receiving}</div>
        </div>
        <div className="card">
          <div className="card-label">Unsubscribed (STOP)</div>
          <div className="card-value">{summary.stop}</div>
        </div>
        <div className="card">
          <div className="card-label">Excluded manually</div>
          <div className="card-value">{summary.manual}</div>
        </div>
      </div>

      <div className="panel">
        <div className="inline-actions" style={{ marginBottom: "1rem" }}>
          <label>
            Show{" "}
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              <option value="all">Everyone</option>
              <option value="receiving">Receiving SMS</option>
              <option value="stop">Unsubscribed via STOP</option>
              <option value="manual">Excluded manually</option>
            </select>
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => load()}>
            Refresh
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Since</th>
              <th>Receive SMS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No clients match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((client) => (
                <tr key={client.clientId}>
                  <td>{client.name ?? "—"}</td>
                  <td>{client.phone ?? "—"}</td>
                  <td>
                    <span className={`badge ${statusBadgeClass(client)}`}>
                      {client.optedOut
                        ? client.optedOutLabel ?? "Not receiving"
                        : "Receiving SMS"}
                    </span>
                  </td>
                  <td>
                    {client.optedOut && client.optedOutAt
                      ? new Date(client.optedOutAt).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={!client.optedOut}
                        disabled={busyId === client.clientId}
                        onChange={(e) =>
                          handleToggleReceive(client.clientId, e.target.checked)
                        }
                      />
                      {client.optedOut ? "Off" : "On"}
                    </label>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
