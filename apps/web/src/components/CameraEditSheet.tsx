import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useLocation } from 'wouter';
import { Save, Trash2, ExternalLink, LoaderCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Camera, useVmsDataStore } from '../store/vmsDataStore';
import { useAuthStore } from '../store/authStore';
import { toast } from '../hooks/use-toast';
import { getApiBaseUrl } from '../lib/api-base';
import { normalizeVideoCodec, normalizePreferredLiveProtocol } from '../lib/camera-format';

interface CameraEditSheetProps {
  camera: Camera | null;
  open: boolean;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}

type Form = {
  name: string;
  ip: string;
  rtspPort: string;
  username: string;
  password: string;
  rtspPath: string;
  preferredRtspTransport: 'tcp' | 'udp';
  preferredLiveProtocol: string;
  streamVideoCodec: string;
  recordingVideoCodec: string;
  recordingMode: 'continuous' | 'motion' | 'schedule' | 'manual';
  retentionDays: string;
  audioEnabled: boolean;
  aiEnabled: boolean;
  alarmsEnabled: boolean;
};

const RECORDING_MODES = [
  { value: 'continuous', label: 'Contínua', desc: '24 h ininterrupto' },
  { value: 'motion', label: 'Por movimento', desc: 'Ativa ao detectar movimento' },
  { value: 'schedule', label: 'Agendada', desc: 'Segue janela configurada' },
  { value: 'manual', label: 'Manual', desc: 'Operador inicia / para' },
] as const;

const CODECS = ['original', 'h264', 'h265', 'mjpeg'] as const;
const LIVE_PROTOCOLS = ['webrtc', 'hls', 'llhls', 'mjpeg'] as const;

