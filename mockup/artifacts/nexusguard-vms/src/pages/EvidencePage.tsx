import { useState } from 'react';
import { format } from 'date-fns';
import {
  Archive, Download, Plus, FileVideo,
  Clock, Camera, FileText, CheckSquare, X, ChevronDown, ChevronRight,
  Shield, Package, CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOCK_CAMERAS, MOCK_EVENTS } from '../data/mockData';

interface ExportPackage {
  id: string;
  name: string;
  status: 'draft' | 'compiling' | 'ready' | 'delivered';
  items: number;
  cameras: string[];
  dateRange: string;
  createdAt: string;
  format: string;
  size?: string;
  hash?: string;
}

const MOCK_PACKAGES: ExportPackage[] = [
  {
    id: 'pkg-0012',
    name: 'INC-2024-0847 — Perimeter Breach',
    status: 'ready',
    items: 14,
    cameras: ['NVR-A-01', 'NVR-A-02', 'NVR-B-07'],
    dateRange: '2024-11-14 20:00 — 2024-11-14 22:30',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    format: 'MP4 + PDF Report',
    size: '2.4 GB',
    hash: 'SHA256:a4f3c2d1e8b7...',
  },
  {
    id: 'pkg-0011',
    name: 'Routine Audit — Nov 13',
    status: 'delivered',
    items: 8,
    cameras: ['NVR-A-07', 'NVR-C-12'],
    dateRange: '2024-11-13 00:00 — 2024-11-13 23:59',
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    format: 'AVI + PDF Report',
    size: '1.1 GB',
    hash: 'SHA256:b9e4a5d2f1c8...',
  },
  {
    id: 'pkg-0010',
    name: 'Fire Drill — Emergency Exit Review',
    status: 'delivered',
    items: 5,
    cameras: ['NVR-B-03', 'NVR-B-04'],
    dateRange: '2024-11-10 14:00 — 2024-11-10 15:30',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    format: 'MP4 + PDF Report',
    size: '740 MB',
    hash: 'SHA256:f2c8a3b7d1e9...',
  },
];

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-border',
  compiling: 'bg-[hsl(var(--chart-2)_/_0.12)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)_/_0.3)]',
  ready: 'bg-[hsl(var(--chart-3)_/_0.12)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)_/_0.3)]',
  delivered: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-border',
};

const WIZARD_STEPS = ['Select Clips', 'Redaction Options', 'Export Format', 'Confirm & Export'];

function NewPackageModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [selectedCams, setSelectedCams] = useState<string[]>([]);
  const [format, setFormat] = useState('MP4');
  const [watermark, setWatermark] = useState(true);
  const [blur, setBlur] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canNext = step === 0 ? selectedCams.length > 0 : true;

  const submit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1500));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-[620px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">New Evidence Package</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[hsl(var(--accent))] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center px-5 py-3 border-b border-border">
          {WIZARD_STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-colors',
                  i === step ? 'bg-primary text-primary-foreground' : i < step ? 'text-green-400' : 'text-muted-foreground'
                )}
                onClick={() => i <= step && setStep(i)}
              >
                {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : (
                  <span className={cn('h-5 w-5 rounded-full border flex items-center justify-center text-[10px]',
                    i === step ? 'border-primary-foreground/50 text-primary-foreground' : 'border-muted-foreground'
                  )}>{i + 1}</span>
                )}
                {s}
              </div>
              {i < WIZARD_STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/40 mx-1" />}
            </div>
          ))}
        </div>

        <div className="p-5 space-y-4 min-h-64">
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm font-medium">Select Camera & Time Range</p>
              <div className="grid grid-cols-2 gap-3">
                {MOCK_CAMERAS.slice(0, 16).map(c => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCams(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                      selectedCams.includes(c.id) ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card/50 hover:bg-accent/40'
                    )}
                  >
                    <Camera className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{c.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{c.code}</p>
                    </div>
                    {selectedCams.includes(c.id) && <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />}
                  </div>
                ))}
              </div>
              {selectedCams.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Start Time</label>
                    <input type="datetime-local" defaultValue="2025-05-03T10:40:00"
                      className="h-8 w-full rounded border border-border bg-background text-xs px-2 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">End Time</label>
                    <input type="datetime-local" defaultValue="2025-05-03T10:50:00"
                      className="h-8 w-full rounded border border-border bg-background text-xs px-2 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4 max-w-lg">
              <p className="text-sm font-medium">Redaction & Privacy Options</p>
              <label className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/30 cursor-pointer">
                <div>
                  <p className="text-xs font-medium">Add Chain-of-Custody Watermark</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Embed export metadata and operator ID on each frame</p>
                </div>
                <input type="checkbox" checked={watermark} onChange={e => setWatermark(e.target.checked)} className="rounded" />
              </label>
              <label className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/30 cursor-pointer">
                <div>
                  <p className="text-xs font-medium">Blur Sensitive Regions</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Pixelate selected areas (faces, license plates, etc.)</p>
                </div>
                <input type="checkbox" checked={blur} onChange={e => setBlur(e.target.checked)} className="rounded" />
              </label>
              {blur && (
                <div className="aspect-video bg-slate-900 rounded border border-border flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Zone selection editor — draw areas to blur</p>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 max-w-lg">
              <p className="text-sm font-medium">Export Format</p>
              <div className="space-y-2">
                {[
                  { fmt: 'MP4',     desc: 'H.264/H.265 — widely compatible',    icon: FileVideo },
                  { fmt: 'AVI',     desc: 'Uncompressed — maximum quality',      icon: FileVideo },
                  { fmt: 'Native',  desc: 'NexusGuard proprietary format',       icon: Package },
                ].map(({ fmt, desc, icon: Icon }) => (
                  <label key={fmt} className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                    format === fmt ? 'border-primary bg-primary/5' : 'border-border bg-card/30 hover:bg-accent/40'
                  )}>
                    <input type="radio" name="fmt" value={fmt} checked={format === fmt} onChange={() => setFormat(fmt)} className="sr-only" />
                    <div className={cn('h-8 w-8 rounded border flex items-center justify-center flex-shrink-0',
                      format === fmt ? 'border-primary/50 bg-primary/10' : 'border-border bg-card'
                    )}>
                      <Icon className={cn('h-4 w-4', format === fmt ? 'text-primary' : 'text-muted-foreground')} />
                    </div>
                    <div>
                      <p className="text-xs font-medium">{fmt}</p>
                      <p className="text-[10px] text-muted-foreground">{desc}</p>
                    </div>
                    {format === fmt && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
                  </label>
                ))}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Case / Incident Reference</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="INC-2024-XXXX — Description"
                  className="h-8 w-full rounded border border-border bg-background text-xs px-3 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 max-w-lg">
              <div className="p-4 rounded-lg border border-border bg-card/30 space-y-2 text-xs">
                <p className="font-semibold text-sm mb-3">Export Summary</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Cameras</span><span className="font-mono">{selectedCams.length} selected</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Format</span><span>{format}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Watermark</span><span>{watermark ? 'Yes' : 'No'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Blur redaction</span><span>{blur ? 'Yes' : 'No'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono">{name || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Export timestamp</span><span className="font-mono">{new Date().toISOString().replace('T', ' ').substring(0, 19)}</span></div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg border border-green-500/30 bg-green-500/5 text-xs">
                <Shield className="h-4 w-4 text-green-400 flex-shrink-0" />
                <p className="text-green-300">Chain of custody will be automatically recorded in the audit log upon export.</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <button onClick={() => step === 0 ? onClose() : setStep(s => s - 1)} className="px-4 py-2 rounded border border-border text-xs hover:bg-[hsl(var(--accent))] transition-colors">
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < WIZARD_STEPS.length - 1 ? (
            <button onClick={() => setStep(s => Math.min(WIZARD_STEPS.length - 1, s + 1))} disabled={!canNext}
              className="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              Continue
            </button>
          ) : (
            <button onClick={submit} disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              {submitting ? (
                <><span className="w-3.5 h-3.5 border-2 border-[hsl(var(--primary-foreground)_/_0.3)] border-t-[hsl(var(--primary-foreground))] rounded-full animate-spin" /> Compiling...</>
              ) : (
                <><Download className="w-3.5 h-3.5" /> Start Export</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EvidencePage() {
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>('pkg-0012');

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Evidence Export</h2>
          <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">Cryptographically sealed video packages for legal and compliance use</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold hover:opacity-90 transition-opacity"
          data-testid="button-new-package"
        >
          <Plus className="w-4 h-4" /> New Package
        </button>
      </div>

      {/* Compliance notice */}
      <div className="flex items-start gap-4 p-4 rounded-xl border border-[hsl(var(--chart-2)_/_0.3)] bg-[hsl(var(--chart-2)_/_0.06)]">
        <CheckSquare className="w-4 h-4 text-[hsl(var(--chart-2))] shrink-0 mt-0.5" />
        <div className="text-xs space-y-0.5">
          <div className="font-medium text-[hsl(var(--chart-2))]">On-Premise Chain-of-Custody Mode Active</div>
          <div className="text-[hsl(var(--muted-foreground))]">
            All exported packages are SHA-256 signed and include an immutable audit trail. Packages are written to isolated storage and never transmitted externally.
          </div>
        </div>
      </div>

      {/* Package list */}
      <div className="space-y-3">
        {MOCK_PACKAGES.map(pkg => (
          <div key={pkg.id} className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
            <div
              className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[hsl(var(--accent))] transition-colors"
              onClick={() => setExpanded(e => e === pkg.id ? null : pkg.id)}
            >
              <Archive className="w-4 h-4 text-[hsl(var(--muted-foreground))] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold truncate">{pkg.name}</span>
                  <span className={`shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${STATUS_BADGE[pkg.status]}`}>{pkg.status}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[hsl(var(--muted-foreground))] font-mono">
                  <span>{pkg.id}</span>
                  <span>·</span>
                  <span>{pkg.items} items</span>
                  <span>·</span>
                  <span>{pkg.cameras.length} cameras</span>
                  {pkg.size && <><span>·</span><span>{pkg.size}</span></>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pkg.status === 'ready' && (
                  <button
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold hover:opacity-90 transition-opacity"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                )}
                {expanded === pkg.id ? <ChevronDown className="w-4 h-4 text-[hsl(var(--muted-foreground))]" /> : <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />}
              </div>
            </div>

            {expanded === pkg.id && (
              <div className="border-t border-border px-5 py-5 grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Package Details</h4>
                  {[
                    ['Case Reference', pkg.id],
                    ['Date Range', pkg.dateRange],
                    ['Created', format(new Date(pkg.createdAt), 'yyyy-MM-dd HH:mm:ss')],
                    ['Format', pkg.format],
                    ['Total Size', pkg.size ?? 'Calculating...'],
                    ['Integrity Hash', pkg.hash ?? 'Pending...'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs gap-4">
                      <span className="text-[hsl(var(--muted-foreground))]">{k}</span>
                      <span className="font-mono text-[10px] text-right truncate max-w-52">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Cameras Included</h4>
                  {pkg.cameras.map(cam => (
                    <div key={cam} className="flex items-center gap-2 text-xs">
                      <Camera className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                      <span className="font-mono">{cam}</span>
                    </div>
                  ))}

                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mt-4">Package Contents</h4>
                  {[
                    { type: 'Video clips', count: pkg.items - 2, icon: FileVideo },
                    { type: 'Snapshots', count: 1, icon: Camera },
                    { type: 'PDF Report', count: 1, icon: FileText },
                  ].map(({ type, count, icon: Icon }) => (
                    <div key={type} className="flex items-center gap-2 text-xs">
                      <Icon className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                      <span>{type}</span>
                      <span className="ml-auto font-mono text-[hsl(var(--muted-foreground))]">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Audit log */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Export Audit Log</h3>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Immutable record of all evidence access and export operations</p>
        </div>
        <div className="divide-y divide-border max-h-48 overflow-y-auto">
          {[
            { user: 'Marcus Reinholt', action: 'Downloaded package PKG-0012', ts: new Date(Date.now() - 30 * 60 * 1000) },
            { user: 'Priya Nair', action: 'Created package PKG-0012', ts: new Date(Date.now() - 2 * 60 * 60 * 1000) },
            { user: 'James Okafor', action: 'Viewed package PKG-0011', ts: new Date(Date.now() - 4 * 60 * 60 * 1000) },
            { user: 'Marcus Reinholt', action: 'Downloaded package PKG-0011', ts: new Date(Date.now() - 26 * 60 * 60 * 1000) },
            { user: 'Elena Rostova', action: 'Created package PKG-0011', ts: new Date(Date.now() - 27 * 60 * 60 * 1000) },
            { user: 'Marcus Reinholt', action: 'Downloaded package PKG-0010', ts: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
          ].map((entry, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs">
              <Clock className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))] shrink-0" />
              <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))] shrink-0 hidden sm:block">
                {format(entry.ts, 'yyyy-MM-dd HH:mm:ss')}
              </span>
              <span className="font-medium shrink-0">{entry.user}</span>
              <span className="text-[hsl(var(--muted-foreground))] truncate">{entry.action}</span>
            </div>
          ))}
        </div>
      </div>

      {showModal && <NewPackageModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
