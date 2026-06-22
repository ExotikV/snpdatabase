import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EnrollmentClient,
  enrollClient,
  fetchEnrollments,
  syncFromSquare,
  unenrollClient,
  updateClientCity,
} from "../lib/api";

export default function EnrollmentsPage() {
  const [clients, setClients] = useState<EnrollmentClient[]>([]);
  const [eligibleCities, setEligibleCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<"all" | "eligible" | "enrolled">("all");
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
      setError(err instanceof Error ? err.message : "Failed to load enrollments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return clients.filter((client) => {
      if (filter === "eligible") return client.cityEligible;
      if (filter === "enrolled") return client.enrolled;
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

  async function handleEnroll(clientId: string) {
    setBusyId(clientId);
    setNotice(null);
    setError(null);
    try {
      await enrollClient(clientId);
      setNotice("Client enrolled in maintenance program.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enroll");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnenroll(clientId: string) {
    if (!window.confirm("Remove this client from the maintenance program?")) return;
    setBusyId(clientId);
    setNotice(null);
    setError(null);
    try {
      await unenrollClient(clientId);
      setNotice("Client unenrolled.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unenroll");
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
    return <div className="loading">Loading enrollments…</div>;
  }

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Cities are pulled from Square customer addresses automatically. Only clients in an
        eligible city can enroll. Use manual city edits below only if Square is missing an
        address.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="panel" style={{ background: "#ecfdf3" }}>{notice}</div>}

      <div className="panel">
        <details style={{ marginBottom: "1rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            {eligibleCities.length} eligible cities
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
              <option value="eligible">Eligible cities only</option>
              <option value="enrolled">Enrolled only</option>
            </select>
          </label>
        </div>

        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Phone</th>
              <th>City</th>
              <th>Area eligible</th>
              <th>Enrolled</th>
              <th></th>
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
                    Save city
                  </button>
                </td>
                <td>
                  {client.cityEligible ? (
                    <span className="badge badge-sent">yes</span>
                  ) : (
                    <span className="badge badge-failed">no</span>
                  )}
                </td>
                <td>
                  {client.enrolled ? (
                    <span className="badge badge-converted">yes</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {client.enrolled ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busyId === client.clientId}
                      onClick={() => handleUnenroll(client.clientId)}
                    >
                      Unenroll
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      disabled={busyId === client.clientId || !client.cityEligible}
                      onClick={() => handleEnroll(client.clientId)}
                      title={
                        client.cityEligible
                          ? "Enroll in maintenance program"
                          : "City not in service area"
                      }
                    >
                      Enroll
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
