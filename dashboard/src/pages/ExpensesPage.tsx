import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ExpenseStoreRow,
  ExpensesDashboardResponse,
  createExpense,
  createExpenseStore,
  fetchExpenses,
} from "../lib/api";
import { toDateInputValue } from "../../../lib/dates.js";

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

const CREATE_STORE_VALUE = "__create_store__";

function formatCad(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

function formatDisplayDate(value: string | null) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-CA", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function parseAmountToCents(raw: string) {
  const normalized = raw.trim().replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const dollars = Number(normalized);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

function defaultExpenseDate() {
  return toDateInputValue(new Date()) || new Date().toISOString().slice(0, 10);
}

export default function ExpensesPage() {
  const [data, setData] = useState<ExpensesDashboardResponse | null>(null);
  const [period, setPeriod] = useState<PeriodId>("this_month");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [storeId, setStoreId] = useState("");
  const [showCreateStore, setShowCreateStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [creatingStore, setCreatingStore] = useState(false);
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(defaultExpenseDate);
  const [amount, setAmount] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetchExpenses(period, year);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, [period, year]);

  useEffect(() => {
    load();
  }, [load]);

  const stores = data?.stores ?? [];

  function resetForm() {
    setStoreId("");
    setShowCreateStore(false);
    setNewStoreName("");
    setDescription("");
    setExpenseDate(defaultExpenseDate());
    setAmount("");
    setFormError(null);
  }

  function openAddModal() {
    resetForm();
    setShowAdd(true);
  }

  function handleStoreChange(value: string) {
    if (value === CREATE_STORE_VALUE) {
      setStoreId("");
      setShowCreateStore(true);
      return;
    }
    setShowCreateStore(false);
    setNewStoreName("");
    setStoreId(value);
  }

  async function handleCreateStore() {
    setFormError(null);
    const name = newStoreName.trim();
    if (!name) {
      setFormError("Enter a store name.");
      return;
    }

    setCreatingStore(true);
    try {
      const { store } = await createExpenseStore(name);
      setStoreId(store.id);
      setShowCreateStore(false);
      setNewStoreName("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create store");
    } finally {
      setCreatingStore(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!storeId) {
      setFormError("Select a store or create one first.");
      return;
    }

    const amountCents = parseAmountToCents(amount);
    if (!description.trim()) {
      setFormError("Enter what you bought.");
      return;
    }
    if (!expenseDate) {
      setFormError("Select a date.");
      return;
    }
    if (amountCents == null) {
      setFormError("Enter a valid amount.");
      return;
    }

    setSaving(true);
    try {
      await createExpense({
        storeId,
        description: description.trim(),
        amountCents,
        expenseDate,
      });
      setShowAdd(false);
      resetForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save expense");
    } finally {
      setSaving(false);
    }
  }

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current, current - 1, current - 2];
  }, []);

  if (loading && !data) {
    return <div className="loading">Loading expenses…</div>;
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      {data?.migrationRequired && (
        <div className="error-banner">
          <p style={{ margin: "0 0 0.5rem" }}>
            Expense tracking is not set up yet. In Supabase → SQL Editor, paste and run the full
            contents of <code>schema/expenses.sql</code>, then refresh this page.
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
            <h2 style={{ margin: 0 }}>Expenses</h2>
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              Log purchases by store and track spending over time.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={openAddModal}
            disabled={Boolean(data?.migrationRequired)}
          >
            Add expense
          </button>
        </div>

        <div className="card-grid">
          <div className="card">
            <div className="card-label">{data?.periodLabel ?? "Total"}</div>
            <div className="card-value">{formatCad(data?.stats.totalCents ?? 0)}</div>
            <div className="muted">{data?.stats.expenseCount ?? 0} expenses</div>
          </div>
          <div className="card">
            <div className="card-label">Average expense</div>
            <div className="card-value">{formatCad(data?.stats.averageCents ?? 0)}</div>
            <div className="muted">For selected period</div>
          </div>
          <div className="card">
            <div className="card-label">Stores saved</div>
            <div className="card-value">{stores.length}</div>
            <div className="muted">Reusable store profiles</div>
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
        <p className="muted section-intro">Click a month to filter the expense list below.</p>
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
                <div className="muted">{bucket.expenseCount} expenses</div>
              </button>
            );
          })}
        </div>
      </div>

      {stores.length > 0 && (
        <div className="panel" style={{ marginBottom: "1.25rem" }}>
          <h3 className="section-title">Store profiles</h3>
          <p className="muted section-intro">{stores.map((store) => store.name).join(" · ")}</p>
        </div>
      )}

      <div className="panel">
        <h3 className="section-title">Logged expenses — {data?.periodLabel ?? "Expenses"}</h3>
        {!data?.expenses.length ? (
          <p className="muted">No expenses logged for this period.</p>
        ) : (
          <div className="panel-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Store</th>
                  <th>What we bought</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.expenses.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDisplayDate(row.expenseDate)}</td>
                    <td>{row.storeName ?? "—"}</td>
                    <td>{row.description}</td>
                    <td>{formatCad(row.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <>
          <div
            className="nav-backdrop"
            style={{
              display: "block",
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              zIndex: 20,
            }}
            aria-hidden
            onClick={() => setShowAdd(false)}
          />
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
            <h2 style={{ marginTop: 0 }}>Add expense</h2>

            {formError && <div className="error-banner">{formError}</div>}

            <form onSubmit={handleSubmit}>
              <label style={{ display: "block", marginBottom: "1rem" }}>
                Store
                <select
                  value={showCreateStore ? CREATE_STORE_VALUE : storeId}
                  onChange={(e) => handleStoreChange(e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
                >
                  <option value="">Select a store…</option>
                  {stores.map((store: ExpenseStoreRow) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                  <option value={CREATE_STORE_VALUE}>+ Create store profile…</option>
                </select>
              </label>

              {showCreateStore && (
                <div
                  className="panel"
                  style={{ marginBottom: "1rem", background: "#f8fafc", padding: "0.85rem" }}
                >
                  <label style={{ display: "block", marginBottom: "0.75rem" }}>
                    Store name
                    <input
                      type="text"
                      value={newStoreName}
                      onChange={(e) => setNewStoreName(e.target.value)}
                      placeholder="e.g. Canadian Tire"
                      style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={creatingStore}
                    onClick={() => void handleCreateStore()}
                  >
                    {creatingStore ? "Saving store…" : "Save store profile"}
                  </button>
                </div>
              )}

              <label style={{ display: "block", marginBottom: "1rem" }}>
                What we bought
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Microfiber towels"
                  style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
                />
              </label>

              <label style={{ display: "block", marginBottom: "1rem" }}>
                Date
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
                />
              </label>

              <label style={{ display: "block", marginBottom: "1rem" }}>
                Amount (CAD)
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 45.99"
                  style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
                />
              </label>

              <div className="inline-actions">
                <button type="submit" className="btn" disabled={saving || creatingStore}>
                  {saving ? "Saving…" : "Log expense"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
