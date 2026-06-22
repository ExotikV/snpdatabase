import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MESSAGE_VARIABLES_EN,
  MESSAGE_VARIABLES_FR,
  ManualSmsClient,
  fetchManualSmsClients,
  sendManualBulkSms,
} from "../lib/api";
import { getFirstName, renderMessageTemplate } from "../../../lib/message-template.js";

type TrackFilter =
  | "all"
  | "maintenance"
  | "general"
  | "general_after_maintenance"
  | "no_detail";

const TRACK_FILTER_OPTIONS: { value: TrackFilter; label: string }[] = [
  { value: "all", label: "All clients" },
  { value: "maintenance", label: "Maintenance track" },
  { value: "general", label: "General track" },
  { value: "general_after_maintenance", label: "After maintenance miss" },
  { value: "no_detail", label: "No completed detail" },
];

function matchesTrackFilter(client: ManualSmsClient, filter: TrackFilter) {
  if (filter === "all") return true;
  if (filter === "no_detail") return !client.smsTrack;
  return client.smsTrack === filter;
}

const MESSAGE_PRESETS = [
  {
    id: "custom",
    label: "Custom message",
    en: "",
    fr: "",
  },
  {
    id: "book-next",
    label: "Book your next visit (general)",
    en: "Hi {first_name}, we'd love to see you again at SNP Detailing. Book your next appointment here: {booking_url_general}",
    fr: "Bonjour {prenom}, nous aimerions vous revoir chez SNP Detailing. Réservez votre prochain rendez-vous ici : {lien_general}",
  },
  {
    id: "seasonal",
    label: "Seasonal reminder (general)",
    en: "Hi {first_name}, it's a great time to refresh your vehicle. Book with SNP Detailing: {booking_url_general}",
    fr: "Bonjour {prenom}, c'est le bon moment pour rafraîchir votre véhicule. Réservez avec SNP Detailing : {lien_general}",
  },
  {
    id: "maintenance-nudge",
    label: "Maintenance nudge",
    en: "Hi {first_name}, it's been {days_since} days since your last {service}. Book your maintenance detail: {booking_url_maintenance}",
    fr: "Bonjour {prenom}, cela fait {jours_depuis} jours depuis votre dernier {detail}. Réservez votre entretien : {lien_entretien}",
  },
  {
    id: "after-maintenance",
    label: "After maintenance miss",
    en: "Hi {first_name}, we still have openings for a full detail. Book here: {booking_url_after_maintenance}",
    fr: "Bonjour {prenom}, nous avons encore des places pour un détail complet. Réservez ici : {lien_apres_entretien}",
  },
];

type MessageLanguage = "en" | "fr";

function pickMessageForLanguage(messageEn: string, messageFr: string, language: MessageLanguage) {
  if (language === "fr") return messageFr.trim() || messageEn.trim();
  return messageEn.trim() || messageFr.trim();
}

function buildPreview(
  messageEn: string,
  messageFr: string,
  client: ManualSmsClient | null,
  previewLanguage?: MessageLanguage,
) {
  const language = previewLanguage ?? client?.preferredLanguage ?? "en";
  const template = pickMessageForLanguage(messageEn, messageFr, language);
  if (!template) return "";

  const sample = client ?? {
    clientId: "",
    name: language === "fr" ? "Alex Martin" : "Alex Martin",
    phone: null,
    city: null,
    preferredLanguage: language,
    lastServiceType: "Interior + Exterior",
    lastDetailDate: "2026-05-01",
    daysSince: 45,
    smsTrack: null,
    smsTrackLabel: "No completed detail",
  };

  return renderMessageTemplate(template, {
    name: sample.name ?? "",
    firstName: getFirstName(sample.name),
    serviceType: sample.lastServiceType,
    lastDetailDate: sample.lastDetailDate,
    daysSince: sample.daysSince,
    shortRef: "preview",
  });
}

