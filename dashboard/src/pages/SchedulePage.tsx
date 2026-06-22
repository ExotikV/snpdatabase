import { useCallback, useEffect, useState } from "react";
import {
  MESSAGE_VARIABLES,
  ScheduleStep,
  createScheduleStep,
  deleteScheduleStep,
  fetchSchedule,
  saveSchedule,
} from "../lib/api";

const DEFAULT_MESSAGE =
  "Hi {first_name}, it has been {days_since} days since your last {service} on {last_detail_date}. Book your maintenance detail here: {booking_url}";

export default function SchedulePage() {
  const [steps, setSteps] = useState<ScheduleStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchSchedule();
      setSteps(data.steps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      await load();
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
        days_since_last_detail: 30,
        active: true,
        message_body: DEFAULT_MESSAGE,
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

  if (loading) {
    return <div className="loading">Loading schedule…</div>;
  }

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Maintenance detail pricing applies within 60 days of the last detail. Set each reminder
        step to fire after X days since their last completed service. Each SMS includes a tracked
        booking link ({`{booking_url}`}) with a unique ref for conversion attribution.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="panel" style={{ background: "#ecfdf3" }}>{message}</div>}

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
        </p>

        {steps.length === 0 ? (
          <p className="muted">No reminder steps configured.</p>
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
                      max={59}
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
    </>
  );
}
