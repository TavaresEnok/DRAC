import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { CheckCircle2, Clock3, FileArchive, ShieldCheck, XCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiBaseUrl } from '../lib/api-base';
import { useAuthStore } from '../store/authStore';
import { toast } from '../hooks/use-toast';

type Investigation = { id: string; title: string; status: string };
type ExportItem = {
  id: string;
  type: 'export_request' | 'export_package' | string;
  label: string;
  notes?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
};
type VerifyResult = {
  ok: boolean;
  hashValid: boolean;
  signatureValid: boolean;
  details?: string[];
};

const API_URL = getApiBaseUrl();

function authHeaders(accessToken: string | null) {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
}

export default function EvidencePage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const client = useMemo(() => axios.create({ baseURL: API_URL, headers: authHeaders(accessToken) }), [accessToken]);

  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [investigationId, setInvestigationId] = useState('');
  const [exportsList, setExportsList] = useState<ExportItem[]>([]);
  const [reason, setReason] = useState('');
  const [formatType, setFormatType] = useState<'MP4' | 'AVI' | 'NATIVE'>('MP4');
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  const load = async (targetId?: string) => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const inv = await client.get<{ items: Investigation[] }>('/investigations');
      const items = Array.isArray(inv.data.items) ? inv.data.items : [];
      setInvestigations(items);
      const active = targetId || investigationId || items[0]?.id || '';
      if (active) {
        setInvestigationId(active);
        const exp = await client.get<{ items: ExportItem[] }>(`/investigations/${active}/exports`);
        setExportsList(Array.isArray(exp.data.items) ? exp.data.items : []);
      } else {
        setExportsList([]);
      }
    } catch (error) {
      toast({ title: 'Falha ao carregar evidências', description: error instanceof Error ? error.message : 'Erro inesperado', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const requestExport = async () => {
    if (!investigationId) return;
    const clean = reason.trim();
    if (!clean) {
      toast({ title: 'Motivo obrigatório', description: 'Informe o motivo da solicitação.' , variant: 'destructive' });
      return;
    }
    try {
      await client.post(`/investigations/${investigationId}/exports/request`, { reason: clean, format: formatType });
      setReason('');
      await load(investigationId);
      toast({ title: 'Solicitação criada', description: 'Exportação enviada para aprovação.' });
    } catch (error) {
      toast({ title: 'Falha ao solicitar exportação', description: error instanceof Error ? error.message : 'Erro inesperado', variant: 'destructive' });
    }
  };

  const review = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    const why = window.prompt(`Motivo para ${decision === 'APPROVED' ? 'aprovar' : 'rejeitar'}:`)?.trim() ?? '';
    if (!why) return;
    try {
      await client.post(`/investigations/${investigationId}/exports/${id}/review`, { decision, reason: why });
      await load(investigationId);
      toast({ title: decision === 'APPROVED' ? 'Solicitação aprovada' : 'Solicitação rejeitada' });
    } catch (error) {
      toast({ title: 'Falha na revisão', description: error instanceof Error ? error.message : 'Erro inesperado', variant: 'destructive' });
    }
  };

  const execute = async (id: string) => {
    const why = window.prompt('Motivo da execução da exportação:')?.trim() ?? '';
    if (!why) return;
    try {
      await client.post(`/investigations/${investigationId}/exports/${id}/execute`, { reason: why });
      await load(investigationId);
      toast({ title: 'Pacote gerado', description: 'Pacote exportado e assinado com sucesso.' });
    } catch (error) {
      toast({ title: 'Falha ao executar exportação', description: error instanceof Error ? error.message : 'Erro inesperado', variant: 'destructive' });
    }
  };

  const downloadPackage = async (packageItemId: string) => {
    if (!investigationId) return;
    try {
      const response = await client.get(`/investigations/${investigationId}/exports/${packageItemId}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `investigation-${investigationId}-package-${packageItemId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: 'Falha no download do pacote', description: error instanceof Error ? error.message : 'Erro inesperado', variant: 'destructive' });
    }
  };

  const verifyPackageFile = async (file: File) => {
    if (!file) return;
    setVerifying(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const response = await client.post<VerifyResult>('/evidence/verify', {
        evidencePackage: parsed,
      });
      setVerifyResult(response.data);
      toast({
        title: response.data.ok ? 'Pacote íntegro' : 'Pacote com falha de integridade',
        description: response.data.ok ? 'Hash e assinatura válidos.' : 'Verifique os detalhes de validação.',
        variant: response.data.ok ? 'default' : 'destructive',
      });
    } catch (error) {
      setVerifyResult(null);
      toast({
        title: 'Falha ao verificar pacote',
        description: error instanceof Error ? error.message : 'Arquivo inválido ou erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Evidências e Exportação</h2>
          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Fluxo real com aprovação, execução e assinatura de pacote.</p>
        </div>
        <button onClick={() => void load(investigationId)} className="h-8 px-3 rounded border border-border text-xs hover:bg-[hsl(var(--accent))]">Atualizar</button>
      </div>

      <div className="grid gap-3 md:grid-cols-[320px_1fr]">
        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div>
            <div className="text-xs font-medium mb-1">Investigação</div>
            <Select value={investigationId || '__none__'} onValueChange={(value) => { if (value !== '__none__') void load(value); }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs">Selecione</SelectItem>
                {investigations.map((inv) => <SelectItem key={inv.id} value={inv.id} className="text-xs">{inv.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-xs font-medium mb-1">Formato</div>
            <Select value={formatType} onValueChange={(v) => setFormatType(v as 'MP4' | 'AVI' | 'NATIVE')}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MP4" className="text-xs">MP4</SelectItem>
                <SelectItem value="AVI" className="text-xs">AVI</SelectItem>
                <SelectItem value="NATIVE" className="text-xs">NATIVE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-xs font-medium mb-1">Motivo da solicitação</div>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} className="w-full rounded border border-border bg-background p-2 text-xs" />
          </div>

          <button onClick={() => void requestExport()} disabled={!investigationId || !reason.trim()} className="h-9 w-full rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold disabled:opacity-50">
            Solicitar Exportação
          </button>
          <button
            onClick={async () => {
              if (!investigationId) return;
              setRetrying(true);
              try {
                await client.post(`/investigations/${investigationId}/exports/retry-signatures`);
                await load(investigationId);
                toast({ title: 'Reprocessamento enfileirado' });
              } catch (error) {
                toast({ title: 'Falha no reprocessamento', description: error instanceof Error ? error.message : 'Erro inesperado', variant: 'destructive' });
              } finally {
                setRetrying(false);
              }
            }}
            disabled={!investigationId || retrying}
            className="h-8 w-full rounded border border-border text-xs hover:bg-[hsl(var(--accent))] disabled:opacity-50"
          >
            {retrying ? 'Enfileirando...' : 'Reprocessar assinaturas pendentes'}
          </button>
          <div className="pt-1 border-t border-border space-y-2">
            <div className="text-xs font-medium">Verificar pacote (.json)</div>
            <input
              type="file"
              accept="application/json,.json"
              disabled={verifying}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void verifyPackageFile(file);
                event.currentTarget.value = '';
              }}
              className="block w-full text-[11px] file:mr-2 file:h-7 file:rounded file:border file:border-border file:bg-background file:px-2 file:text-[11px]"
            />
            {verifyResult ? (
              <div className={`rounded border p-2 text-[11px] ${verifyResult.ok ? 'border-emerald-500/40 text-emerald-500' : 'border-rose-500/40 text-rose-500'}`}>
                <div className="font-semibold">{verifyResult.ok ? 'Pacote válido' : 'Pacote inválido'}</div>
                <div>Hash: {verifyResult.hashValid ? 'válido' : 'inválido'}</div>
                <div>Assinatura: {verifyResult.signatureValid ? 'válida' : 'inválida'}</div>
                {Array.isArray(verifyResult.details) && verifyResult.details.length > 0 ? (
                  <div className="text-[10px] pt-1 text-[hsl(var(--muted-foreground))]">{verifyResult.details.join(' ')}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-xs font-medium">Histórico de Exportações</div>
          <div className="max-h-[65vh] overflow-auto divide-y divide-border">
            {loading && <div className="px-4 py-4 text-xs text-[hsl(var(--muted-foreground))]">Carregando...</div>}
            {!loading && exportsList.length === 0 && <div className="px-4 py-4 text-xs text-[hsl(var(--muted-foreground))]">Sem registros de exportação.</div>}
            {exportsList.map((entry) => {
              const meta = (entry.metadata ?? {}) as Record<string, unknown>;
              const status = String(meta.status ?? '').toUpperCase();
              const progress = Number(meta.progress ?? 0);
              return (
                <div key={entry.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold">{entry.label}</div>
                    <div className="text-[10px] font-mono text-[hsl(var(--muted-foreground))]">{format(new Date(entry.createdAt), 'yyyy-MM-dd HH:mm:ss')}</div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {entry.type === 'export_package' ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Clock3 className="h-3.5 w-3.5 text-amber-500" />}
                    <span className="font-mono">{entry.type}</span>
                    {status && <span className="rounded border border-border px-1.5 py-0.5 text-[10px]">{status}</span>}
                    {Number.isFinite(progress) && progress > 0 ? <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{progress}%</span> : null}
                  </div>
                  {Number.isFinite(progress) && progress > 0 && progress < 100 ? (
                    <div className="h-1.5 rounded bg-[hsl(var(--muted))] overflow-hidden">
                      <div className="h-full bg-[hsl(var(--primary))]" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
                    </div>
                  ) : null}
                  {entry.notes ? <div className="text-xs text-[hsl(var(--muted-foreground))]">{entry.notes}</div> : null}
                  {entry.type === 'export_request' && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {user?.role === 'admin' && status === 'PENDING' && (
                        <>
                          <button onClick={() => void review(entry.id, 'APPROVED')} className="h-7 px-2.5 rounded border border-emerald-500/40 text-emerald-500 text-xs inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Aprovar</button>
                          <button onClick={() => void review(entry.id, 'REJECTED')} className="h-7 px-2.5 rounded border border-rose-500/40 text-rose-500 text-xs inline-flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> Rejeitar</button>
                        </>
                      )}
                      {status === 'APPROVED' && (
                        <button onClick={() => void execute(entry.id)} className="h-7 px-2.5 rounded border border-primary/40 text-primary text-xs inline-flex items-center gap-1"><FileArchive className="h-3.5 w-3.5" /> Executar Exportação</button>
                      )}
                    </div>
                  )}
                  {entry.type === 'export_package' && status !== 'PROCESSING' && status !== 'QUEUED' && (
                    <div className="pt-1">
                      <button onClick={() => void downloadPackage(entry.id)} className="h-7 px-2.5 rounded border border-primary/40 text-primary text-xs inline-flex items-center gap-1">
                        <FileArchive className="h-3.5 w-3.5" /> Download Pacote
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