export default function BulkSmsPage() {
  const [clients, setClients] = useState<ManualSmsClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [presetId, setPresetId] = useState(MESSAGE_PRESETS[1].id);
  const [messageBodyEn, setMessageBodyEn] = useState(MESSAGE_PRESETS[1].en);
  const [messageBodyFr, setMessageBodyFr] = useState(MESSAGE_PRESETS[1].fr);
  const [activeMessageLanguage, setActiveMessageLanguage] = useState<MessageLanguage>("en");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [productionSendsEnabled, setProductionSendsEnabled] = useState(false);
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("all");

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

  const filteredClients = useMemo(
    () => clients.filter((client) => matchesTrackFilter(client, trackFilter)),
    [clients, trackFilter],
  );

  const trackCounts = useMemo(() => {
    const counts = {
      all: clients.length,
      maintenance: 0,
      general: 0,
      general_after_maintenance: 0,
      no_detail: 0,
    };
    for (const client of clients) {
      if (!client.smsTrack) counts.no_detail += 1;
      else if (client.smsTrack in counts) counts[client.smsTrack] += 1;
    }
    return counts;
  }, [clients]);

  const selectedClients = useMemo(
    () => clients.filter((client) => selectedIds.has(client.clientId)),
    [clients, selectedIds],
  );

  const selectedLanguageCounts = useMemo(() => {
    let en = 0;
    let fr = 0;
    for (const client of selectedClients) {
      if (client.preferredLanguage === "fr") fr += 1;
      else en += 1;
    }
    return { en, fr };
  }, [selectedClients]);

  const previewClient = useMemo(() => {
    const firstSelected = filteredClients.find((client) => selectedIds.has(client.clientId));
    return firstSelected ?? filteredClients[0] ?? null;
  }, [filteredClients, selectedIds]);

  const previewLanguage = previewClient?.preferredLanguage ?? activeMessageLanguage;

  const previewText = useMemo(
    () => buildPreview(messageBodyEn, messageBodyFr, previewClient, previewLanguage),
    [messageBodyEn, messageBodyFr, previewClient, previewLanguage],
  );

  const allVisibleSelected =
    filteredClients.length > 0 &&
    filteredClients.every((client) => selectedIds.has(client.clientId));

  function handlePresetChange(nextPresetId: string) {
    setPresetId(nextPresetId);
    const preset = MESSAGE_PRESETS.find((row) => row.id === nextPresetId);
    if (preset && preset.id !== "custom") {
      setMessageBodyEn(preset.en);
      setMessageBodyFr(preset.fr);
    }
  }

  const activeMessageBody = activeMessageLanguage === "fr" ? messageBodyFr : messageBodyEn;

  function setActiveMessageBody(value: string) {
    setPresetId("custom");
    if (activeMessageLanguage === "fr") setMessageBodyFr(value);
    else setMessageBodyEn(value);
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
        for (const client of filteredClients) next.delete(client.clientId);
        return next;
      });
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      for (const client of filteredClients) next.add(client.clientId);
      return next;
    });
  }

  async function handleSend() {
    if (!messageBodyEn.trim() && !messageBodyFr.trim()) {
      setError("Write at least one message (English or French) before sending.");
      return;
    }

    if (selectedIds.size === 0) {
      setError("Select at least one client.");
      return;
    }

    const { en, fr } = selectedLanguageCounts;
    const languageNote =
      en > 0 && fr > 0
        ? ` (${en} English, ${fr} French)`
        : fr > 0
          ? " (French)"
          : en > 0
            ? " (English)"
            : "";

    const confirmed = window.confirm(
      `Send to ${selectedIds.size} client${selectedIds.size === 1 ? "" : "s"}${languageNote}? Each person receives the message in their preferred language.`,
    );
    if (!confirmed) return;

    setSending(true);
    setError(null);
    setNotice(null);

    try {
      const result = await sendManualBulkSms(messageBodyEn, messageBodyFr, [...selectedIds]);
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
        client receives the <strong>English or French</strong> message based on their language
        preference on file. Each send is logged as <strong>Manual</strong> in the SMS log with a
        unique tracked booking link. Clients texted in the last <strong>6 days</strong> are skipped
        automatically. Sends are blocked outside <strong>1 PM – 7 PM Eastern</strong>.
      </p>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Message</h2>
        <div className="tab-row">
          <button
            type="button"
            className={activeMessageLanguage === "en" ? "btn" : "btn btn-secondary"}
            onClick={() => setActiveMessageLanguage("en")}
          >
            English SMS
          </button>
          <button
            type="button"
            className={activeMessageLanguage === "fr" ? "btn" : "btn btn-secondary"}
            onClick={() => setActiveMessageLanguage("fr")}
          >
            French SMS
          </button>
        </div>
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
          {activeMessageLanguage === "fr" ? "French message" : "English message"}
        </label>
        <textarea
          id="bulk-sms-body"
          value={activeMessageBody}
          onChange={(event) => setActiveMessageBody(event.target.value)}
          rows={6}
          style={{ width: "100%", marginTop: "0.35rem" }}
          placeholder={
            activeMessageLanguage === "fr"
              ? "Bonjour {prenom}, ..."
              : "Hi {first_name}, ..."
          }
        />

        <p className="muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          English variables: {MESSAGE_VARIABLES_EN.join(", ")}. French variables:{" "}
          {MESSAGE_VARIABLES_FR.join(", ")}. Pick the booking link that matches what you are
          promoting — <code>{`{booking_url_maintenance}`}</code> (maintenance),{" "}
          <code>{`{booking_url_general}`}</code> (general),{" "}
          <code>{`{booking_url_after_maintenance}`}</code> (after maintenance miss). Legacy{" "}
          <code>{`{booking_url}`}</code> defaults to maintenance. Each send gets a unique tracked
          ref. Opt-out footer is appended in the client&apos;s language.
        </p>

        {previewText && (
          <div style={{ marginTop: "1rem" }}>
            <div className="muted">
              Preview
              {previewClient
                ? ` (${previewClient.name}, ${previewClient.preferredLanguage === "fr" ? "French" : "English"})`
                : ""}
            </div>
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
          <select
            value={trackFilter}
            onChange={(event) => setTrackFilter(event.target.value as TrackFilter)}
            style={{ minWidth: 220 }}
            aria-label="Filter by SMS track"
          >
            {TRACK_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({trackCounts[option.value]})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={toggleSelectAllVisible}>
            {allVisibleSelected ? "Clear filter selection" : "Select all in filter"}
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

        {filteredClients.length === 0 ? (
          <p className="muted">
            {clients.length === 0
              ? "No clients with a phone number and SMS enabled."
              : "No clients match this filter."}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Client</th>
                <th>Language</th>
                <th>SMS track</th>
                <th>City</th>
                <th>Phone</th>
                <th>Last detail</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
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
                  <td>{client.preferredLanguage === "fr" ? "French" : "English"}</td>
                  <td>{client.smsTrackLabel}</td>
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
