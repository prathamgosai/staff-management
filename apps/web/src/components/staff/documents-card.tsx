"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";
import { prepareDocumentForUpload, DOCUMENT_ACCEPT } from "@/lib/image";
import {
  FileText, Upload, Trash2, Eye, X, Loader2, ShieldAlert, AlertTriangle,
  Download, History, EyeOff, RefreshCw,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";

/* ─── types ───────────────────────────────────────────────────────────────── */
interface DocMeta {
  id: string;
  staffId: string;
  docType: string;
  typeName: string | null;
  docNumberMasked: string | null;
  expiresOn: string | null;
  status: "valid" | "expired" | "pending";
  currentVersion: number;
  hasFullNumber: boolean;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}
interface DocType {
  id: string; key: string; name: string;
  isMandatory: boolean; requiresNumber: boolean; requiresExpiry: boolean; isActive: boolean;
}
type Source = { kind: "staff"; staffId: string } | { kind: "me" };

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_META: Record<string, { cls: string; label: string }> = {
  valid: { cls: "bg-success/15 text-success", label: "Valid" },
  expired: { cls: "bg-destructive/15 text-destructive", label: "Expired" },
  pending: { cls: "bg-warning/15 text-warning", label: "Pending" },
};

/** Amber within 60 days, red once past — else neutral. */
function expiryBadge(expiresOn: string | null): { cls: string; text: string } | null {
  if (!expiresOn) return null;
  const days = differenceInCalendarDays(new Date(expiresOn), new Date());
  const dateStr = format(new Date(expiresOn), "d MMM yyyy");
  if (days < 0) return { cls: "bg-destructive/15 text-destructive", text: `Expired ${dateStr}` };
  if (days <= 60) return { cls: "bg-warning/15 text-warning", text: `Expires ${dateStr}` };
  return { cls: "bg-muted text-muted-foreground", text: `Expires ${dateStr}` };
}

/* ─── card ────────────────────────────────────────────────────────────────── */
export function DocumentsCard({
  source, canManage, canReveal = false,
}: { source: Source; canManage: boolean; canReveal?: boolean }) {
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState<DocMeta | null>(null);
  const [versionsOf, setVersionsOf] = useState<DocMeta | null>(null);

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
    onSuccess: () => { toast.success("Document deleted."); qc.invalidateQueries({ queryKey: listKey }); },
  });

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <FileText size={13} /> Documents
        </p>
        {canManage && source.kind === "staff" && (
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition"
          >
            <Upload size={12} /> Upload
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}</div>
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
            const st = STATUS_META[doc.status];
            return (
              <div key={doc.id} className="flex items-center gap-3 bg-muted rounded-xl px-3 py-2.5">
                <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
                  <FileText size={15} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate max-w-[13rem]">{doc.fileName}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-card border border-border text-muted-foreground">
                      {doc.typeName ?? doc.docType}
                    </span>
                    {st && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>}
                    {doc.currentVersion > 1 && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">v{doc.currentVersion}</span>
                    )}
                    {badge && doc.status !== "expired" && (
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${badge.cls}`}>
                        <AlertTriangle size={10} /> {badge.text}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1.5">
                    {doc.docNumberMasked && (
                      <RevealableNumber docId={doc.id} masked={doc.docNumberMasked} canReveal={canReveal && doc.hasFullNumber} />
                    )}
                    <span>{formatBytes(doc.sizeBytes)} · {format(new Date(doc.createdAt), "d MMM yyyy")}</span>
                  </div>
                </div>
                <button onClick={() => setPreview(doc)} title="Preview" className="p-2 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground transition shrink-0">
                  <Eye size={15} />
                </button>
                {doc.currentVersion > 1 && (
                  <button onClick={() => setVersionsOf(doc)} title="Version history" className="p-2 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground transition shrink-0">
                    <History size={15} />
                  </button>
                )}
                {canManage && source.kind === "staff" && (
                  <button
                    onClick={() => { if (confirm(`Delete "${doc.fileName}"? It will be archived, not permanently erased.`)) del.mutate(doc.id); }}
                    disabled={del.isPending}
                    title="Delete"
                    className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition shrink-0"
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
      {preview && <PreviewLightbox doc={preview} onClose={() => setPreview(null)} />}
      {versionsOf && <VersionsDrawer doc={versionsOf} onClose={() => setVersionsOf(null)} />}
    </div>
  );
}

/* ─── revealable document number ──────────────────────────────────────────── */
function RevealableNumber({ docId, masked, canReveal }: { docId: string; masked: string; canReveal: boolean }) {
  const [full, setFull] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function reveal() {
    setBusy(true);
    try {
      const r = await apiClient.post(`/documents/${docId}/reveal-number`);
      setFull(r.data?.data?.number ?? masked);
      setTimeout(() => setFull(null), 20_000); // auto-remask
    } catch {
      toast.error("Not permitted to reveal this number.");
    } finally { setBusy(false); }
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono">{full ?? masked}</span>
      {canReveal && (
        <button onClick={full ? () => setFull(null) : reveal} disabled={busy} title={full ? "Hide" : "Reveal full number"}
          className="text-muted-foreground hover:text-foreground">
          {busy ? <Loader2 size={11} className="animate-spin" /> : full ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
      )}
      <span className="text-muted-foreground">·</span>
    </span>
  );
}

/* ─── embedded preview (PDF iframe + image lightbox) ──────────────────────── */
function PreviewLightbox({ doc, onClose }: { doc: DocMeta; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery<{ url: string; mime: string }>({
    queryKey: ["doc-preview", doc.id],
    queryFn: async () => {
      const res = await apiClient.get(`/staff/${doc.staffId}/documents/${doc.id}/content`, { responseType: "blob" });
      return { url: URL.createObjectURL(res.data as Blob), mime: doc.mimeType };
    },
    staleTime: 0, gcTime: 0,
  });

  async function download() {
    try {
      const r = await apiClient.get(`/documents/${doc.id}/download`);
      const url: string = r.data?.data?.url;
      if (url) window.open(url, "_blank");
    } catch { toast.error("Could not create a download link."); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground truncate">{doc.fileName}</p>
          <div className="flex items-center gap-1">
            <button onClick={download} title="Download (signed link)" className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"><Download size={16} /></button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X size={16} /></button>
          </div>
        </div>
        <div className="flex-1 min-h-[50vh] bg-muted/40 flex items-center justify-center overflow-auto">
          {isLoading ? (
            <Loader2 size={28} className="animate-spin text-muted-foreground" />
          ) : isError || !data ? (
            <p className="text-sm text-muted-foreground p-8">Could not load the document.</p>
          ) : doc.mimeType === "application/pdf" ? (
            <iframe src={data.url} title={doc.fileName} className="w-full h-[70vh] bg-white" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.url} alt={doc.fileName} className="max-w-full max-h-[70vh] object-contain" />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── version history drawer ──────────────────────────────────────────────── */
interface DocVersion { id: string; versionNo: number; fileName: string; mimeType: string; sizeBytes: number; docNumberMasked: string | null; replacedAt: string; }
function VersionsDrawer({ doc, onClose }: { doc: DocMeta; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ data: { currentVersion: number; versions: DocVersion[] } }>({
    queryKey: ["doc-versions", doc.id],
    queryFn: () => apiClient.get(`/documents/${doc.id}/versions`).then((r) => r.data),
  });
  const versions = data?.data.versions ?? [];
  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card w-full max-w-sm h-full shadow-2xl p-5 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground flex items-center gap-2"><History size={16} /> Version history</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted"><X size={16} /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{doc.typeName ?? doc.docType} · current version v{doc.currentVersion}</p>
        {isLoading ? (
          <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}</div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No prior versions.</p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="bg-muted rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">v{v.versionNo}</span>
                  <span className="text-[11px] text-muted-foreground">{formatBytes(v.sizeBytes)}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{v.fileName}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Replaced {format(new Date(v.replacedAt), "d MMM yyyy, HH:mm")}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ─── upload modal ────────────────────────────────────────────────────────── */
function UploadModal({ staffId, onClose, onUploaded }: { staffId: string; onClose: () => void; onUploaded: () => void }) {
  const { data: typesData } = useQuery<{ data: DocType[] }>({
    queryKey: ["document-types"],
    queryFn: () => apiClient.get("/settings/document-types").then((r) => r.data),
    staleTime: 300_000,
  });
  const types = (typesData?.data ?? []).filter((t) => t.isActive);

  const [docType, setDocType] = useState("aadhaar");
  const [docNumber, setDocNumber] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = types.find((t) => t.key === docType);

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
        resp?.status === 413 ? "File is too large (max 10 MB)." :
        Array.isArray(m) ? m.join(", ") :
        m ?? (e as Error).message ?? "Upload failed. Please try again.",
      );
    } finally { setBusy(false); }
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
            <select value={docType} onChange={(e) => setDocType(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring">
              {(types.length ? types : [{ key: "aadhaar", name: "Aadhaar" }]).map((d) => (
                <option key={d.key} value={d.key}>{d.name}</option>
              ))}
            </select>
            {selected?.isMandatory && <p className="mt-1 text-[11px] text-muted-foreground">Mandatory document type.</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Document number {selected?.requiresNumber ? "" : "(optional)"}
            </label>
            <input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} maxLength={60}
              placeholder={docType === "aadhaar" ? "12-digit Aadhaar" : "e.g. ABCDE1234F"}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring" />
            <p className="mt-1.5 text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <ShieldAlert size={11} /> Stored encrypted; masked in the UI (reveal is permissioned & audited).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Expiry date {selected?.requiresExpiry ? "" : "(optional)"}
            </label>
            <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">File (PDF, JPG, PNG — max 10 MB)</label>
            <input type="file" accept={DOCUMENT_ACCEPT} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(null); }}
              className="w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-muted file:text-foreground file:text-xs file:font-semibold hover:file:bg-border" />
          </div>

          {err && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{err}</p>}
        </div>

        <button onClick={submit} disabled={busy || !file}
          className="mt-5 w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
        </button>
        {docType && <p className="mt-2 text-[11px] text-muted-foreground text-center inline-flex items-center gap-1 w-full justify-center"><RefreshCw size={10} /> Re-uploading an existing type keeps the old file as a version.</p>}
      </div>
    </div>
  );
}
