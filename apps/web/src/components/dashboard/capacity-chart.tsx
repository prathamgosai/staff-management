"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export interface CapacityChartDatum {
  name: string;
  required: number;
  actual: number;
}

/**
 * Required vs actual staff per dine-in outlet. Kept in its own module so it is
 * dynamically imported (recharts stays out of chunks that never render it, e.g.
 * employee routes). Colours use the app's semantic --chart tokens (light/dark safe).
 */
export default function CapacityChart({ data }: { data: CapacityChartDatum[] }) {
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 4 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              fontSize: 12,
              color: "hsl(var(--popover-foreground))",
            }}
            cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="required" name="Required" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Bar dataKey="actual" name="Actual" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
