"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";
import { prepareDocumentForUpload, DOCUMENT_ACCEPT } from "@/lib/image";
import {
  FileText, Upload, Trash2, Eye, X, Loader2, ShieldAlert, AlertTriangle,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";

/* ─── types + labels ──────────────────────────────────────────────────────── */
interface DocMeta {
  id: string;
  staffId: string;
  docType: string;
  docNumberMasked: string | null;
  expiresOn: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export const DOC_TYPES: { value: string; label: string }[] = [
  { value: "aadhaar", label: "Aadhaar" },
  { value: "pan", label: "PAN" },
  { value: "bank_passbook", label: "Bank passbook" },
  { value: "driving_license", label: "Driving license" },
  { value: "passport", label: "Passport" },
  { value: "voter_id", label: "Voter ID" },
  { value: "police_verification", label: "Police verification" },
  { value: "contract", label: "Contract" },
  { value: "other", label: "Other" },
];
const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(DOC_TYPES.map((d) => [d.value, d.label]));

type Source = { kind: "staff"; staffId: string } | { kind: "me" };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Amber within 60 days, red once past — else null. */
function expiryBadge(expiresOn: string | null): { cls: string; text: string } | null {
  if (!expiresOn) return null;
  const days = differenceInCalendarDays(new Date(expiresOn), new Date());
  const dateStr = format(new Date(expiresOn), "d MMM yyyy");
  if (days < 0) {
    return { cls: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300", text: `Expired ${dateStr}` };
  }
  if (days <= 60) {
    return { cls: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300", text: `Expires ${dateStr}` };
  }
  return { cls: "bg-muted text-muted-foreground", text: `Expires ${dateStr}` };
}

/* ─── card ────────────────────────────────────────────────────────────────── */
export function DocumentsCard({ source, canManage }: { source: Source; canManage: boolean }) {
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const listKey = source.kind === "staff" ? ["staff-documents", source.staffId] : ["me-documents"];
  const listUrl = source.kind === "staff" ? `/staff/${source.staffId}/documents` : "/me/documents";

  const { data, isLoading, isError } = useQuery<{ data: DocMeta[] }>({
    queryKey: listKey,
    queryFn: () => apiClient.get(listUrl).then((r) => r.data),
    staleTime: 30_000,
  });
  const docs = data?.data ?? [];

  const del = useMutation({
    mutationFn: (docId: string) => apiClient.delete(`/staff/${(source as { staffId: string }).staffId}/documents/${docId}`),
    onSuccess: () => {
      toast.success("Document deleted.");
      qc.invalidateQueries({ queryKey: listKey });
    },
  });

  // Open in a new tab. A blank tab is opened synchronously (before the awaited
  // fetch) so pop-up blockers don't kill it; on failure we fall back to a download.
  async function view(doc: DocMeta) {
    setViewingId(doc.id);
    const tab = window.open("", "_blank");
    try {
      const res = await apiClient.get(`/staff/${doc.staffId}/documents/${doc.id}/content`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      if (tab) {
        tab.location.href = url;
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.fileName;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab?.close();
      toast.error("Could not open the document.");
    } finally {
      setViewingId(null);
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <FileText size={13} /> Documents
        </p>
        {canManage && (
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition"
          >
            <Upload size={12} /> Upload
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : isError && source.kind === "staff" ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Could not load documents.</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {canManage ? "No documents yet. Upload IDs, contracts and more." : "No documents on file."}
        </p>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => {
            const badge = expiryBadge(doc.expiresOn);
            return (
              <div key={doc.id} className="flex items-center gap-3 bg-muted rounded-xl px-3 py-2.5">
                <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
                  <FileText size={15} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate max-w-[14rem]">{doc.fileName}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-card border border-border text-muted-foreground">
                      {DOC_TYPE_LABEL[doc.docType] ?? doc.docType}
                    </span>
                    {badge && (
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${badge.cls}`}>
                        <AlertTriangle size={10} /> {badge.text}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {doc.docNumberMasked ? `${doc.docNumberMasked} · ` : ""}
                    {formatBytes(doc.sizeBytes)} · {format(new Date(doc.createdAt), "d MMM yyyy")}
                  </p>
                </div>
                <button
                  onClick={() => view(doc)}
                  disabled={viewingId === doc.id}
                  title="View"
                  className="p-2 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground transition shrink-0"
                >
                  {viewingId === doc.id ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
                </button>
                {canManage && source.kind === "staff" && (
                  <button
                    onClick={() => { if (confirm(`Delete "${doc.fileName}"? This cannot be undone.`)) del.mutate(doc.id); }}
                    disabled={del.isPending}
                    title="Delete"
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/15 text-muted-foreground hover:text-red-500 transition shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showUpload && source.kind === "staff" && (
        <UploadModal staffId={source.staffId} onClose={() => setShowUpload(false)} onUploaded={() => qc.invalidateQueries({ queryKey: listKey })} />
      )}
    </div>
  );
}

/* ─── upload modal ────────────────────────────────────────────────────────── */
function UploadModal({ staffId, onClose, onUploaded }: { staffId: string; onClose: () => void; onUploaded: () => void }) {
  const [docType, setDocType] = useState("aadhaar");
  const [docNumber, setDocNumber] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null);
    if (!file) { setErr("Please choose a file."); return; }
    setBusy(true);
    try {
      const prepared = await prepareDocumentForUpload(file);
      await apiClient.post(`/staff/${staffId}/documents`, {
        docType,
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        contentBase64: prepared.contentBase64,
        docNumber: docNumber.trim() || undefined,
        expiresOn: expiresOn || undefined,
      });
      toast.success("Document uploaded.");
      onUploaded();
      onClose();
    } catch (e) {
      const resp = (e as { response?: { status?: number; data?: { message?: string | string[] } } }).response;
      const m = resp?.data?.message;
      setErr(
        resp?.status === 413 ? "File is too large. Maximum size is 2 MB." :
        Array.isArray(m) ? m.join(", ") :
        m ?? (e as Error).message ?? "Upload failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl w-96 max-w-[calc(100vw-2rem)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground">Upload document</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted"><X size={16} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Document number (optional)</label>
            <input
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              maxLength={50}
              placeholder={docType === "aadhaar" ? "12-digit Aadhaar" : "e.g. ABCDE1234F"}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            {docType === "aadhaar" && (
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                <ShieldAlert size={11} /> Only the last 4 digits are stored (XXXX-XXXX-1234).
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Expiry date (optional)</label>
            <input
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">File (PDF or image, max 2 MB)</label>
            <input
              type="file"
              accept={DOCUMENT_ACCEPT}
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(null); }}
              className="w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-muted file:text-foreground file:text-xs file:font-semibold hover:file:bg-border"
            />
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">{err}</p>}
        </div>

        <button
          onClick={submit}
          disabled={busy || !file}
          className="mt-5 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Upload
        </button>
      </div>
    </div>
  );
}
