import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MESSAGE_VARIABLES_EN,
  MESSAGE_VARIABLES_FR,
  ReviewSmsDueClient,
  ReviewSmsSentRow,
  ReviewSmsSettings,
  fetchReviewSms,
  saveReviewSmsSettings,
} from "../lib/api";
import { getFirstName, renderMessageTemplate } from "../../../lib/message-template.js";

const DELAY_OPTIONS = [
  { value: 30, label: "30 minutes after detail" },
  { value: 60, label: "1 hour after detail" },
  { value: 120, label: "2 hours after detail" },
];

type MessageLanguage = "en" | "fr";

function pickMessageForLanguage(messageEn: string, messageFr: string, language: MessageLanguage) {
  if (language === "fr") return messageFr.trim() || messageEn.trim();
  return messageEn.trim() || messageFr.trim();
}

function buildPreview(
  messageEn: string,
  messageFr: string,
  reviewUrl: string,
  language: MessageLanguage,
) {
  const template = pickMessageForLanguage(messageEn, messageFr, language);
  if (!template) return "";

  return renderMessageTemplate(template, {
    name: language === "fr" ? "Alex Martin" : "Alex Martin",
    firstName: getFirstName("Alex Martin"),
    serviceType: "Interior + Exterior",
    lastDetailDate: "2026-06-21",
    daysSince: 0,
    reviewUrl: reviewUrl.trim() || "https://example.com/review",
  });
}

function formatDelay(minutes: number) {
  if (minutes === 30) return "30 minutes";
  if (minutes === 60) return "1 hour";
  if (minutes === 120) return "2 hours";
  return `${minutes} minutes`;
}

