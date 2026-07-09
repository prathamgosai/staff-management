"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth.store";
import { hasPermission } from "@/lib/permissions";
import { toast } from "@/components/ui/sonner";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Info } from "lucide-react";

/* ─── parsing helpers ─────────────────────────────────────────────────────── */
function pad(n: number) { return String(n).padStart(2, "0"); }
function dateToYmd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function excelSerialToDate(n: number) { return new Date(Math.round((n - 25569) * 86400 * 1000)); }

function toYmd(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return dateToYmd(v);
  if (typeof v === "number") { const d = excelSerialToDate(v); return isNaN(d.getTime()) ? null : dateToYmd(d); }
  const s = String(v).trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  if ((m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s))) {
    let d = +m[1], mo = +m[2]; const y = +m[3];
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; } // MM/DD fallback
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : dateToYmd(parsed);
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

function findCol(headers: string[], re: RegExp): number {
  return headers.findIndex((h) => re.test(h.toLowerCase().trim()));
}

interface PreviewRow { rowNum: number; outletName: string; date: string | null; pax: number | null; revenue: number | null; valid: boolean; reason?: string; }

export default function PaxImportPage() {
  const user = useAuthStore((s) => s.user);
  const canImport = hasPermission(user, "outlet:write");

  const [fileName, setFileName] = useState<string | null>(null);
  const [grid, setGrid] = useState<unknown[][] | null>(null);
  const [cols, setCols] = useState<{ date: number; outlet: number; pax: number; revenue: number }>({ date: -1, outlet: -1, pax: -1, revenue: -1 });
  const [avgSpend, setAvgSpend] = useState("");
  const [deriveFromRevenue, setDeriveFromRevenue] = useState(false);
  const [parseErr, setParseErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParseErr(null); setFileName(file.name); setGrid(null);
    try {
      let rows: unknown[][];
      if (/\.csv$/i.test(file.name)) {
        rows = parseCsv(await file.text());
      } else {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false }) as unknown[][];
      }
      if (!rows || rows.length < 2) { setParseErr("The file has no data rows."); return; }
      const headers = (rows[0] as unknown[]).map((h) => String(h ?? ""));
      const detected = {
        date: findCol(headers, /date/),
        outlet: findCol(headers, /outlet|restaurant|store|branch/),
        pax: findCol(headers, /pax|cover/),
        revenue: findCol(headers, /revenue|net ?sales|amount|sales/),
      };
      setCols(detected);
      setDeriveFromRevenue(detected.pax === -1 && detected.revenue !== -1);
      setGrid(rows);
    } catch (err) {
      setParseErr((err as Error).message || "Could not parse that file.");
    }
  }

  const spend = Number(avgSpend);
  const preview = useMemo<PreviewRow[]>(() => {
    if (!grid) return [];
    const body = grid.slice(1);
    return body.map((raw, idx) => {
      const rowNum = idx + 2; // 1-based incl. header
      const outletName = cols.outlet >= 0 ? String(raw[cols.outlet] ?? "").trim() : "";
      const date = cols.date >= 0 ? toYmd(raw[cols.date]) : null;
      const revenue = cols.revenue >= 0 ? toNumber(raw[cols.revenue]) : null;
      let pax: number | null = null;
      if (deriveFromRevenue) {
        pax = revenue != null && spend > 0 ? Math.round(revenue / spend) : null;
      } else if (cols.pax >= 0) {
        const p = toNumber(raw[cols.pax]);
        pax = p != null ? Math.round(p) : null;
      }
      let valid = true, reason: string | undefined;
      if (!outletName) { valid = false; reason = "no outlet"; }
      else if (!date) { valid = false; reason = "bad date"; }
      else if (pax == null || pax < 0) { valid = false; reason = deriveFromRevenue && !(spend > 0) ? "set avg spend" : "bad pax"; }
      return { rowNum, outletName, date, pax, revenue, valid, reason };
    });
  }, [grid, cols, deriveFromRevenue, spend]);

  const validRows = preview.filter((r) => r.valid);

  const importMut = useMutation({
    mutationFn: () => apiClient.post("/pax-history/import", {
      rows: validRows.map((r) => ({ outletName: r.outletName, date: r.date, pax: r.pax, revenue: r.revenue })),
    }).then((r) => r.data.data as { imported: number; updated: number; skipped: { row: number; reason: string }[] }),
    onSuccess: (res) => toast.success(`Imported ${res.imported}, updated ${res.updated}, skipped ${res.skipped.length}.`),
    onError: (e) => {
      const m = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(", ") : m ?? "Import failed.");
    },
  });

  if (!canImport) {
    return <div className="mx-auto max-w-lg py-24 text-center"><p className="font-semibold text-foreground">You don&apos;t have permission to import pax history.</p></div>;
  }

  const result = importMut.data;
  const hasRevenue = cols.revenue !== -1;
  const noPaxCol = cols.pax === -1;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Import pax history</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Upload daily covers per outlet. Re-importing a day updates it (no duplicates).</p>
      </div>

      {/* Format help */}
      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
        <Info size={14} className="mt-0.5 shrink-0" />
        <div>
          <p><span className="font-semibold text-foreground">Expected columns:</span> Date · Outlet · Pax (one row per outlet per day). A Revenue column is optional.</p>
          <p className="mt-1">Dates like 2026-06-01 or 01/06/2026 are accepted. Outlet names must match your outlets. No covers? Provide Revenue and an average spend/cover to convert.</p>
        </div>
      </div>

      {/* File picker */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
        <label className="flex items-center gap-3 cursor-pointer">
          <span className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition">
            <Upload size={15} /> Choose .csv / .xlsx
          </span>
          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFile} />
          {fileName && <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><FileSpreadsheet size={14} /> {fileName}</span>}
        </label>
        {parseErr && <p className="text-xs text-red-600 mt-3">{parseErr}</p>}

        {grid && (
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span>Detected: date {cols.date >= 0 ? "✓" : "✗"} · outlet {cols.outlet >= 0 ? "✓" : "✗"} · pax {cols.pax >= 0 ? "✓" : "✗"} · revenue {hasRevenue ? "✓" : "—"}</span>
            {hasRevenue && (
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={deriveFromRevenue} disabled={noPaxCol} onChange={(e) => setDeriveFromRevenue(e.target.checked)} />
                Derive covers from revenue{noPaxCol ? " (no pax column)" : ""}
              </label>
            )}
            {deriveFromRevenue && (
              <label className="inline-flex items-center gap-2">
                Avg spend / cover ₹
                <input value={avgSpend} onChange={(e) => setAvgSpend(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="e.g. 650"
                  className="w-24 border border-border rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            )}
          </div>
        )}
      </div>

      {/* Preview */}
      {grid && (
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Preview</p>
            <p className="text-xs text-muted-foreground">{validRows.length} of {preview.length} rows valid</p>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="text-left font-semibold px-4 py-2">Outlet</th>
                  <th className="text-left font-semibold px-3 py-2">Date</th>
                  <th className="text-right font-semibold px-3 py-2">Pax</th>
                  <th className="text-right font-semibold px-3 py-2">Revenue</th>
                  <th className="text-left font-semibold px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 300).map((r) => (
                  <tr key={r.rowNum} className={`border-b border-border last:border-0 ${r.valid ? "" : "bg-red-50/50 dark:bg-red-500/10"}`}>
                    <td className="px-4 py-1.5 text-foreground truncate max-w-[12rem]">{r.outletName || <span className="text-red-500">—</span>}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.date || <span className="text-red-500">—</span>}</td>
                    <td className="px-3 py-1.5 text-right text-foreground">{r.pax ?? <span className="text-red-500">—</span>}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">{r.revenue ?? "—"}</td>
                    <td className="px-4 py-1.5">
                      {r.valid
                        ? <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={12} /> ok</span>
                        : <span className="text-red-600 inline-flex items-center gap-1"><AlertTriangle size={12} /> {r.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 300 && <p className="text-[11px] text-muted-foreground px-5 py-2">Showing first 300 of {preview.length} rows (all valid rows import).</p>}
          <div className="px-5 py-3 border-t border-border">
            <button onClick={() => importMut.mutate()} disabled={importMut.isPending || validRows.length === 0}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition">
              {importMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              Import {validRows.length} row{validRows.length !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
          <p className="text-sm font-semibold text-foreground mb-2">Import complete</p>
          <div className="flex gap-4 text-sm">
            <span className="text-emerald-600 font-semibold">{result.imported} imported</span>
            <span className="text-blue-600 font-semibold">{result.updated} updated</span>
            <span className="text-muted-foreground">{result.skipped.length} skipped</span>
          </div>
          {result.skipped.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto text-xs text-muted-foreground space-y-1">
              {result.skipped.slice(0, 50).map((s, i) => <p key={i}>Row {s.row}: {s.reason}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