export function CameraEditSheet({ camera, open, onClose, onDeleted }: CameraEditSheetProps) {
  const [, setLocation] = useLocation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const loadData = useVmsDataStore((s) => s.load);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const cameraId = camera?.id ?? null;
  useEffect(() => {
    if (!cameraId || !accessToken) return;
    let cancelled = false;
    setForm(null);
    setConfirmDelete(false);
    setLoading(true);
    void axios
      .get(`${getApiBaseUrl()}/cameras/${cameraId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(({ data }) => {
        if (cancelled) return;
        setForm({
          name: data.name ?? camera.name,
          ip: data.ip ?? camera.ipAddress,
          rtspPort: String(data.rtspPort ?? camera.rtspPort ?? 554),
          username: data.username ?? '',
          password: '',
          rtspPath: data.rtspPath ?? '',
          preferredRtspTransport: (data.preferredRtspTransport ?? 'tcp') as 'tcp' | 'udp',
          preferredLiveProtocol: normalizePreferredLiveProtocol(data.preferredLiveProtocol),
          streamVideoCodec: normalizeVideoCodec(data.streamVideoCodec),
          recordingVideoCodec: normalizeVideoCodec(data.recordingVideoCodec),
          recordingMode: (data.recordingMode ?? (data.recordingEnabled ? 'continuous' : 'manual')) as Form['recordingMode'],
          retentionDays: String(data.retentionDays ?? 7),
          audioEnabled: Boolean(data.audioEnabled),
          aiEnabled: data.aiEnabled !== false,
          alarmsEnabled: data.alarmsEnabled !== false,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        toast({
          title: 'Falha ao carregar câmera',
          description: err instanceof Error ? err.message : 'Não foi possível carregar a configuração.',
          variant: 'destructive',
        });
        onCloseRef.current();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cameraId, accessToken]);

  if (!camera) return null;
  const upd = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const handleSave = async () => {
    if (!accessToken || !form) return;
    setSaving(true);
    try {
      await axios.patch(
        `${getApiBaseUrl()}/cameras/${camera.id}`,
        {
          name: form.name.trim(),
          ip: form.ip.trim(),
          rtspPort: Number(form.rtspPort),
          username: form.username.trim() || undefined,
          ...(form.password.trim() ? { password: form.password } : {}),
          rtspPath: form.rtspPath.trim(),
          preferredRtspTransport: form.preferredRtspTransport,
          preferredLiveProtocol: form.preferredLiveProtocol,
          streamVideoCodec: normalizeVideoCodec(form.streamVideoCodec),
          recordingVideoCodec: normalizeVideoCodec(form.recordingVideoCodec),
          recordingMode: form.recordingMode,
          retentionDays: Number(form.retentionDays),
          audioEnabled: form.audioEnabled,
          aiEnabled: form.aiEnabled,
          alarmsEnabled: form.alarmsEnabled,
        },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      await loadData();
      toast({ title: 'Câmera atualizada', description: form.name });
      onClose();
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (Array.isArray(err.response?.data?.message) ? err.response?.data?.message.join('\n') : err.response?.data?.message) ?? err.message
        : err instanceof Error ? err.message : 'Falha ao salvar.';
      toast({ title: 'Erro ao salvar', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!accessToken) return;
    try {
      await axios.delete(`${getApiBaseUrl()}/cameras/${camera.id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      await loadData();
      toast({ title: 'Câmera removida', description: camera.name });
      onDeleted?.(camera.id);
      onClose();
    } catch (err) {
      toast({ title: 'Erro ao remover', description: err instanceof Error ? err.message : 'Falha.', variant: 'destructive' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[460px] sm:max-w-[460px] flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 py-4 border-b border-border shrink-0 space-y-0 text-left">
          <div className="flex items-center gap-3">
            <span className={cn('w-2 h-2 rounded-full shrink-0', camera.isOnline ? 'bg-[hsl(var(--status-online))]' : 'bg-[hsl(var(--status-offline))]')} />
            <div className="min-w-0">
              <SheetTitle className="text-[14px] font-semibold truncate">{camera.name}</SheetTitle>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">{camera.zone} · {camera.ipAddress}</p>
            </div>
          </div>
        </SheetHeader>

        {loading || !form ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <LoaderCircle className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <Tabs defaultValue="geral" className="flex flex-col">
                <TabsList className="mx-4 mt-4 shrink-0 grid grid-cols-4 h-9">
                  <TabsTrigger value="geral" className="text-xs">Geral</TabsTrigger>
                  <TabsTrigger value="stream" className="text-xs">Stream</TabsTrigger>
                  <TabsTrigger value="gravacao" className="text-xs">Gravação</TabsTrigger>
                  <TabsTrigger value="ia" className="text-xs">IA</TabsTrigger>
                </TabsList>

                {/* GERAL */}
                <TabsContent value="geral" className="px-5 py-4 space-y-4 mt-0">
                  <FormField label="Nome da câmera" required>
                    <Input value={form.name} onChange={(e) => upd('name', e.target.value)} className="text-sm" />
                  </FormField>
                  <Separator />
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Conexão</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Endereço IP" required>
                      <Input value={form.ip} onChange={(e) => upd('ip', e.target.value)} className="text-sm font-mono" />
                    </FormField>
                    <FormField label="Porta RTSP">
                      <Input value={form.rtspPort} onChange={(e) => upd('rtspPort', e.target.value)} className="text-sm font-mono" />
                    </FormField>
                    <FormField label="Usuário">
                      <Input placeholder="admin" value={form.username} onChange={(e) => upd('username', e.target.value)} className="text-sm" />
                    </FormField>
                    <FormField label="Senha">
                      <Input type="password" placeholder="Manter atual" value={form.password} onChange={(e) => upd('password', e.target.value)} className="text-sm" />
                    </FormField>
                  </div>
                  <FormField label="Caminho RTSP" hint="vazio = detectar">
                    <Input value={form.rtspPath} onChange={(e) => upd('rtspPath', e.target.value)} placeholder="/live/ch1main" className="text-sm font-mono" />
                  </FormField>
                </TabsContent>

                {/* STREAM */}
                <TabsContent value="stream" className="px-5 py-4 space-y-4 mt-0">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Codec de vídeo">
                      <Select value={form.streamVideoCodec} onValueChange={(v) => upd('streamVideoCodec', v)}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CODECS.map((c) => <SelectItem key={c} value={c} className="text-sm uppercase">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Protocolo ao vivo">
                      <Select value={form.preferredLiveProtocol} onValueChange={(v) => upd('preferredLiveProtocol', v)}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LIVE_PROTOCOLS.map((p) => <SelectItem key={p} value={p} className="text-sm uppercase">{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Transporte RTSP">
                      <Select value={form.preferredRtspTransport} onValueChange={(v) => upd('preferredRtspTransport', v as 'tcp' | 'udp')}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tcp" className="text-sm">TCP</SelectItem>
                          <SelectItem value="udp" className="text-sm">UDP</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                  </div>
                  <Separator />
                  <ToggleRow label="Áudio" desc="Captura de áudio da câmera" value={form.audioEnabled} onChange={(v) => upd('audioEnabled', v)} />
                </TabsContent>

                {/* GRAVAÇÃO */}
                <TabsContent value="gravacao" className="px-5 py-4 space-y-4 mt-0">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Modo de gravação</p>
                  <div className="space-y-2">
                    {RECORDING_MODES.map((m) => (
                      <button key={m.value} onClick={() => upd('recordingMode', m.value)}
                        className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
                          form.recordingMode === m.value ? 'border-[hsl(var(--primary)_/_0.5)] bg-[hsl(var(--primary)_/_0.06)]' : 'border-border hover:bg-[hsl(var(--accent))]')}>
                        <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                          form.recordingMode === m.value ? 'border-[hsl(var(--primary))]' : 'border-muted-foreground/40')}>
                          {form.recordingMode === m.value && <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]" />}
                        </div>
                        <div>
                          <div className="text-[12.5px] font-medium">{m.label}</div>
                          <div className="text-[10px] text-muted-foreground">{m.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Retenção (dias)">
                      <Input value={form.retentionDays} onChange={(e) => upd('retentionDays', e.target.value)} className="text-sm font-mono" />
                    </FormField>
                    <FormField label="Codec de gravação">
                      <Select value={form.recordingVideoCodec} onValueChange={(v) => upd('recordingVideoCodec', v)}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CODECS.map((c) => <SelectItem key={c} value={c} className="text-sm uppercase">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormField>
                  </div>
                </TabsContent>

                {/* IA */}
                <TabsContent value="ia" className="px-5 py-4 space-y-4 mt-0">
                  <ToggleRow label="Análise por IA" desc="Detecção de objetos no substream" value={form.aiEnabled} onChange={(v) => upd('aiEnabled', v)} />
                  <Separator />
                  <ToggleRow label="Alarmes" desc="Gerar alarmes para esta câmera" value={form.alarmsEnabled} onChange={(v) => upd('alarmsEnabled', v)} />
                </TabsContent>
              </Tabs>

              {/* Avançado + Danger zone */}
              <div className="px-5 pb-5 space-y-4">
                <Separator />
                <button
                  onClick={() => { onClose(); setLocation(`/cameras/${camera.id}?tab=settings`); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border hover:bg-[hsl(var(--accent))] transition-colors text-left"
                >
                  <div>
                    <div className="text-[12px] font-medium">Configuração avançada</div>
                    <div className="text-[10px] text-muted-foreground">Teste de conexão, canais, resolução e diagnóstico</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                </button>

                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Zona de perigo</p>
                {!confirmDelete ? (
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Remover câmera
                  </Button>
                ) : (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                    <p className="text-[12px] font-medium text-destructive">Remover {camera.name}?</p>
                    <p className="text-[11px] text-muted-foreground">As gravações existentes seguem a política de retenção.</p>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
                      <Button variant="destructive" size="sm" onClick={() => void handleDelete()}>
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Confirmar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <SheetFooter className="px-5 py-3 border-t border-border shrink-0 flex-row gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
              <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="ml-auto min-w-[140px]">
                {saving ? <LoaderCircle className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
                Salvar alterações
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FormField({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
        {hint && <span className="ml-1 text-[10px] font-normal opacity-60">({hint})</span>}
      </Label>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <div>
        <div className="text-[12.5px] font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
