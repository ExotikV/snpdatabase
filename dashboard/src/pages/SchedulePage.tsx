import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MESSAGE_VARIABLES,
  ScheduleStep,
  TestSmsClient,
  createScheduleStep,
  deleteScheduleStep,
  fetchSchedule,
  fetchTestSmsOptions,
  saveSchedule,
  sendTestSms,
} from "../lib/api";
import { formatDetailDate, toDateInputValue } from "../../../lib/message-template.js";
import { formatServiceLabel } from "../../../lib/service-labels.js";

type Track = "maintenance" | "general";

const DEFAULT_MESSAGES: Record<Track, string> = {
  maintenance:
    "Hi {first_name}, it has been {days_since} days since your last {service} on {last_detail_date}. Book your maintenance detail here: {booking_url}",
  general:
    "Hi {first_name}, book your next SNP Detailing visit here: {booking_url}",
};

const TRACK_DESCRIPTIONS: Record<Track, string> = {
  maintenance:
    "Maintenance detail — service-area cities only, and last detail within 60 days.",
  general:
    "Regular detail — all cities. Anyone not on the maintenance track (any location, past the 60-day window, or no recent detail).",
};

const AUTO_SAVE_DELAY_MS = 800;

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

function stepsSnapshot(steps: ScheduleStep[]) {
  return JSON.stringify(
    steps.map((step) => ({
      id: step.id,
      track: step.track,
      sequence_number: step.sequence_number,
      days_since_last_detail: step.days_since_last_detail,
      active: step.active,
      message_body: step.message_body,
    })),
  );
}

