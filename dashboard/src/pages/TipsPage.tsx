import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ManualSmsClient,
  TipRow,
  TipTodayJob,
  TipsDashboardResponse,
  createTip,
  fetchClientTipDetails,
  fetchManualSmsClients,
  fetchTips,
} from "../lib/api";

type PeriodId =
  | "today"
  | "this_week"
  | "last_week"
  | "last_30_days"
  | "this_month"
  | "all"
  | `month_${number}`;

const QUICK_PERIODS: { id: PeriodId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "last_30_days", label: "Last 30 days" },
  { id: "this_month", label: "This month" },
  { id: "all", label: "All time" },
];

function formatCad(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-CA", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function parseAmountToCents(raw: string) {
  const normalized = raw.trim().replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const dollars = Number(normalized);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

function jobLabel(job: TipTodayJob) {
  const service = job.serviceType ?? "Detail";
  return `${job.clientName} — ${service} (${formatDate(job.completedAt)})`;
}

export default function TipsPage() {
  const [data, setData] = useState<TipsDashboardResponse | null>(null);
  const [period, setPeriod] = useState<PeriodId>("this_month");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedJobKey, setSelectedJobKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [squareBookingId, setSquareBookingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<ManualSmsClient[]>([]);
  const [clientDetails, setClientDetails] = useState<{ detailId: string; label: string }[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetchTips(period, year);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tips");
    } finally {
      setLoading(false);
    }
  }, [period, year]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!clientId || selectedJobKey) return;

    let cancelled = false;
    fetchClientTipDetails(clientId)
      .then((response) => {
        if (cancelled) return;
        setClientDetails(
          response.details.map((detail) => ({
            detailId: detail.detailId,
            label: `${detail.serviceType ?? "Detail"} — ${formatDate(detail.completedAt)}`,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setClientDetails([]);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, selectedJobKey]);

  useEffect(() => {
    if (selectedJobKey) return;
    if (!clientSearch.trim()) {
      setClientResults([]);
      return;
    }

    const timer = window.setTimeout(() => {
      fetchManualSmsClients(clientSearch)
        .then((response) => setClientResults(response.clients.slice(0, 8)))
        .catch(() => setClientResults([]));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [clientSearch, selectedJobKey]);

  const todayJobs = data?.todayJobs ?? [];

  function resetForm() {
    setSelectedJobKey("");
    setClientId("");
    setDetailId(null);
    setSquareBookingId(null);
    setAmount("");
    setNotes("");
    setClientSearch("");
    setClientResults([]);
    setClientDetails([]);
    setFormError(null);
  }

  function openAddModal() {
    resetForm();
    setShowAdd(true);
  }

  function handleJobSelect(value: string) {
    setSelectedJobKey(value);
    if (!value) {
      setClientId("");
      setDetailId(null);
      setSquareBookingId(null);
      return;
    }

    const job = todayJobs.find((row) => jobKey(row) === value);
    if (!job) return;
    setClientId(job.clientId);
    setDetailId(job.detailId);
    setSquareBookingId(job.squareBookingId);
    setClientDetails([]);
  }

  function jobKey(job: TipTodayJob) {
    return `${job.clientId}:${job.detailId ?? job.squareBookingId ?? job.completedAt}`;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const amountCents = parseAmountToCents(amount);
    if (!clientId) {
      setFormError("Select a client or today's job.");
      return;
    }
    if (amountCents == null) {
      setFormError("Enter a valid tip amount.");
      return;
    }

    setSaving(true);
    try {
      await createTip({
        clientId,
        detailId,
        squareBookingId,
        amountCents,
        notes: notes.trim() || undefined,
      });
      setShowAdd(false);
      resetForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save tip");
    } finally {
      setSaving(false);
    }
  }

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current, current - 1, current - 2];
  }, []);

  if (loading && !data) {
    return <div className="loading">Loading tips…</div>;
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      {data?.migrationRequired && (
        <div className="error-banner">
          <p style={{ margin: "0 0 0.5rem" }}>
            The <strong>tips</strong> table is not set up yet. In Supabase → SQL Editor, paste and run the
            full contents of <code>schema/tips.sql</code>, then refresh this page.
          </p>
          {data.setupError && (
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              Details: {data.setupError}
            </p>
          )}
        </div>
      )}

      {!data?.migrationRequired && data?.setupError && (
        <div className="error-banner">{data.setupError}</div>
      )}

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <div className="inline-actions" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
          <div>
            <h2 style={{ margin: 0 }}>Tips</h2>
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              Log tips from today&apos;s jobs and track totals over time.
            </p>
          </div>
          <button type="button" className="btn" onClick={openAddModal} disabled={Boolean(data?.migrationRequired)}>
            Add tip
          </button>
        </div>

        <div className="card-grid">
          <div className="card">
            <div className="card-label">{data?.periodLabel ?? "Total"}</div>
            <div className="card-value">{formatCad(data?.stats.totalCents ?? 0)}</div>
            <div className="muted">{data?.stats.tipCount ?? 0} tips</div>
          </div>
          <div className="card">
            <div className="card-label">Average tip</div>
            <div className="card-value">{formatCad(data?.stats.averageCents ?? 0)}</div>
            <div className="muted">For selected period</div>
          </div>
          <div className="card">
            <div className="card-label">Today&apos;s jobs</div>
            <div className="card-value">{todayJobs.length}</div>
            <div className="muted">Ready to link when adding a tip</div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h3 className="section-title">Filter</h3>
        <div className="tab-row">
          {QUICK_PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={period === item.id ? "btn" : "btn btn-secondary"}
              onClick={() => setPeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="inline-actions" style={{ marginTop: "1rem" }}>
          <label>
            Year{" "}
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h3 className="section-title">{year} by month</h3>
        <p className="muted section-intro">Click a month to filter the tip list below.</p>
        <div className="card-grid">
          {(data?.monthlyBreakdown ?? []).map((bucket) => {
            const monthPeriod = `month_${bucket.month}` as PeriodId;
            const active = period === monthPeriod;
            return (
              <button
                key={bucket.month}
                type="button"
                className="card"
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  borderColor: active ? "#2563eb" : undefined,
                }}
                onClick={() => setPeriod(monthPeriod)}
              >
                <div className="card-label">{bucket.label}</div>
                <div className="card-value">{formatCad(bucket.totalCents)}</div>
                <div className="muted">{bucket.tipCount} tips</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h3 className="section-title">Logged tips — {data?.periodLabel ?? "Tips"}</h3>
        {!data?.tips.length ? (
          <p className="muted">No tips logged for this period.</p>
        ) : (
          <div className="panel-table">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Client</th>
                  <th>Job</th>
                  <th>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.tips.map((row: TipRow) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.tippedAt)}</td>
                    <td>
                      <div>{row.clientName ?? "—"}</div>
                      {row.clientPhone && (
                        <div className="muted" style={{ fontSize: "0.85rem" }}>
                          {row.clientPhone}
                        </div>
                      )}
                    </td>
                    <td>
                      {row.jobServiceType ?? "—"}
                      {row.jobCompletedAt && (
                        <div className="muted" style={{ fontSize: "0.85rem" }}>
                          {formatDate(row.jobCompletedAt)}
                        </div>
                      )}
                    </td>
                    <td>{formatCad(row.amountCents)}</td>
                    <td>{row.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <div
          className="nav-backdrop"
          style={{ display: "block", position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 20 }}
          aria-hidden
          onClick={() => setShowAdd(false)}
        />
      )}

      {showAdd && (
        <div
          className="panel"
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 21,
            width: "min(520px, calc(100vw - 2rem))",
            maxHeight: "90vh",
            overflow: "auto",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Add tip</h2>
          <p className="muted">Pick one of today&apos;s jobs, or choose a client and link a past detail.</p>

          {formError && <div className="error-banner">{formError}</div>}

          <form onSubmit={handleSubmit}>
            <label style={{ display: "block", marginBottom: "1rem" }}>
              Today&apos;s job
              <select
                value={selectedJobKey}
                onChange={(e) => handleJobSelect(e.target.value)}
                style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
              >
                <option value="">Select a client / job…</option>
                {todayJobs.map((job) => (
                  <option key={jobKey(job)} value={jobKey(job)}>
                    {jobLabel(job)}
                  </option>
                ))}
              </select>
            </label>

            {!selectedJobKey && (
              <>
                <label style={{ display: "block", marginBottom: "1rem" }}>
                  Or search client
                  <input
                    type="search"
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setClientId("");
                      setDetailId(null);
                    }}
                    placeholder="Name or phone"
                    style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
                  />
                </label>

                {clientResults.length > 0 && (
                  <div style={{ marginBottom: "1rem" }}>
                    {clientResults.map((client) => (
                      <button
                        key={client.clientId}
                        type="button"
                        className="btn btn-secondary"
                        style={{ display: "block", width: "100%", marginBottom: "0.35rem", textAlign: "left" }}
                        onClick={() => {
                          setClientId(client.clientId);
                          setClientSearch(client.name ?? client.phone ?? client.clientId);
                          setClientResults([]);
                        }}
                      >
                        {client.name ?? "(no name)"}
                        {client.phone ? ` — ${client.phone}` : ""}
                      </button>
                    ))}
                  </div>
                )}

                {clientId && clientDetails.length > 0 && (
                  <label style={{ display: "block", marginBottom: "1rem" }}>
                    Link to job
                    <select
                      value={detailId ?? ""}
                      onChange={(e) => setDetailId(e.target.value || null)}
                      style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
                    >
                      <option value="">No linked job</option>
                      {clientDetails.map((detail) => (
                        <option key={detail.detailId} value={detail.detailId}>
                          {detail.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}

            <label style={{ display: "block", marginBottom: "1rem" }}>
              Tip amount (CAD)
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 20"
                style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
              />
            </label>

            <label style={{ display: "block", marginBottom: "1rem" }}>
              Notes (optional)
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
              />
            </label>

            <div className="inline-actions">
              <button type="submit" className="btn" disabled={saving}>
                {saving ? "Saving…" : "Log tip"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
