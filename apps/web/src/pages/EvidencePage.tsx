import { useState } from 'react';
import { format } from 'date-fns';
import {
  Archive, Download, Plus, FileVideo,
  Clock, Camera, FileText, CheckSquare, X, ChevronDown, ChevronRight,
  Shield, Package, CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVmsDataStore } from '../store/vmsDataStore';

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

const REAL_PACKAGES: ExportPackage[] = [];

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-border',
  compiling: 'bg-[hsl(var(--chart-2)_/_0.12)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)_/_0.3)]',
  ready: 'bg-[hsl(var(--chart-3)_/_0.12)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)_/_0.3)]',
  delivered: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-border',
};

const WIZARD_STEPS = ['Selecionar Clipes', 'Opções de Redação', 'Formato de Exportação', 'Confirmar e Exportar'];

function toDateTimeLocalValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function NewPackageModal({ onClose }: { onClose: () => void }) {
  const cameras = useVmsDataStore((state) => state.cameras);
  const [step, setStep] = useState(0);
  const [name, setNome] = useState('');
  const [selectedCams, setSelectedCams] = useState<string[]>([]);
  const [format, setFormat] = useState('MP4');
  const [watermark, setWatermark] = useState(true);
  const [blur, setBlur] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const now = new Date();
  const defaultEnd = toDateTimeLocalValue(now);
  const defaultStart = toDateTimeLocalValue(new Date(now.getTime() - 10 * 60 * 1000));

  const canPróximo = step === 0 ? selectedCams.length > 0 : true;

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
                {cameras.map(c => (
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
                    <input type="datetime-local" defaultValue={defaultStart}
                      className="h-8 w-full rounded border border-border bg-background text-xs px-2 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">End Time</label>
                    <input type="datetime-local" defaultValue={defaultEnd}
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
                  <p className="text-xs text-muted-foreground">As regioes selecionadas serao aplicadas ao material exportado.</p>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 max-w-lg">
              <p className="text-sm font-medium">Formato de Exportação</p>
              <div className="space-y-2">
                {[
                  { fmt: 'MP4',     desc: 'H.264/H.265 — widely compatible',    icon: FileVideo },
                  { fmt: 'AVI',     desc: 'Uncompressed — maximum quality',      icon: FileVideo },
                  { fmt: 'Native',  desc: 'Pacote assinado para cadeia de custodia', icon: Package },
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
                <input value={name} onChange={e => setNome(e.target.value)}
                  placeholder="Caso 2026-0001 - exportacao operacional"
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
                <div className="flex justify-between"><span className="text-muted-foreground">Watermark</span><span>{watermark ? 'Sim' : 'Não'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Blur redaction</span><span>{blur ? 'Sim' : 'Não'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono">{name || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Data/hora de exportação</span><span className="font-mono">{new Date().toISOString().replace('T', ' ').substring(0, 19)}</span></div>
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
            {step === 0 ? 'Cancelar' : 'Voltar'}
          </button>
          {step < WIZARD_STEPS.length - 1 ? (
            <button onClick={() => setStep(s => Math.min(WIZARD_STEPS.length - 1, s + 1))} disabled={!canPróximo}
              className="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              Continue
            </button>
          ) : (
            <button onClick={submit} disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              {submitting ? (
                <><span className="w-3.5 h-3.5 border-2 border-[hsl(var(--primary-foreground)_/_0.3)] border-t-[hsl(var(--primary-foreground))] rounded-full animate-spin" /> Compiling...</>
              ) : (
                <><Download className="w-3.5 h-3.5" /> Iniciar Exportação</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EvidencePage() {
  const cameras = useVmsDataStore((state) => state.cameras);
  const users = useVmsDataStore((state) => state.users);
  const auditLogs = useVmsDataStore((state) => state.auditLogs);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const evidenceAuditEntries = auditLogs
    .filter((log) => log.entityType === 'Evidence' || log.action.includes('evidence') || log.action.includes('export'))
    .slice(0, 12)
    .map((log) => ({
      id: log.id,
      ts: new Date(log.createdAt),
      user: users.find((user) => user.id === log.userId)?.name ?? 'Sistema',
      action: log.action,
    }));

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Exportar Evidências</h2>
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
          <div className="font-medium text-[hsl(var(--chart-2))]">Modo de cadeia de custódia on-premise ativo</div>
          <div className="text-[hsl(var(--muted-foreground))]">
            All exported packages are SHA-256 signed and include an immutable audit trail. Packages are written to isolated storage and never transmitted externally.
          </div>
        </div>
      </div>

      {/* Package list */}
      <div className="space-y-3">
        {REAL_PACKAGES.map(pkg => (
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
          <h3 className="text-sm font-semibold">Log de Auditoria de Exportação</h3>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Immutable record of all evidence access and export operations</p>
        </div>
        <div className="divide-y divide-border max-h-48 overflow-y-auto">
          {evidenceAuditEntries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
              <Clock className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))] shrink-0" />
              <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))] shrink-0 hidden sm:block">
                {format(entry.ts, 'yyyy-MM-dd HH:mm:ss')}
              </span>
              <span className="font-medium shrink-0">{entry.user}</span>
              <span className="text-[hsl(var(--muted-foreground))] truncate">{entry.action}</span>
            </div>
          ))}
          {evidenceAuditEntries.length === 0 && (
            <div className="px-4 py-6 text-xs text-[hsl(var(--muted-foreground))]">
              Nenhuma acao de evidencia registrada ainda no backend.
            </div>
          )}
        </div>
      </div>

      {REAL_PACKAGES.length === 0 && (
        <div className="rounded-xl border border-card-border bg-card px-5 py-8 text-sm text-[hsl(var(--muted-foreground))]">
          Nenhum pacote de evidência foi gerado ainda. Use as câmeras reais cadastradas ({cameras.length}) para criar o primeiro pacote.
        </div>
      )}
      {showModal && <NewPackageModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
