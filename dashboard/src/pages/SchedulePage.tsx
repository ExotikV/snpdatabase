import { useCallback, useEffect, useState } from "react";
import {
  MESSAGE_VARIABLES,
  ScheduleStep,
  createScheduleStep,
  deleteScheduleStep,
  fetchSchedule,
  fetchTestPhone,
  saveSchedule,
  sendTestSms,
} from "../lib/api";

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

export default function SchedulePage() {
  const [activeTrack, setActiveTrack] = useState<Track>("maintenance");
  const [steps, setSteps] = useState<ScheduleStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState<string | null>(null);
  const [testingStepId, setTestingStepId] = useState<string | null>(null);

  const load = useCallback(async (track: Track) => {
    setError(null);
    setLoading(true);
    try {
      const [scheduleData, testPhoneData] = await Promise.all([
        fetchSchedule(track),
        fetchTestPhone(),
      ]);
      setSteps(scheduleData.steps.filter((step) => step.track === track));
      setTestPhone(testPhoneData.testPhone);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(activeTrack);
  }, [activeTrack, load]);

  function updateStep(id: string, patch: Partial<ScheduleStep>) {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveSchedule(steps);
      setMessage("Schedule saved.");
      await load(activeTrack);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddStep() {
    setError(null);
    try {
      const { step } = await createScheduleStep({
        track: activeTrack,
        days_since_last_detail: activeTrack === "maintenance" ? 30 : 60,
        active: true,
        message_body: DEFAULT_MESSAGES[activeTrack],
      });
      setSteps((current) => [...current, step]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add step");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this reminder step?")) return;
    setError(null);
    try {
      await deleteScheduleStep(id);
      setSteps((current) => current.filter((step) => step.id !== id));
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
        days_since_last_detail: step.days_since_last_detail,
        track: activeTrack,
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

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="panel" style={{ background: "#ecfdf3" }}>{message}</div>}

      {loading ? (
        <div className="loading">Loading schedule…</div>
      ) : (
        <div className="panel">
          <div className="inline-actions" style={{ marginBottom: "1rem" }}>
            <button type="button" className="btn btn-secondary" onClick={handleAddStep}>
              Add step
            </button>
            <button type="button" className="btn" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save all changes"}
            </button>
          </div>

          <p className="help-text" style={{ marginBottom: "1rem" }}>
            Available variables: {MESSAGE_VARIABLES.join(", ")}
            {testPhone && (
              <>
                {" "}
                · Test SMS sends to <strong>{testPhone}</strong>
              </>
            )}
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
