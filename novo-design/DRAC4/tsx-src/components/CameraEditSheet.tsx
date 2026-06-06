import { useState, useEffect } from 'react';
import { Save, Trash2, Wifi, WifiOff } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Camera, useVmsDataStore } from '../store/vmsDataStore';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../hooks/use-toast';
import { getApiBaseUrl } from '../lib/api-base';
import axios from 'axios';

interface CameraEditSheetProps {
  camera: Camera | null;
  open: boolean;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}

type CameraFormData = {
  name: string;
  zone: string;
  building: string;
  floor: string;
  ipAddress: string;
  rtspPort: string;
  rtspPath: string;
  username: string;
  password: string;
  preferredRtspTransport: 'tcp' | 'udp';
  preferredLiveProtocol: string;
  streamVideoCodec: string;
  streamFps: string;
  recordingMode: 'continuous' | 'motion' | 'schedule' | 'manual';
  retentionDays: string;
  recordingVideoCodec: string;
  hasAudio: boolean;
  ptzCapable: boolean;
  aiEnabled: boolean;
  motionSensitivity: number;
};

const RECORDING_MODES = [
  { value: 'continuous', label: 'Contínua', desc: '24 h ininterrupto' },
  { value: 'motion', label: 'Por movimento', desc: 'Ativa ao detectar movimento' },
  { value: 'schedule', label: 'Agendada', desc: 'Segue janela configurada' },
  { value: 'manual', label: 'Manual', desc: 'Operador inicia / para' },
] as const;

