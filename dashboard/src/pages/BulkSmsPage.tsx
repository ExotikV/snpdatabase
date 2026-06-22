import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MESSAGE_VARIABLES_EN,
  ManualSmsClient,
  fetchManualSmsClients,
  sendManualBulkSms,
} from "../lib/api";
import { getFirstName, renderMessageTemplate } from "../../../lib/message-template.js";
import { buildBookingUrl } from "../../../lib/booking-url.js";

const MESSAGE_PRESETS = [
  {
    id: "custom",
    label: "Custom message",
    body: "",
  },
  {
    id: "book-next",
    label: "Book your next visit",
    body: "Hi {first_name}, we'd love to see you again at SNP Detailing. Book your next appointment here: {booking_url}",
  },
  {
    id: "seasonal",
    label: "Seasonal reminder",
    body: "Hi {first_name}, it's a great time to refresh your vehicle. Book with SNP Detailing: {booking_url}",
  },
  {
    id: "maintenance-nudge",
    label: "Maintenance nudge",
    body: "Hi {first_name}, it's been {days_since} days since your last {service}. Book your maintenance detail: {booking_url}",
  },
];

function buildPreview(messageBody: string, client: ManualSmsClient | null) {
  if (!messageBody.trim()) return "";
  const sample = client ?? {
    clientId: "",
    name: "Alex Martin",
    phone: null,
    city: null,
    preferredLanguage: "en" as const,
    lastServiceType: "Interior + Exterior",
    lastDetailDate: "2026-05-01",
    daysSince: 45,
  };

  return renderMessageTemplate(messageBody, {
    name: sample.name ?? "",
    firstName: getFirstName(sample.name),
    serviceType: sample.lastServiceType,
    lastDetailDate: sample.lastDetailDate,
    daysSince: sample.daysSince,
    bookingUrl: buildBookingUrl({}),
  });
}

