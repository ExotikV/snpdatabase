import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EnrollmentClient,
  fetchEnrollments,
  updateClientSmsExclusion,
} from "../lib/api";

type Filter = "all" | "receiving" | "stop" | "manual";

const FILTER_STORAGE_KEY = "snp-sms-subscribers-filter";

function readSavedFilter(): Filter {
  try {
    const saved = sessionStorage.getItem(FILTER_STORAGE_KEY);
    if (saved === "all" || saved === "receiving" || saved === "stop" || saved === "manual") {
      return saved;
    }
  } catch {
    // ignore
  }
  return "all";
}

function statusBadgeClass(client: EnrollmentClient) {
  if (!client.optedOut) return "badge-converted";
  if (client.optedOutSource === "stop_reply") return "badge-failed";
  return "badge-pending";
}

function compareClients(a: EnrollmentClient, b: EnrollmentClient) {
  return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
}

function restoreScroll(y: number) {
  requestAnimationFrame(() => {
    window.scrollTo(0, y);
  });
}

export default function SmsSubscribersPage() {
  const [clients, setClients] = useState<EnrollmentClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(readSavedFilter);
  const scrollYRef = useRef(0);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    setError(null);
    if (!options?.silent) {
      scrollYRef.current = window.scrollY;
    }
    try {
      const data = await fetchEnrollments();
      setClients(data.clients);
      if (options?.silent) {
        restoreScroll(scrollYRef.current);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscribers");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_STORAGE_KEY, filter);
    } catch {
      // ignore
    }
  }, [filter]);

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
    scrollYRef.current = window.scrollY;
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
              optedOutAt: shouldReceive ? null : new Date().toISOString(),
            }
          : client,
      ),
    );

    try {
      const result = await updateClientSmsExclusion(clientId, !shouldReceive);
      setClients((current) =>
        current.map((client) =>
          client.clientId === clientId
            ? {
                ...client,
                optedOut: result.opted_out,
                optedOutSource: result.opted_out_source,
                optedOutAt: result.opted_out_at,
                optedOutLabel: result.opted_out
                  ? result.opted_out_source === "stop_reply"
                    ? "Unsubscribed (STOP reply)"
                    : "Excluded manually"
                  : null,
              }
            : client,
        ),
      );
      setNotice(
        shouldReceive ? "Client will receive SMS again." : "Client excluded from SMS in dashboard.",
      );
    } catch (err) {
      if (previous) {
        setClients((current) =>
          current.map((client) => (client.clientId === clientId ? previous : client)),
        );
      }
      setError(err instanceof Error ? err.message : "Failed to update subscriber");
    } finally {
      setBusyId(null);
      restoreScroll(scrollYRef.current);
    }
  }

  function handleRefresh() {
    scrollYRef.current = window.scrollY;
    setRefreshing(true);
    void load({ silent: true });
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
      {notice && (
        <div className="panel" style={{ background: "#ecfdf3", scrollMarginTop: 80 }}>
          {notice}
        </div>
      )}

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
          <button
            type="button"
            className="btn btn-secondary"
            disabled={refreshing}
            onClick={handleRefresh}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
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
                        onChange={(e) => {
                          void handleToggleReceive(client.clientId, e.target.checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
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
