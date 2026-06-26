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
        <h1 className="text-2xl font-bold text-gray-900">Performance Reports</h1>
        <p className="text-gray-500 text-sm mt-1">Labor cost, coverage, attendance, and staff performance analytics</p>
      </div>

      <div className="flex gap-3 mb-6">
        <select
          value={selectedOutletId}
          onChange={(e) => setSelectedOutletId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select Outlet</option>
          {outlets?.data?.map((o: { id: string; name: string }) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
      </div>

      {!selectedOutletId ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center text-gray-400">
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
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500 mb-1">{label}</p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          {/* Staff Performance Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Staff Performance</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Staff</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Position</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700">Present Days</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700">Late Days</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700">OT Hours</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700">Attendance %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {staffPerf?.data?.map((s: { id: string; name: string; employee_id: string; position_name: string; present_days: number; late_days: number; overtime_hours: number; attendance_rate: number }) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {s.name} <span className="text-xs text-gray-400">#{s.employee_id}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.position_name ?? "—"}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{s.present_days}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{s.late_days}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{Number(s.overtime_hours).toFixed(1)}</td>
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
