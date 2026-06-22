"use client";

import { useCallback, useEffect, useState } from "react";
import {
  insertVariableIntoMessage,
  previewReminderMessage,
  REMINDER_MESSAGE_VARIABLES,
} from "@/lib/reminder-message";
import { Alert, LoadingState } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox, FormField, Input, Textarea } from "@/components/ui/FormField";
import {
  MessagePreview,
  VariableChips,
} from "@/components/ui/MessagePreview";
import { PageHeader } from "@/components/ui/PageHeader";

type ScheduleRow = {
  id: string;
  sequenceNumber: number;
  daysSinceLastDetail: number;
  active: boolean;
  messageBody: string;
};

type VariableOption = {
  key: string;
  description: string;
};

type DraftRow = ScheduleRow;

function rowsEqual(a: DraftRow, b: ScheduleRow) {
  return (
    a.daysSinceLastDetail === b.daysSinceLastDetail &&
    a.active === b.active &&
    a.messageBody === b.messageBody
  );
}

export default function ReminderSchedulePage() {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [variables, setVariables] = useState<VariableOption[]>(
    REMINDER_MESSAGE_VARIABLES.map((item) => ({ ...item })),
  );
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/reminder-schedule");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load reminder schedule");
      }
      const loaded = data.rows as ScheduleRow[];
      setRows(loaded);
      if (Array.isArray(data.variables) && data.variables.length > 0) {
        setVariables(data.variables as VariableOption[]);
      }
      setDrafts(Object.fromEntries(loaded.map((row) => [row.id, { ...row }])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reminder schedule");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (!success) {
      return;
    }
    const timer = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  function updateDraft(id: string, patch: Partial<DraftRow>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  }

  function insertVariable(id: string, variableKey: string) {
    const draft = drafts[id];
    if (!draft) {
      return;
    }
    updateDraft(id, {
      messageBody: insertVariableIntoMessage(draft.messageBody, variableKey),
    });
  }

  async function saveRow(id: string) {
    const draft = drafts[id];
    const saved = rows.find((row) => row.id === id);
    if (!draft || !saved || rowsEqual(draft, saved)) {
      return;
    }

    if (!draft.messageBody.trim()) {
      setError("Message body cannot be empty.");
      return;
    }

    setSavingId(id);
    setError("");
    try {
      const response = await fetch("/api/reminder-schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          daysSinceLastDetail: draft.daysSinceLastDetail,
          active: draft.active,
          messageBody: draft.messageBody,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save step");
      }
      setSuccess(`Step ${draft.sequenceNumber} saved.`);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save step");
    } finally {
      setSavingId(null);
    }
  }

  async function deactivateRow(id: string) {
    const draft = drafts[id];
    if (!draft) {
      return;
    }

    setSavingId(id);
    setError("");
    try {
      const response = await fetch("/api/reminder-schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active: false }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to deactivate step");
      }
      setSuccess(`Step ${draft.sequenceNumber} deactivated.`);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate step");
    } finally {
      setSavingId(null);
    }
  }

  async function addStep() {
    setAdding(true);
    setError("");
    try {
      const response = await fetch("/api/reminder-schedule", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to add step");
      }
      setSuccess(`Step ${data.row.sequenceNumber} added.`);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add step");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reminder Schedule"
        description="Set timing and customize the SMS text for each maintenance reminder step."
      />

      <Card padding="md" className="space-y-4">
        <p className="text-sm leading-relaxed text-muted">
          Clients receive a reminder at each active step below, counted in days since
          their last completed detail. Steps fire in order — step 2 only after step 1
          has been sent.
        </p>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            Available variables
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {variables.map((variable) => (
              <li key={variable.key} className="text-sm text-muted">
                <code className="rounded-md bg-muted-bg px-2 py-0.5 font-mono text-xs text-foreground">{`{${variable.key}}`}</code>
                <span className="ml-2">{variable.description}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Include{" "}
            <code className="rounded-md bg-muted-bg px-1.5 py-0.5 font-mono text-xs">{`{booking_url}`}</code>{" "}
            for tracked conversion links. Preview uses sample client data.
          </p>
        </div>
      </Card>

      {success ? <Alert variant="success">{success}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <Card>
          <LoadingState label="Loading reminder schedule..." />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-muted">No steps configured yet.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const draft = drafts[row.id] ?? row;
            const dirty = !rowsEqual(draft, row);
            const isSaving = savingId === row.id;

            return (
              <Card
                key={row.id}
                padding="md"
                className={!row.active ? "border-dashed opacity-90" : ""}
              >
                <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                      Step {row.sequenceNumber}
                    </h2>
                    {!row.active ? <Badge variant="muted">Inactive</Badge> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 sm:ml-auto">
                    <FormField label="Days since last detail" className="w-auto">
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        className="w-24"
                        value={draft.daysSinceLastDetail}
                        onChange={(event) =>
                          updateDraft(row.id, {
                            daysSinceLastDetail: Number(event.target.value),
                          })
                        }
                      />
                    </FormField>
                    <label className="flex items-center gap-2 pb-1 text-sm text-muted">
                      <Checkbox
                        checked={draft.active}
                        onChange={(event) =>
                          updateDraft(row.id, { active: event.target.checked })
                        }
                      />
                      Active
                    </label>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <FormField label="SMS message">
                    <Textarea
                      value={draft.messageBody}
                      onChange={(event) =>
                        updateDraft(row.id, { messageBody: event.target.value })
                      }
                      rows={4}
                    />
                  </FormField>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      Insert variable
                    </p>
                    <VariableChips
                      variables={variables}
                      onInsert={(key) => insertVariable(row.id, key)}
                    />
                  </div>
                  <MessagePreview text={previewReminderMessage(draft.messageBody)} />
                </div>

                <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                  <Button onClick={() => saveRow(row.id)} disabled={!dirty || isSaving}>
                    {isSaving ? "Saving..." : "Save changes"}
                  </Button>
                  {row.active ? (
                    <Button
                      variant="danger"
                      onClick={() => deactivateRow(row.id)}
                      disabled={isSaving}
                    >
                      Deactivate
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Button variant="secondary" onClick={addStep} disabled={adding || loading}>
        {adding ? "Adding..." : "Add a new step"}
      </Button>
    </div>
  );
}
