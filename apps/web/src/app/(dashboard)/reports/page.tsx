"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { format, subDays } from "date-fns";
import { BarChart3 } from "lucide-react";

export default function ReportsPage() {
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: outlets } = useQuery({
    queryKey: ["outlets"],
    queryFn: () => apiClient.get("/outlets").then((r) => r.data),
  });

  const { data: kpis } = useQuery({
    queryKey: ["outlet-kpis", selectedOutletId, startDate, endDate],
    queryFn: () =>
      apiClient.get("/dashboard/outlet-kpis", { params: { outletId: selectedOutletId, startDate, endDate } }).then((r) => r.data),
    enabled: !!selectedOutletId,
  });

  const { data: staffPerf } = useQuery({
    queryKey: ["staff-performance", selectedOutletId, startDate, endDate],
    queryFn: () =>
      apiClient.get("/dashboard/staff-performance", { params: { outletId: selectedOutletId, startDate, endDate } }).then((r) => r.data),
    enabled: !!selectedOutletId,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Performance Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">Labor cost, coverage, attendance, and staff performance analytics</p>
      </div>

      <div className="flex gap-3 mb-6">
        <select
          value={selectedOutletId}
          onChange={(e) => setSelectedOutletId(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select Outlet</option>
          {outlets?.data?.map((o: { id: string; name: string }) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm outline-none" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm outline-none" />
      </div>

      {!selectedOutletId ? (
        <div className="bg-card rounded-xl border border-border p-16 text-center text-muted-foreground">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Select an outlet and date range to view reports</p>
        </div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Coverage %", value: kpis?.data?.coverage?.coverage_pct ? `${kpis.data.coverage.coverage_pct}%` : "—" },
              { label: "Attendance Rate", value: kpis?.data?.attendance?.attendance_rate ? `${kpis.data.attendance.attendance_rate}%` : "—" },
              { label: "Total Labor Cost", value: kpis?.data?.labor?.total_labor_cost ? `MYR ${Number(kpis.data.labor.total_labor_cost).toFixed(0)}` : "—" },
              { label: "Pending Leave", value: kpis?.data?.pendingLeaveRequests ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card rounded-xl border border-border p-5">
                <p className="text-sm text-muted-foreground mb-1">{label}</p>
                <p className="text-2xl font-bold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          {/* Staff Performance Table */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Staff Performance</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-foreground">Staff</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground">Position</th>
                  <th className="text-center px-4 py-3 font-medium text-foreground">Present Days</th>
                  <th className="text-center px-4 py-3 font-medium text-foreground">Late Days</th>
                  <th className="text-center px-4 py-3 font-medium text-foreground">OT Hours</th>
                  <th className="text-center px-4 py-3 font-medium text-foreground">Attendance %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staffPerf?.data?.map((s: { id: string; name: string; employee_id: string; position_name: string; present_days: number; late_days: number; overtime_hours: number; attendance_rate: number }) => (
                  <tr key={s.id} className="hover:bg-muted">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {s.name} <span className="text-xs text-muted-foreground">#{s.employee_id}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.position_name ?? "—"}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{s.present_days}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{s.late_days}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{Number(s.overtime_hours).toFixed(1)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold ${s.attendance_rate >= 90 ? "text-green-600" : s.attendance_rate >= 75 ? "text-orange-500" : "text-red-600"}`}>
                        {s.attendance_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
