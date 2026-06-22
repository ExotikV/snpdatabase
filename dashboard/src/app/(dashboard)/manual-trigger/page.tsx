"use client";

import { useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { buildMaintenanceReminderMessage } from "@/lib/reminder-message";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { SmsPreviewCell } from "@/components/ui/MessagePreview";

type EligibleClient = {
  clientId: string;
  name: string;
  phone: string | null;
  lastDetailDate: string;
  lastServiceType: string | null;
  daysSince: number;
  sequenceNumber: number;
  messageBody: string;
};

type SendSummary = {
  totalEligible: number;
  sentCount: number;
  failedCount: number;
  sent: { name: string }[];
  failed: { name: string; reason?: string }[];
};

export default function ManualTriggerPage() {
  const [eligible, setEligible] = useState<EligibleClient[]>([]);
  const [scheduleText, setScheduleText] = useState("");
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<SendSummary | null>(null);
  const [error, setError] = useState("");

  async function handleCheckEligibility() {
    setChecking(true);
    setError("");
    setSummary(null);
    try {
      const response = await fetch("/api/eligibility");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to check eligibility");
      }
      setEligible(data.eligible);
      setScheduleText(
        data.schedule.length > 0
          ? data.schedule
              .map(
                (step: { sequenceNumber: number; daysSinceLastDetail: number }) =>
                  `Step ${step.sequenceNumber}: ${step.daysSinceLastDetail} days`,
              )
              .join(" · ")
          : "No active steps configured",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check eligibility");
    } finally {
      setChecking(false);
    }
  }

  async function handleSendReminders() {
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/send-reminders", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to send reminders");
      }
      setSummary(data);
      setConfirmOpen(false);
      await handleCheckEligibility();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reminders");
    } finally {
      setSending(false);
    }
  }

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Client",
        render: (client: EligibleClient) => (
          <span className="font-medium">{client.name}</span>
        ),
      },
      {
        key: "phone",
        header: "Phone",
        className: "whitespace-nowrap text-muted",
        render: (client: EligibleClient) => client.phone ?? "—",
      },
      {
        key: "lastDetail",
        header: "Last detail",
        className: "whitespace-nowrap",
        render: (client: EligibleClient) => client.lastDetailDate,
      },
      {
        key: "daysSince",
        header: "Days since",
        render: (client: EligibleClient) => client.daysSince,
      },
      {
        key: "service",
        header: "Service",
        className: "text-muted",
        render: (client: EligibleClient) => client.lastServiceType ?? "—",
      },
      {
        key: "step",
        header: "Step",
        render: (client: EligibleClient) => (
          <Badge variant="accent">Step {client.sequenceNumber}</Badge>
        ),
      },
      {
        key: "preview",
        header: "SMS preview",
        className: "min-w-[220px]",
        render: (client: EligibleClient) => (
          <SmsPreviewCell
            text={buildMaintenanceReminderMessage({
              messageBody: client.messageBody,
              clientName: client.name,
              smsLogId: "preview",
              serviceType: client.lastServiceType,
              lastDetailDate: client.lastDetailDate,
              daysSince: client.daysSince,
              sequenceNumber: client.sequenceNumber,
            })}
          />
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Manual Trigger"
        description="Check eligibility and send real maintenance reminder SMS to due clients."
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleCheckEligibility} disabled={checking || sending}>
              {checking ? "Checking..." : "Check eligibility"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(true)}
              disabled={checking || sending || eligible.length === 0}
            >
              Send reminders ({eligible.length})
            </Button>
          </div>
        }
      />

      {scheduleText ? (
        <Card padding="sm" className="text-sm text-muted">
          <span className="font-medium text-foreground">Active schedule: </span>
          {scheduleText}
        </Card>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}

      {summary ? (
        <Alert variant="success">
          <p className="font-medium">Send summary</p>
          <p className="mt-1">
            Total eligible: {summary.totalEligible} · Sent: {summary.sentCount} · Failed:{" "}
            {summary.failedCount}
          </p>
          {summary.failed.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {summary.failed.map((item) => (
                <li key={item.name}>
                  {item.name}
                  {item.reason ? `: ${item.reason}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <DataTable
        columns={columns}
        rows={eligible}
        rowKey={(client) => client.clientId}
        loading={checking}
        loadingLabel="Checking eligibility..."
        emptyTitle="No eligible clients yet"
        emptyDescription='Click "Check eligibility" to find clients due for a maintenance reminder.'
      />

      <ConfirmModal
        open={confirmOpen}
        title="Send maintenance reminders?"
        message={`You are about to send real SMS to ${eligible.length} client${eligible.length === 1 ? "" : "s"}. Confirm?`}
        confirmLabel="Send SMS"
        loading={sending}
        onConfirm={handleSendReminders}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