export default function ReviewSmsPage() {
  const [settings, setSettings] = useState<ReviewSmsSettings | null>(null);
  const [sentHistory, setSentHistory] = useState<ReviewSmsSentRow[]>([]);
  const [dueNow, setDueNow] = useState<ReviewSmsDueClient[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [productionSendsEnabled, setProductionSendsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeMessageLanguage, setActiveMessageLanguage] = useState<MessageLanguage>("en");

  const [active, setActive] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState(60);
  const [reviewUrl, setReviewUrl] = useState("");
  const [messageBodyEn, setMessageBodyEn] = useState("");
  const [messageBodyFr, setMessageBodyFr] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchReviewSms();
      setSettings(data.settings);
      setSentHistory(data.sentHistory);
      setDueNow(data.dueNow);
      setDueCount(data.dueCount);
      setSentCount(data.sentCount);
      setProductionSendsEnabled(data.productionSendsEnabled);
      setActive(data.settings.active);
      setDelayMinutes(data.settings.delayMinutes);
      setReviewUrl(data.settings.reviewUrl);
      setMessageBodyEn(data.settings.messageBodyEn);
      setMessageBodyFr(data.settings.messageBodyFr);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review SMS settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const previewEn = useMemo(
    () => buildPreview(messageBodyEn, messageBodyFr, reviewUrl, "en"),
    [messageBodyEn, messageBodyFr, reviewUrl],
  );

  const previewFr = useMemo(
    () => buildPreview(messageBodyEn, messageBodyFr, reviewUrl, "fr"),
    [messageBodyEn, messageBodyFr, reviewUrl],
  );

  const previewText = activeMessageLanguage === "fr" ? previewFr : previewEn;
  const activeMessageBody = activeMessageLanguage === "fr" ? messageBodyFr : messageBodyEn;

  function setActiveMessageBody(value: string) {
    if (activeMessageLanguage === "fr") setMessageBodyFr(value);
    else setMessageBodyEn(value);
  }

  async function handleSave() {
    if (!messageBodyEn.trim() && !messageBodyFr.trim()) {
      setError("Write at least one message (English or French) before saving.");
      return;
    }

    if (active && !reviewUrl.trim()) {
      setError("Add your review link URL before enabling review SMS.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const result = await saveReviewSmsSettings({
        active,
        delayMinutes,
        reviewUrl,
        messageBodyEn,
        messageBodyFr,
      });
      setSettings(result.settings);
      setNotice("Review SMS settings saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !settings) {
    return <div className="loading">Loading review SMS…</div>;
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

      {settings?.migrationRequired && (
        <div className="error-banner">
          Run <code>schema/review_sms_settings.sql</code> and <code>schema/sms_log_review.sql</code>{" "}
          in Supabase before using review SMS.
        </div>
      )}

      {!productionSendsEnabled && (
        <div
          className="error-banner"
          style={{ background: "#fff8e6", color: "#7a5c00", borderColor: "#fde68a" }}
        >
          Production SMS sends are disabled. Set <code>SMS_PRODUCTION_SENDS_ENABLED=true</code> on
          Netlify for automatic review texts.
        </div>
      )}

      <h2 className="section-title">Review SMS</h2>
      <p className="muted section-intro">
        Automatically text clients once after a completed detail, asking for a review. Each client
        receives this <strong>only one time ever</strong> — even if they book again later. Checks
        every 15 minutes; sends when the chosen delay has passed since appointment end.
      </p>

      <div className="card-grid" style={{ marginBottom: "1.25rem" }}>
        <div className="card">
          <div className="card-label">Status</div>
          <div className="card-value">{active ? "Active" : "Off"}</div>
        </div>
        <div className="card">
          <div className="card-label">Delay</div>
          <div className="card-value">{formatDelay(delayMinutes)}</div>
        </div>
        <div className="card">
          <div className="card-label">Sent (lifetime)</div>
          <div className="card-value">{sentCount}</div>
        </div>
        <div className="card">
          <div className="card-label">Due now</div>
          <div className="card-value">{dueCount}</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ marginTop: 0 }}>Settings</h2>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Enable automatic review SMS
        </label>

        <label className="muted" htmlFor="review-delay">
          Send delay after detail ends
        </label>
        <select
          id="review-delay"
          value={delayMinutes}
          onChange={(event) => setDelayMinutes(Number(event.target.value))}
          style={{ display: "block", width: "100%", maxWidth: 360, marginBottom: "1rem" }}
        >
          {DELAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className="muted" htmlFor="review-url">
          Review link URL
        </label>
        <input
          id="review-url"
          type="url"
          value={reviewUrl}
          onChange={(event) => setReviewUrl(event.target.value)}
          placeholder="https://g.page/r/..."
          style={{ display: "block", width: "100%", marginBottom: "1rem" }}
        />

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

        <label className="muted" htmlFor="review-message">
          {activeMessageLanguage === "fr" ? "French message" : "English message"}
        </label>
        <textarea
          id="review-message"
          value={activeMessageBody}
          onChange={(event) => setActiveMessageBody(event.target.value)}
          rows={5}
          style={{ width: "100%", marginTop: "0.35rem" }}
        />

        <p className="muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          Use <code>{`{review_url}`}</code> / <code>{`{lien_avis}`}</code> for the review link. Other
          variables: {MESSAGE_VARIABLES_EN.filter((v) => v.includes("review") === false).slice(0, 5).join(", ")}
          , etc. Opt-out footer is appended automatically.
        </p>

        {previewText && (
          <div style={{ marginTop: "1rem" }}>
            <div className="muted">
              Preview ({activeMessageLanguage === "fr" ? "French" : "English"})
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

        <button
          type="button"
          className="btn"
          style={{ marginTop: "1rem" }}
          disabled={saving || settings?.migrationRequired}
          onClick={handleSave}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>

        {settings?.activeSince && (
          <p className="muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
            Only details completed after{" "}
            {new Date(settings.activeSince).toLocaleString("en-CA", {
              timeZone: "America/Toronto",
            })}{" "}
            Eastern qualify (prevents backfilling old clients when you turn this on).
          </p>
        )}
      </div>

      {dueNow.length > 0 && (
        <div className="panel" style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>Due now ({dueNow.length})</h2>
          <p className="muted section-intro">
            These clients finished a detail, passed the delay, and have never received a review SMS.
            The next scheduled run will send automatically.
          </p>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Language</th>
                <th>Detail ended</th>
                <th>Elapsed</th>
              </tr>
            </thead>
            <tbody>
              {dueNow.slice(0, 20).map((client) => (
                <tr key={client.clientId}>
                  <td>{client.name ?? "—"}</td>
                  <td>{client.preferredLanguage === "fr" ? "French" : "English"}</td>
                  <td>{new Date(client.completedAt).toLocaleString("en-CA", { timeZone: "America/Toronto" })}</td>
                  <td>{client.minutesSinceDetail} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Sent review SMS</h2>
        <p className="muted section-intro">
          Lifetime log — each client appears here at most once with status <strong>sent</strong>.
          Failed attempts can be retried until one succeeds; after that, never again.
        </p>

        {sentHistory.length === 0 ? (
          <p className="muted">No review SMS sent yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Sent at</th>
              </tr>
            </thead>
            <tbody>
              {sentHistory.map((row) => (
                <tr key={row.smsLogId}>
                  <td>{row.clientName ?? "—"}</td>
                  <td>{row.phone ?? "—"}</td>
                  <td>{row.status}</td>
                  <td>
                    {row.sentAt
                      ? new Date(row.sentAt).toLocaleString("en-CA", { timeZone: "America/Toronto" })
                      : row.status === "failed"
                        ? row.errorMessage ?? "Failed"
                        : "—"}
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