export function CameraEditSheet({ camera, open, onClose, onDeleted }: CameraEditSheetProps) {
  const { toast } = useToast();
  const accessToken = useAuthStore((s) => s.accessToken);
  const loadData = useVmsDataStore((s) => s.load);
  const zones = useVmsDataStore((s) => [...new Set(s.cameras.map((c) => c.zone))]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<CameraFormData | null>(null);

  useEffect(() => {
    if (!camera) return;
    setForm({
      name: camera.name,
      zone: camera.zone,
      building: camera.building,
      floor: camera.floor,
      ipAddress: camera.ipAddress,
      rtspPort: String(camera.rtspPort),
      rtspPath: camera.rtspPath ?? '',
      username: '',
      password: '',
      preferredRtspTransport: camera.preferredRtspTransport,
      preferredLiveProtocol: camera.preferredLiveProtocol,
      streamVideoCodec: camera.streamVideoCodec ?? 'H264',
      streamFps: String(camera.streamFps ?? camera.fps ?? 25),
      recordingMode: camera.recordingMode,
      retentionDays: String(camera.retentionDays),
      recordingVideoCodec: camera.recordingVideoCodec ?? 'H265',
      hasAudio: camera.hasAudio,
      ptzCapable: camera.ptzCapable,
      aiEnabled: camera.aiEnabled,
      motionSensitivity: 65,
    });
    setConfirmDelete(false);
  }, [camera]);

  if (!camera || !form) return null;
  const upd = <K extends keyof CameraFormData>(k: K, v: CameraFormData[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const handleSave = async () => {
    if (!accessToken) return;
    setSaving(true);
    try {
      await axios.patch(
        `${getApiBaseUrl()}/cameras/${camera.id}`,
        {
          name: form.name,
          // NOTE: ajuste estes campos ao seu DTO de PATCH /cameras/:id.
          // O objeto Camera expõe zone/building/floor como strings — enviamos assim.
          // Se sua API usa relações (areaId/siteId), mapeie aqui.
          zone: form.zone,
          building: form.building,
          floor: form.floor,
          ipAddress: form.ipAddress,
          rtspPort: Number(form.rtspPort),
          rtspPath: form.rtspPath || undefined,
          preferredRtspTransport: form.preferredRtspTransport,
          preferredLiveProtocol: form.preferredLiveProtocol,
          recordingMode: form.recordingMode,
          retentionDays: Number(form.retentionDays),
          audioEnabled: form.hasAudio,
          aiEnabled: form.aiEnabled,
          ...(form.password ? { password: form.password } : {}),
        },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      await loadData();
      toast({ title: 'Câmera atualizada', description: form.name });
      onClose();
    } catch (err) {
      toast({
        title: 'Erro ao salvar',
        description: err instanceof Error ? err.message : 'Falha ao salvar câmera.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!accessToken) return;
    try {
      await axios.delete(`${getApiBaseUrl()}/cameras/${camera.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
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
      <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn('w-2 h-2 rounded-full shrink-0',
              camera.isOnline ? 'bg-[hsl(var(--status-online))]' : 'bg-[hsl(var(--status-offline))]')} />
            <div className="min-w-0">
              <SheetTitle className="text-[14px] font-semibold truncate">{camera.name}</SheetTitle>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{camera.code} · {camera.ipAddress}</p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="geral" className="flex flex-col h-full">
            <TabsList className="mx-4 mt-4 shrink-0 grid grid-cols-4 h-9">
              <TabsTrigger value="geral" className="text-xs">Geral</TabsTrigger>
              <TabsTrigger value="stream" className="text-xs">Stream</TabsTrigger>
              <TabsTrigger value="gravacao" className="text-xs">Gravação</TabsTrigger>
              <TabsTrigger value="ia" className="text-xs">IA</TabsTrigger>
            </TabsList>

            {/* ── GERAL ── */}
            <TabsContent value="geral" className="px-5 py-4 space-y-4 mt-0">
              <FormField label="Nome da câmera" required>
                <Input value={form.name} onChange={(e) => upd('name', e.target.value)} className="text-sm" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Zona / Área">
                  <Select value={form.zone} onValueChange={(v) => upd('zone', v)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {zones.map((z) => <SelectItem key={z} value={z} className="text-sm">{z}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Unidade / Prédio">
                  <Input value={form.building} onChange={(e) => upd('building', e.target.value)} className="text-sm" />
                </FormField>
              </div>
              <Separator />
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Conexão</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Endereço IP" required>
                  <Input value={form.ipAddress} onChange={(e) => upd('ipAddress', e.target.value)} className="text-sm font-mono" />
                </FormField>
                <FormField label="Porta RTSP">
                  <Input value={form.rtspPort} onChange={(e) => upd('rtspPort', e.target.value)} className="text-sm font-mono" />
                </FormField>
                <FormField label="Usuário">
                  <Input placeholder="admin" value={form.username} onChange={(e) => upd('username', e.target.value)} className="text-sm" />
                </FormField>
                <FormField label="Senha">
                  <Input type="password" placeholder="Deixe vazio para manter" value={form.password}
                    onChange={(e) => upd('password', e.target.value)} className="text-sm" />
                </FormField>
              </div>
              <FormField label="Caminho RTSP" hint="Vazio = detectar automaticamente">
                <Input value={form.rtspPath} onChange={(e) => upd('rtspPath', e.target.value)}
                  placeholder="/live/ch1main" className="text-sm font-mono" />
              </FormField>
            </TabsContent>

            {/* ── STREAM ── */}
            <TabsContent value="stream" className="px-5 py-4 space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Codec de vídeo">
                  <Select value={form.streamVideoCodec} onValueChange={(v) => upd('streamVideoCodec', v)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['H264', 'H265', 'H265+', 'MJPEG'].map((c) => (
                        <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="FPS do stream">
                  <Select value={form.streamFps} onValueChange={(v) => upd('streamFps', v)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['30', '25', '20', '15', '10', '5'].map((f) => (
                        <SelectItem key={f} value={f} className="text-sm">{f} fps</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Protocolo ao vivo">
                  <Select value={form.preferredLiveProtocol} onValueChange={(v) => upd('preferredLiveProtocol', v)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['auto', 'webrtc', 'hls', 'llhls', 'flv', 'mjpeg'].map((p) => (
                        <SelectItem key={p} value={p} className="text-sm uppercase">{p}</SelectItem>
                      ))}
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
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Capacidades</p>
              <ToggleRow label="Áudio" desc="Captura de áudio da câmera" value={form.hasAudio} onChange={(v) => upd('hasAudio', v)} />
              <ToggleRow label="Controle PTZ" desc="Pan, tilt e zoom via ONVIF" value={form.ptzCapable} onChange={(v) => upd('ptzCapable', v)} />
            </TabsContent>

            {/* ── GRAVAÇÃO ── */}
            <TabsContent value="gravacao" className="px-5 py-4 space-y-4 mt-0">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Modo de gravação</p>
              <div className="space-y-2">
                {RECORDING_MODES.map((m) => (
                  <button key={m.value} onClick={() => upd('recordingMode', m.value)}
                    className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
                      form.recordingMode === m.value
                        ? 'border-[hsl(var(--primary)_/_0.5)] bg-[hsl(var(--primary)_/_0.06)]'
                        : 'border-border hover:bg-[hsl(var(--accent))]'
                    )}>
                    <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                      form.recordingMode === m.value ? 'border-[hsl(var(--primary))]' : 'border-muted-foreground/40')}>
                      {form.recordingMode === m.value &&
                        <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]" />}
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
                      {['H264', 'H265', 'H265+'].map((c) => (
                        <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            </TabsContent>

            {/* ── IA ── */}
            <TabsContent value="ia" className="px-5 py-4 space-y-4 mt-0">
              <ToggleRow label="Análise por IA" desc="Detecção de objetos no substream" value={form.aiEnabled}
                onChange={(v) => upd('aiEnabled', v)} />
              <div className={cn('space-y-3 transition-opacity', !form.aiEnabled && 'opacity-40 pointer-events-none')}>
                <Separator />
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Sensibilidade de movimento</p>
                <div className="flex items-center gap-4">
                  <Slider value={[form.motionSensitivity]} min={0} max={100} step={5}
                    onValueChange={([v]) => upd('motionSensitivity', v)} className="flex-1" />
                  <span className="text-sm font-mono text-muted-foreground w-10 text-right">{form.motionSensitivity}%</span>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Danger zone */}
          <div className="px-5 pb-5">
            <Separator className="mb-4" />
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">Zona de perigo</p>
            {!confirmDelete ? (
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/8"
                onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Remover câmera
              </Button>
            ) : (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                <p className="text-[12px] font-medium text-destructive">Remover {camera.name}?</p>
                <p className="text-[11px] text-muted-foreground">As gravações existentes serão mantidas conforme a política de retenção.</p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
                  <Button variant="destructive" size="sm" onClick={handleDelete}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Confirmar remoção
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="px-5 py-3 border-t border-border shrink-0 flex-row gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="ml-auto min-w-[140px]">
            {saving ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin mr-2" /> : <Save className="w-3.5 h-3.5 mr-2" />}
            Salvar alterações
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ── helpers ── */
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
