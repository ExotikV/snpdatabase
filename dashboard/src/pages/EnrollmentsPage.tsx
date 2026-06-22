import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EnrollmentClient,
  fetchEnrollments,
  syncFromSquare,
  updateClientCity,
  updateClientLanguage,
} from "../lib/api";

export default function EnrollmentsPage() {
  const [clients, setClients] = useState<EnrollmentClient[]>([]);
  const [eligibleCities, setEligibleCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<"all" | "maintenance" | "general">("all");
  const [cityDrafts, setCityDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchEnrollments();
      setClients(data.clients);
      setEligibleCities(data.eligibleCities);
      setCityDrafts(
        Object.fromEntries(data.clients.map((client) => [client.clientId, client.city ?? ""])),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return clients.filter((client) => {
      if (filter === "maintenance") return client.smsTrack === "maintenance";
      if (filter === "general") return client.smsTrack === "general";
      return true;
    });
  }, [clients, filter]);

  async function handleSaveCity(clientId: string) {
    setBusyId(clientId);
    setNotice(null);
    setError(null);
    try {
      await updateClientCity(clientId, cityDrafts[clientId] ?? "");
      setNotice("City updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update city");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveLanguage(clientId: string, preferredLanguage: "en" | "fr") {
    setBusyId(clientId);
    setNotice(null);
    setError(null);
    try {
      await updateClientLanguage(clientId, preferredLanguage);
      setNotice("SMS language updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update language");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSquareSync() {
    setSyncing(true);
    setNotice(null);
    setError(null);
    try {
      const result = await syncFromSquare(false);
      const { stats } = result;
      setNotice(
        `Synced from Square: ${stats.clientsProcessed} clients (${stats.clientsWithCity} with city), ${stats.bookingsProcessed ?? 0} completed bookings updated.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Square sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <div className="loading">Loading clients…</div>;
  }

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        All clients receive SMS reminders unless opted out. <strong>Maintenance</strong> track =
        service-area city + detail within 60 days. <strong>General</strong> track = regular detail
        reminders for everyone else, in any city.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="panel" style={{ background: "#ecfdf3" }}>{notice}</div>}

      <div className="panel">
        <details style={{ marginBottom: "1rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            {eligibleCities.length} service-area cities (maintenance track only — general has no city limit)
          </summary>
          <p className="help-text" style={{ marginTop: "0.5rem" }}>
            {eligibleCities.join(", ")}
          </p>
        </details>

        <div className="inline-actions" style={{ marginBottom: "1rem" }}>
          <button type="button" className="btn" disabled={syncing} onClick={handleSquareSync}>
            {syncing ? "Syncing from Square…" : "Sync from Square"}
          </button>
          <label>
            Show{" "}
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">All clients</option>
              <option value="maintenance">Maintenance track</option>
              <option value="general">General track</option>
            </select>
          </label>
        </div>

        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Phone</th>
              <th>City</th>
              <th>SMS track</th>
              <th>SMS language</th>
              <th>Days since last detail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((client) => (
              <tr key={client.clientId}>
                <td>{client.name ?? "—"}</td>
                <td>{client.phone ?? "—"}</td>
                <td>
                  <input
                    type="text"
                    value={cityDrafts[client.clientId] ?? ""}
                    onChange={(e) =>
                      setCityDrafts((current) => ({
                        ...current,
                        [client.clientId]: e.target.value,
                      }))
                    }
                    placeholder="City"
                    style={{ width: "100%", minWidth: 140 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginTop: 6 }}
                    disabled={busyId === client.clientId}
                    onClick={() => handleSaveCity(client.clientId)}
                  >
                    Save city override
                  </button>
                </td>
                <td>
                  {client.optedOut ? (
                    <span className="badge badge-failed">Opted out</span>
                  ) : (
                    <span
                      className={`badge ${client.smsTrack === "maintenance" ? "badge-converted" : "badge-pending"}`}
                    >
                      {client.smsTrackLabel}
                    </span>
                  )}
                </td>
                <td>
                  <select
                    value={client.preferredLanguage ?? "en"}
                    disabled={busyId === client.clientId || client.optedOut}
                    onChange={(e) =>
                      handleSaveLanguage(client.clientId, e.target.value as "en" | "fr")
                    }
                  >
                    <option value="en">English</option>
                    <option value="fr">French</option>
                  </select>
                </td>
                <td>{client.daysSinceLastDetail ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
