"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, statusBadgeVariant } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { FormField, Select } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";

type SmsLogRow = {
  id: string;
  clientName: string;
  phone: string;
  triggerType: string;
  status: string;
  sentAt: string | null;
  converted: boolean;
};

export default function SmsLogPage() {
  const [rows, setRows] = useState<SmsLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [triggerType, setTriggerType] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRows() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        page: String(page),
        sort,
      });
      if (triggerType) {
        params.set("trigger_type", triggerType);
      }
      if (status) {
        params.set("status", status);
      }

      try {
        const response = await fetch(`/api/sms-log?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load SMS log");
        }
        setRows(data.rows);
        setTotalPages(data.totalPages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load SMS log");
      } finally {
        setLoading(false);
      }
    }

    loadRows();
  }, [page, triggerType, status, sort]);

  const columns = useMemo(
    () => [
      {
        key: "client",
        header: "Client",
        render: (row: SmsLogRow) => (
          <span className="font-medium">{row.clientName}</span>
        ),
      },
      {
        key: "phone",
        header: "Phone",
        className: "whitespace-nowrap text-muted",
        render: (row: SmsLogRow) => row.phone || "—",
      },
      {
        key: "trigger",
        header: "Trigger",
        render: (row: SmsLogRow) => (
          <Badge variant="accent">{row.triggerType}</Badge>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row: SmsLogRow) => (
          <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
        ),
      },
      {
        key: "sentAt",
        header: "Sent at",
        className: "whitespace-nowrap text-muted",
        render: (row: SmsLogRow) =>
          row.sentAt ? new Date(row.sentAt).toLocaleString() : "—",
      },
      {
        key: "converted",
        header: "Converted",
        render: (row: SmsLogRow) => (
          <Badge variant={row.converted ? "success" : "muted"}>
            {row.converted ? "Yes" : "No"}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="SMS Log"
        description="Complete send history from sms_log with filters and pagination."
      />

      <Card padding="md">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Trigger type">
            <Select
              value={triggerType}
              onChange={(event) => {
                setPage(1);
                setTriggerType(event.target.value);
              }}
            >
              <option value="">All triggers</option>
              <option value="maintenance_reminder">maintenance_reminder</option>
              <option value="bulk_manual">bulk_manual</option>
            </Select>
          </FormField>
          <FormField label="Status">
            <Select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
            >
              <option value="">All statuses</option>
              <option value="sent">sent</option>
              <option value="failed">failed</option>
              <option value="pending">pending</option>
            </Select>
          </FormField>
          <FormField label="Sort by sent_at">
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value as "asc" | "desc")}
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </Select>
          </FormField>
        </div>
      </Card>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        loadingLabel="Loading SMS history..."
        emptyTitle="No SMS records found"
        emptyDescription="Try adjusting your filters or send a reminder from Manual Trigger."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
