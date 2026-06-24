import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ExpenseStoreRow,
  ExpensesDashboardResponse,
  createExpense,
  createExpenseStore,
  deleteExpense,
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

const RECEIPT_ACCEPT = "image/*,.pdf,application/pdf";
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

function readFileAsBase64(file: File): Promise<{
  fileName: string;
  contentType: string;
  dataBase64: string;
}> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_RECEIPT_BYTES) {
      reject(new Error("Receipt file must be 5 MB or smaller"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      const dataBase64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        dataBase64,
      });
    };
    reader.onerror = () => reject(new Error("Failed to read receipt file"));
    reader.readAsDataURL(file);
  });
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
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!receiptFile) {
      setReceiptPreviewUrl(null);
      return;
    }

    if (!receiptFile.type.startsWith("image/")) {
      setReceiptPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(receiptFile);
    setReceiptPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [receiptFile]);

  function resetForm() {
    setStoreId("");
    setShowCreateStore(false);
    setNewStoreName("");
    setDescription("");
    setExpenseDate(defaultExpenseDate());
    setAmount("");
    setReceiptFile(null);
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
      const receipt = receiptFile ? await readFileAsBase64(receiptFile) : undefined;
      await createExpense({
        storeId,
        description: description.trim(),
        amountCents,
        expenseDate,
        receipt,
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

  async function handleDelete(expenseId: string, label: string) {
    if (!window.confirm(`Delete this expense?\n\n${label}`)) return;

    setDeletingId(expenseId);
    setError(null);
    try {
      await deleteExpense(expenseId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete expense");
    } finally {
      setDeletingId(null);
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

      {data?.receiptMigrationRequired && !data?.migrationRequired && (
        <div
          className="error-banner"
          style={{ background: "#fff8e6", color: "#7a5c00", borderColor: "#fde68a" }}
        >
          Receipt uploads are not set up yet. Run <code>schema/expenses_receipt.sql</code> in Supabase
          to attach photos or PDFs to expenses.
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
                  <th>Receipt</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.expenses.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDisplayDate(row.expenseDate)}</td>
                    <td>{row.storeName ?? "—"}</td>
                    <td>{row.description}</td>
                    <td>{formatCad(row.amountCents)}</td>
                    <td>
                      {row.hasReceipt && row.receiptUrl ? (
                        <a href={row.receiptUrl} target="_blank" rel="noreferrer">
                          {row.receiptContentType?.includes("pdf") ? "View PDF" : "View"}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-small"
                        disabled={deletingId === row.id}
                        onClick={() =>
                          handleDelete(
                            row.id,
                            `${row.storeName ?? "Expense"} — ${row.description} (${formatCad(row.amountCents)})`,
                          )
                        }
                      >
                        {deletingId === row.id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
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

              <label style={{ display: "block", marginBottom: "1rem" }}>
                Receipt (optional)
                <input
                  type="file"
                  accept={RECEIPT_ACCEPT}
                  disabled={Boolean(data?.receiptMigrationRequired)}
                  onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                  style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
                />
              </label>
              <p className="muted" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
                Photo or PDF, up to 5 MB.
              </p>

              {receiptFile && !receiptPreviewUrl && (
                <p className="muted" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
                  Attached: {receiptFile.name}
                </p>
              )}

              {receiptPreviewUrl && (
                <div style={{ marginBottom: "1rem" }}>
                  <div className="muted">Preview</div>
                  <img
                    src={receiptPreviewUrl}
                    alt="Receipt preview"
                    style={{
                      display: "block",
                      maxWidth: "100%",
                      maxHeight: 220,
                      marginTop: "0.35rem",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                    }}
                  />
                </div>
              )}

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
