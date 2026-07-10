"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export interface StaffingChartDatum {
  name: string;
  required: number;
  current: number;
  excess: number;
  shortage: number;
}

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
} as const;

/**
 * Company staffing charts (Feature 4). Own module so recharts is dynamically imported and
 * stays out of route chunks that never render it. Colours use the semantic --chart tokens.
 */
export default function StaffingCharts({ data }: { data: StaffingChartDatum[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Required vs current (pax vs staff)</p>
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 4 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval={0} angle={-15} textAnchor="end" height={48} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="required" name="Required" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar dataKey="current" name="Current" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Excess vs shortage by restaurant</p>
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 4 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval={0} angle={-15} textAnchor="end" height={48} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="excess" name="Excess" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar dataKey="shortage" name="Shortage" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