export default function BulkSmsPage() {
  const [clients, setClients] = useState<ManualSmsClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [presetId, setPresetId] = useState(MESSAGE_PRESETS[1].id);
  const [messageBody, setMessageBody] = useState(MESSAGE_PRESETS[1].body);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [productionSendsEnabled, setProductionSendsEnabled] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchManualSmsClients(search);
      setClients(data.clients);
      setProductionSendsEnabled(data.productionSendsEnabled);
      setSelectedIds((current) => {
        const valid = new Set(data.clients.map((client) => client.clientId));
        return new Set([...current].filter((id) => valid.has(id)));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      load();
    }, search ? 300 : 0);
    return () => window.clearTimeout(timeout);
  }, [load, search]);

  const previewClient = useMemo(() => {
    const firstSelected = clients.find((client) => selectedIds.has(client.clientId));
    return firstSelected ?? clients[0] ?? null;
  }, [clients, selectedIds]);

  const previewText = useMemo(
    () => buildPreview(messageBody, previewClient),
    [messageBody, previewClient],
  );

  const allVisibleSelected =
    clients.length > 0 && clients.every((client) => selectedIds.has(client.clientId));

  function handlePresetChange(nextPresetId: string) {
    setPresetId(nextPresetId);
    const preset = MESSAGE_PRESETS.find((row) => row.id === nextPresetId);
    if (preset && preset.id !== "custom") {
      setMessageBody(preset.body);
    }
  }

  function toggleClient(clientId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const client of clients) next.delete(client.clientId);
        return next;
      });
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      for (const client of clients) next.add(client.clientId);
      return next;
    });
  }

  async function handleSend() {
    if (!messageBody.trim()) {
      setError("Write a message before sending.");
      return;
    }

    if (selectedIds.size === 0) {
      setError("Select at least one client.");
      return;
    }

    const confirmed = window.confirm(
      `Send this message to ${selectedIds.size} client${selectedIds.size === 1 ? "" : "s"}?`,
    );
    if (!confirmed) return;

    setSending(true);
    setError(null);
    setNotice(null);

    try {
      const result = await sendManualBulkSms(messageBody, [...selectedIds]);
      setNotice(
        `Sent ${result.sentCount} of ${result.requested}. Failed: ${result.failedCount}. Skipped: ${result.skippedCount}.`,
      );
      if (result.failedCount > 0) {
        const names = result.failed
          .slice(0, 3)
          .map((row) => row.name ?? row.clientId)
          .join(", ");
        setError(`Some sends failed (e.g. ${names}). Check SMS log for details.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send bulk SMS");
    } finally {
      setSending(false);
    }
  }

  if (loading && clients.length === 0) {
    return <div className="loading">Loading clients…</div>;
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      {notice && (
        <div
          className="error-banner"
          style={{ background: "#ecfdf5", color: "#166534", borderColor: "#bbf7d0" }}
        >
          {notice}
        </div>
      )}

      {!productionSendsEnabled && (
        <div
          className="error-banner"
          style={{ background: "#fff8e6", color: "#7a5c00", borderColor: "#fde68a" }}
        >
          Production SMS sends are disabled. Enable <code>SMS_PRODUCTION_SENDS_ENABLED=true</code>{" "}
          on Netlify to send bulk messages.
        </div>
      )}

      <h2 className="section-title">Bulk manual SMS</h2>
      <p className="muted section-intro">
        One-off messages to selected clients — not tied to the automated reminder schedule. Each
        send is logged as <strong>Manual</strong> in the SMS log. STOP opt-outs are excluded
        automatically.
      </p>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Message</h2>
        <label className="muted" htmlFor="bulk-sms-preset">
          Template
        </label>
        <select
          id="bulk-sms-preset"
          value={presetId}
          onChange={(event) => handlePresetChange(event.target.value)}
          style={{ display: "block", width: "100%", maxWidth: 360, marginBottom: "0.75rem" }}
        >
          {MESSAGE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>

        <label className="muted" htmlFor="bulk-sms-body">
          Message text
        </label>
        <textarea
          id="bulk-sms-body"
          value={messageBody}
          onChange={(event) => {
            setPresetId("custom");
            setMessageBody(event.target.value);
          }}
          rows={6}
          style={{ width: "100%", marginTop: "0.35rem" }}
          placeholder="Hi {first_name}, ..."
        />

        <p className="muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          Variables: {MESSAGE_VARIABLES_EN.join(", ")}. Opt-out footer is appended automatically.
        </p>

        {previewText && (
          <div style={{ marginTop: "1rem" }}>
            <div className="muted">Preview{previewClient ? ` (${previewClient.name})` : ""}</div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "#f8fafc",
                padding: "0.75rem",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                marginTop: "0.35rem",
              }}
            >
              {previewText}
            </pre>
          </div>
        )}
      </div>

      <div className="panel">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <input
            type="search"
            placeholder="Search clients…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ flex: "1 1 200px", maxWidth: 320 }}
          />
          <button type="button" className="btn btn-secondary" onClick={toggleSelectAllVisible}>
            {allVisibleSelected ? "Clear visible" : "Select all visible"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={sending || !productionSendsEnabled || selectedIds.size === 0}
            onClick={handleSend}
          >
            {sending
              ? "Sending…"
              : `Send to ${selectedIds.size} client${selectedIds.size === 1 ? "" : "s"}`}
          </button>
        </div>

        {clients.length === 0 ? (
          <p className="muted">No clients with a phone number and SMS enabled.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Client</th>
                <th>City</th>
                <th>Phone</th>
                <th>Last detail</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.clientId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(client.clientId)}
                      onChange={() => toggleClient(client.clientId)}
                      aria-label={`Select ${client.name ?? "client"}`}
                    />
                  </td>
                  <td>{client.name ?? "—"}</td>
                  <td>{client.city ?? "—"}</td>
                  <td>{client.phone ?? "—"}</td>
                  <td>
                    {client.lastDetailDate ?? "—"}
                    {client.daysSince != null && (
                      <div className="muted">{client.daysSince} days ago</div>
                    )}
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
