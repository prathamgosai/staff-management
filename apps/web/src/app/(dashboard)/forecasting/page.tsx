"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { TrendingUp, Wand2 } from "lucide-react";
import { format, subDays } from "date-fns";

export default function ForecastingPage() {
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const today = format(new Date(), "yyyy-MM-dd");
  const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");

  const { data: outlets } = useQuery({
    queryKey: ["outlets"],
    queryFn: () => apiClient.get("/outlets").then((r) => r.data),
  });

  const { data: forecasts } = useQuery({
    queryKey: ["forecasts", selectedOutletId],
    queryFn: () =>
      apiClient.get("/forecasting/forecasts", { params: { outletId: selectedOutletId, startDate: today, endDate: format(new Date(today + "T00:00:00"), "yyyy-MM-dd") } }).then((r) => r.data),
    enabled: !!selectedOutletId,
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      apiClient.post("/forecasting/generate", { outletId: selectedOutletId, startDate: today, endDate: today }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workforce Forecasting</h1>
          <p className="text-gray-500 text-sm mt-1">PAX-based demand forecasting and headcount recommendations</p>
        </div>
        <button
          onClick={() => generateMutation.mutate()}
          disabled={!selectedOutletId || generateMutation.isPending}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          <Wand2 size={16} />
          {generateMutation.isPending ? "Generating…" : "Generate Forecast"}
        </button>
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-blue-100 text-blue-700 p-2 rounded-lg"><TrendingUp size={18} /></div>
            <p className="font-semibold text-gray-800">Forecast Accuracy</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">—</p>
          <p className="text-xs text-gray-500 mt-1">Requires 4+ weeks of PAX data</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="font-semibold text-gray-800 mb-1">Active Model</p>
          <p className="text-3xl font-bold text-gray-900">Rule-Based</p>
          <p className="text-xs text-gray-500 mt-1">Phase 2: Switch to Prophet / XGBoost</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="font-semibold text-gray-800 mb-1">PAX Data Points</p>
          <p className="text-3xl font-bold text-gray-900">—</p>
          <p className="text-xs text-gray-500 mt-1">Upload PAX data via ingest API</p>
        </div>
      </div>

      {!selectedOutletId ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center text-gray-400">
          <TrendingUp size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Select an outlet to view forecast data</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Hourly Headcount Forecast — Today</h2>
          {forecasts?.data?.length === 0 ? (
            <p className="text-gray-400 text-sm">No forecast generated yet. Click Generate Forecast to begin.</p>
          ) : (
            <p className="text-gray-500 text-sm">Forecast chart renders here with Recharts AreaChart</p>
          )}
        </div>
      )}
    </div>
  );
}