function daysSinceDate(dateValue: string) {
  if (!dateValue) return 30;
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 30;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function previewMessage(
  template: string,
  vars: {
    name: string;
    rawService: string;
    lastDetailDate: string;
    daysSince: number;
  },
) {
  const firstName = vars.name.trim().split(/\s+/)[0] || "there";
  const service = formatServiceLabel(vars.rawService);
  return template
    .replace(/\{name\}/g, vars.name)
    .replace(/\{first_name\}/g, firstName)
    .replace(/\{service\}/g, service)
    .replace(/\{last_detail_date\}/g, formatDetailDate(vars.lastDetailDate))
    .replace(/\{days_since\}/g, String(vars.daysSince))
    .replace(/\{booking_url\}/g, "https://example.com/book?ref=test");
}

export default function SchedulePage() {
  const [activeTrack, setActiveTrack] = useState<Track>("maintenance");
  const [steps, setSteps] = useState<ScheduleStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState<string | null>(null);
  const [testClients, setTestClients] = useState<TestSmsClient[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [testName, setTestName] = useState("Test Client");
  const [testService, setTestService] = useState("Interior + Exterior");
  const [testLastDetailDate, setTestLastDetailDate] = useState("");
  const [testDaysSince, setTestDaysSince] = useState(30);
  const [testingStepId, setTestingStepId] = useState<string | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const lastSavedSnapshotRef = useRef("");
  const saveVersionRef = useRef(0);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const loadTestClients = useCallback(async (search: string) => {
    const data = await fetchTestSmsOptions(search);
    setTestPhone(data.testPhone);
    setTestClients(data.clients);
  }, []);

  const load = useCallback(async (track: Track) => {
    setError(null);
    setSaveStatus("idle");
    setLoading(true);
    try {
      const [scheduleData] = await Promise.all([fetchSchedule(track), loadTestClients("")]);
      const loadedSteps = scheduleData.steps.filter((step) => step.track === track);
      lastSavedSnapshotRef.current = stepsSnapshot(loadedSteps);
      setSteps(loadedSteps);
      setMigrationRequired(Boolean(scheduleData.migrationRequired));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, [loadTestClients]);

  useEffect(() => {
    load(activeTrack);
  }, [activeTrack, load]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadTestClients(clientSearch).catch(() => {
        // keep existing list on search failure
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [clientSearch, loadTestClients]);

  useEffect(() => {
    if (loading || migrationRequired || steps.length === 0) {
      return;
    }

    const snapshot = stepsSnapshot(steps);
    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }

    const version = ++saveVersionRef.current;
    setSaveStatus("pending");

    const timeoutId = window.setTimeout(() => {
      const stepsToSave = stepsRef.current;
      const snapshotToSave = stepsSnapshot(stepsToSave);

      void (async () => {
        setSaveStatus("saving");
        try {
          await saveSchedule(stepsToSave);
          if (saveVersionRef.current === version) {
            lastSavedSnapshotRef.current = snapshotToSave;
            setSaveStatus("saved");
            setError(null);
          }
        } catch (err) {
          if (saveVersionRef.current === version) {
            setSaveStatus("error");
            setError(err instanceof Error ? err.message : "Failed to save");
          }
        }
      })();
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [steps, loading, migrationRequired]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timeoutId = window.setTimeout(() => setSaveStatus("idle"), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [saveStatus]);

  function updateStep(id: string, patch: Partial<ScheduleStep>) {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  }

  function handleSelectClient(clientId: string) {
    setSelectedClientId(clientId);
    if (!clientId) return;

    const client = testClients.find((row) => row.clientId === clientId);
    if (!client) return;

    setTestName(client.name ?? "Test Client");
    setTestService(client.lastServiceType ?? "detail");
    const dateValue = toDateInputValue(client.lastDetailDate);
    setTestLastDetailDate(dateValue);
    setTestDaysSince(
      client.daysSince ?? (dateValue ? daysSinceDate(dateValue) : testDaysSince),
    );
  }

  function handleLastDetailDateChange(dateValue: string) {
    setTestLastDetailDate(dateValue);
    if (dateValue) {
      setTestDaysSince(daysSinceDate(dateValue));
    }
  }

  const testPreviewTemplate = useMemo(() => {
    const firstStep = steps.find((step) => step.message_body?.trim());
    return firstStep?.message_body ?? DEFAULT_MESSAGES[activeTrack];
  }, [steps, activeTrack]);

  const testPreview = useMemo(
    () =>
      previewMessage(testPreviewTemplate, {
        name: testName,
        rawService: testService,
        lastDetailDate: testLastDetailDate || "2026-01-01",
        daysSince: testDaysSince,
      }),
    [testPreviewTemplate, testName, testService, testLastDetailDate, testDaysSince],
  );

  const saveStatusLabel = useMemo(() => {
    if (migrationRequired) return "Run the database migration to enable saving";
    if (saveStatus === "pending") return "Unsaved changes…";
    if (saveStatus === "saving") return "Saving…";
    if (saveStatus === "saved") return "Saved";
    if (saveStatus === "error") return "Save failed";
    return null;
  }, [migrationRequired, saveStatus]);

  async function handleAddStep() {
    setError(null);
    try {
      const { step } = await createScheduleStep({
        track: activeTrack,
        days_since_last_detail: activeTrack === "maintenance" ? 30 : 60,
        active: true,
        message_body: DEFAULT_MESSAGES[activeTrack],
      });
      setSteps((current) => {
        const next = [...current, step];
        lastSavedSnapshotRef.current = stepsSnapshot(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add step");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this reminder step?")) return;
    setError(null);
    try {
      await deleteScheduleStep(id);
      setSteps((current) => {
        const next = current.filter((step) => step.id !== id);
        lastSavedSnapshotRef.current = stepsSnapshot(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete step");
    }
  }

  async function handleTestSms(step: ScheduleStep) {
    setTestingStepId(step.id);
    setError(null);
    setMessage(null);
    try {
      const result = await sendTestSms({
        message_body: step.message_body ?? DEFAULT_MESSAGES[activeTrack],
        track: activeTrack,
        client_name: testName,
        service_type: testService,
        last_detail_date: testLastDetailDate || undefined,
        days_since: testDaysSince,
      });
      if (result.ok) {
        setMessage(`Test SMS sent to ${result.to}.`);
      } else {
        setError(result.reason ?? "Test SMS failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test SMS failed");
    } finally {
      setTestingStepId(null);
    }
  }

  return (
    <>
      <div className="inline-actions" style={{ marginBottom: "1rem" }}>
        <button
          type="button"
          className={activeTrack === "maintenance" ? "btn" : "btn btn-secondary"}
          onClick={() => setActiveTrack("maintenance")}
        >
          Maintenance sequence
        </button>
        <button
          type="button"
          className={activeTrack === "general" ? "btn" : "btn btn-secondary"}
          onClick={() => setActiveTrack("general")}
        >
          General sequence
        </button>
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        {TRACK_DESCRIPTIONS[activeTrack]} All clients receive SMS on one track or the other —
        never both at once.
      </p>

      {migrationRequired && (
        <div className="error-banner" style={{ background: "#fff8e6", color: "#7a5c00", borderColor: "#fde68a" }}>
          Database update needed: run <code>schema/reminder_schedule_track.sql</code> in the
          Supabase SQL Editor to enable saving both sequences.
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="panel" style={{ background: "#ecfdf3" }}>{message}</div>}

      <div className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>Test SMS settings</h2>
        <p className="help-text" style={{ marginBottom: "1rem" }}>
          Choose a client to fill in sample data, or edit the fields manually. Used by every{" "}
          <strong>Send test SMS</strong> button below
          {testPhone ? (
            <>
              {" "}
              · sends to <strong>{testPhone}</strong>
            </>
          ) : null}
          .
        </p>

        <div className="form-row two-col">
          <label>
            Search client
            <input
              type="search"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Type a name…"
            />
          </label>
          <label>
            Select client
            <select
              value={selectedClientId}
              onChange={(e) => handleSelectClient(e.target.value)}
            >
              <option value="">Custom / manual</option>
              {testClients.map((client) => (
                <option key={client.clientId} value={client.clientId}>
                  {client.name ?? "(no name)"}
                  {client.city ? ` · ${client.city}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-row two-col">
          <label>
            Client name
            <input
              type="text"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
            />
          </label>
          <label>
            Last service (Square name)
            <input
              type="text"
              value={testService}
              onChange={(e) => setTestService(e.target.value)}
            />
          </label>
        </div>

        <div className="form-row two-col">
          <label>
            Last detail date
            <input
              type="date"
              value={testLastDetailDate}
              onChange={(e) => handleLastDetailDateChange(e.target.value)}
            />
          </label>
          <label>
            Days since last detail
            <input
              type="number"
              min={0}
              value={testDaysSince}
              onChange={(e) => setTestDaysSince(Number(e.target.value))}
            />
          </label>
        </div>

        <label className="form-row">
          Preview (first step template)
          <textarea readOnly value={testPreview} rows={4} style={{ background: "#f8f9fa" }} />
        </label>
      </div>

      {loading ? (
        <div className="loading">Loading schedule…</div>
      ) : (
        <div className="panel">
          <div className="inline-actions" style={{ marginBottom: "1rem" }}>
            <button type="button" className="btn btn-secondary" onClick={handleAddStep}>
              Add step
            </button>
            {saveStatusLabel && (
              <span
                className="muted"
                style={{
                  alignSelf: "center",
                  color: saveStatus === "error" ? "#b42318" : undefined,
                }}
              >
                {saveStatusLabel}
              </span>
            )}
          </div>

          <p className="help-text" style={{ marginBottom: "1rem" }}>
            Available variables: {MESSAGE_VARIABLES.join(", ")}. Changes save automatically.
          </p>

          {steps.length === 0 ? (
            <p className="muted">No steps configured for this sequence.</p>
          ) : (
            steps
              .slice()
              .sort((a, b) => a.sequence_number - b.sequence_number)
              .map((step) => (
                <div className="schedule-step" key={step.id}>
                  <div className="schedule-step-header">
                    <label>
                      Step #
                      <input
                        type="number"
                        min={1}
                        value={step.sequence_number}
                        onChange={(e) =>
                          updateStep(step.id, { sequence_number: Number(e.target.value) })
                        }
                        style={{ width: 70, marginLeft: 8 }}
                      />
                    </label>
                    <label>
                      Days since last detail
                      <input
                        type="number"
                        min={1}
                        value={step.days_since_last_detail}
                        onChange={(e) =>
                          updateStep(step.id, {
                            days_since_last_detail: Number(e.target.value),
                          })
                        }
                        style={{ width: 80, marginLeft: 8 }}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={step.active}
                        onChange={(e) => updateStep(step.id, { active: e.target.checked })}
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={testingStepId === step.id}
                      onClick={() => handleTestSms(step)}
                    >
                      {testingStepId === step.id ? "Sending…" : "Send test SMS"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => handleDelete(step.id)}
                    >
                      Delete
                    </button>
                  </div>
                  <label className="form-row">
                    Message
                    <textarea
                      value={step.message_body ?? ""}
                      onChange={(e) => updateStep(step.id, { message_body: e.target.value })}
                    />
                  </label>
                </div>
              ))
          )}
        </div>
      )}
    </>
  );
}
