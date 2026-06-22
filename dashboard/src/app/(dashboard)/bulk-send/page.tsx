"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox, FormField, Input, Textarea } from "@/components/ui/FormField";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";

type ClientRow = {
  id: string;
  name: string;
  phone: string;
  daysSinceDetail: number | null;
  lastDetailDate: string | null;
  enrolledInMaintenance: boolean;
};

type SendSummary = {
  totalSelected: number;
  sentCount: number;
  failedCount: number;
  failed: { name: string; reason?: string }[];
};

export default function BulkSendPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [minDaysSinceDetail, setMinDaysSinceDetail] = useState("0");
  const [maintenanceOnly, setMaintenanceOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<SendSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadClients() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        minDaysSinceDetail,
        maintenanceOnly: String(maintenanceOnly),
      });

      try {
        const response = await fetch(`/api/clients?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load clients");
        }
        setClients(data.clients);
        setSelectedIds((current) =>
          current.filter((id) => data.clients.some((client: ClientRow) => client.id === id)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load clients");
      } finally {
        setLoading(false);
      }
    }

    loadClients();
  }, [minDaysSinceDetail, maintenanceOnly]);

  const allVisibleSelected = useMemo(
    () => clients.length > 0 && clients.every((client) => selectedIds.includes(client.id)),
    [clients, selectedIds],
  );

  function toggleClient(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  const toggleAllVisible = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !clients.some((client) => client.id === id)),
      );
      return;
    }
    setSelectedIds((current) => [
      ...new Set([...current, ...clients.map((client) => client.id)]),
    ]);
  }, [allVisibleSelected, clients]);

  async function handleSend() {
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/bulk-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIds: selectedIds, message }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to send messages");
      }
      setSummary(data);
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send messages");
    } finally {
      setSending(false);
    }
  }

  const columns = useMemo(
    () => [
      {
        key: "select",
        header: (
          <Checkbox checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all visible clients" />
        ),
        className: "w-12",
        render: (client: ClientRow) => (
          <Checkbox
            checked={selectedIds.includes(client.id)}
            onChange={() => toggleClient(client.id)}
            aria-label={`Select ${client.name}`}
          />
        ),
      },
      {
        key: "name",
        header: "Client",
        render: (client: ClientRow) => <span className="font-medium">{client.name}</span>,
      },
      {
        key: "phone",
        header: "Phone",
        className: "whitespace-nowrap text-muted",
        render: (client: ClientRow) => client.phone || "—",
      },
      {
        key: "lastDetail",
        header: "Last detail",
        className: "whitespace-nowrap",
        render: (client: ClientRow) => client.lastDetailDate ?? "—",
      },
      {
        key: "daysSince",
        header: "Days since",
        render: (client: ClientRow) => client.daysSinceDetail ?? "—",
      },
      {
        key: "maintenance",
        header: "Maintenance",
        render: (client: ClientRow) => (
          <Badge variant={client.enrolledInMaintenance ? "success" : "muted"}>
            {client.enrolledInMaintenance ? "Enrolled" : "No"}
          </Badge>
        ),
      },
    ],
    [allVisibleSelected, selectedIds, toggleAllVisible],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Bulk Send"
        description="Select clients and send a custom SMS logged as bulk_manual."
      />

      <Card padding="md">
        <div className="grid gap-4 lg:grid-cols-2">
          <FormField label="Not detailed in at least (days)">
            <Input
              type="number"
              min="0"
              value={minDaysSinceDetail}
              onChange={(event) => setMinDaysSinceDetail(event.target.value)}
            />
          </FormField>
          <label className="flex items-end gap-3 pb-2 text-sm text-muted">
            <Checkbox
              checked={maintenanceOnly}
              onChange={(event) => setMaintenanceOnly(event.target.checked)}
            />
            Enrolled in maintenance program only
          </label>
        </div>
      </Card>

      <Card padding="md">
        <FormField label="Custom message" hint="This text is sent exactly as written to each selected client.">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            placeholder="Write your custom SMS message..."
          />
        </FormField>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={sending || selectedIds.length === 0 || !message.trim()}
          >
            Send to selected ({selectedIds.length})
          </Button>
          <p className="text-sm text-muted">
            {loading ? "Loading clients..." : `${clients.length} clients shown`}
          </p>
        </div>
      </Card>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {summary ? (
        <Alert variant="success">
          <p className="font-medium">Send summary</p>
          <p className="mt-1">
            Selected: {summary.totalSelected} · Sent: {summary.sentCount} · Failed:{" "}
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
        rows={clients}
        rowKey={(client) => client.id}
        loading={loading}
        loadingLabel="Loading clients..."
        emptyTitle="No clients match these filters"
        emptyDescription="Try lowering the day threshold or turning off maintenance-only filter."
      />

      <ConfirmModal
        open={confirmOpen}
        title="Send bulk SMS?"
        message={`You are about to send a custom message to ${selectedIds.length} client${selectedIds.length === 1 ? "" : "s"}. Confirm?`}
        confirmLabel="Send SMS"
        loading={sending}
        onConfirm={handleSend}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
