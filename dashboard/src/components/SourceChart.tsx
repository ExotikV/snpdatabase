"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";

type SourceChartProps = {
  data: {
    sms_reminder: number;
    qr_code: number;
    direct: number;
  };
};

const labels: Record<string, string> = {
  sms_reminder: "SMS reminder",
  qr_code: "QR code",
  direct: "Direct",
};

export function SourceChart({ data }: SourceChartProps) {
  const chartData = Object.entries(data).map(([key, value]) => ({
    name: labels[key] ?? key,
    count: value,
  }));

  return (
    <Card padding="md">
      <CardHeader
        title="Booking attempts by source"
        description="All-time counts from booking_attempts"
      />
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#e5e2dc" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: "#6b6b6b" }}
              axisLine={{ stroke: "#e5e2dc" }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: "#6b6b6b" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "0.75rem",
                border: "1px solid #e5e2dc",
                boxShadow: "var(--shadow-card)",
              }}
            />
            <Bar dataKey="count" fill="#a68b4b" radius={[6, 6, 0, 0]} maxBarSize={72} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
