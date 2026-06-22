"use client";

import { useEffect, useState } from "react";
import { SourceChart } from "@/components/SourceChart";
import { StatCard } from "@/components/StatCard";
import { Alert, LoadingState } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { FormField, Input } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";

type StatsResponse = {
  month: string;
  smsSentAllTime: number;
  smsSentThisMonth: number;
  conversionRate: number;
  convertedCount: number;
  reminderSentCount: number;
  bookingSources: {
    sms_reminder: number;
    qr_code: number;
    direct: number;
  };
  clientSplit: {
    newClients: number;
    returningClients: number;
  };
};

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

export default function OverviewPage() {
  const [month, setMonth] = useState(currentMonthValue());
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/stats?month=${month}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load stats");
        }
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, [month]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="SMS performance, conversion tracking, and booking source breakdown."
        action={
          <FormField label="Client split month" className="min-w-[180px]">
            <Input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </FormField>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading || !stats ? (
        <Card>
          <LoadingState label="Loading stats..." />
        </Card>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="SMS sent (all time)" value={stats.smsSentAllTime} />
            <StatCard label="SMS sent (this month)" value={stats.smsSentThisMonth} />
            <StatCard
              label="Reminder conversion"
              value={`${stats.conversionRate}%`}
              hint={`${stats.convertedCount} of ${stats.reminderSentCount} sent reminders converted`}
            />
            <StatCard
              label="Clients detailed in month"
              value={stats.clientSplit.newClients + stats.clientSplit.returningClients}
              hint={`${stats.clientSplit.newClients} new · ${stats.clientSplit.returningClients} returning`}
            />
          </section>

          <SourceChart data={stats.bookingSources} />

          <Card padding="md">
            <h2 className="text-sm font-semibold text-foreground">New vs returning clients</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              For the selected month, a client is counted as <strong className="text-foreground">new</strong> if
              their first ever row in <code className="rounded bg-muted-bg px-1.5 py-0.5 font-mono text-xs">details_completed</code> falls
              in that month. Otherwise they count as <strong className="text-foreground">returning</strong>.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
