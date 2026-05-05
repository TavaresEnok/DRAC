import { useState } from 'react';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutGrid, List, Search, Filter, Plus, Edit, PlaySquare,
  Crosshair, RefreshCw, ChevronRight, X, Wifi, HardDrive,
  Camera as CameraIcon, Check, Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { Camera, useVmsDataStore } from '../store/vmsDataStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocation } from 'wouter';
import { getApiBaseUrl } from '../lib/api-base';
import { useAuthStore } from '../store/authStore';
const STATUSES = ['All', 'online', 'recording', 'motion', 'alarm', 'offline', 'no_signal', 'maintenance'];

const STATUS_BADGE: Record<string, string> = {
  online: 'bg-[hsl(150,65%,42%_/_0.12)] text-[hsl(150,65%,42%)] border-[hsl(150,65%,42%_/_0.3)]',
  recording: 'bg-[hsl(var(--destructive)_/_0.1)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)_/_0.3)]',
  motion: 'bg-[hsl(var(--chart-2)_/_0.12)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)_/_0.3)]',
  alarm: 'bg-[hsl(var(--destructive)_/_0.1)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)_/_0.3)]',
  offline: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-border',
  no_signal: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-border',
  maintenance: 'bg-[hsl(var(--chart-2)_/_0.12)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)_/_0.3)]',
};

function WizardModal({
  onClose,
  zones,
  onCreated,
  onTestConnection,
}: {
  onClose: () => void;
  zones: string[];
  onCreated: (payload: {
    name: string;
    ip: string;
    rtspPort: number;
    onvifPort?: number;
    username: string;
    password: string;
    rtspPath?: string;
    onvifPath?: string;
    onvifProfileToken?: string;
    channel?: number;
    subtype?: number;
    recordingEnabled: boolean;
  }) => Promise<void>;
  onTestConnection: (payload: {
    ip: string;
    rtspPort: number;
    onvifPort?: number;
    username?: string;
    password?: string;
    rtspPath?: string;
    onvifPath?: string;
    onvifProfileToken?: string;
    channel?: number;
    subtype?: number;
  }) => Promise<{
    rtspReachable: boolean;
    rtspReachableAny?: boolean;
    reachableRtspPorts?: number[];
    onvifReachable: boolean;
    ptzDigestOk?: boolean;
    reachableOnvifPorts?: number[];
    rtspAuthOk?: boolean;
    selectedRtspPortAuthOk?: boolean;
    detectedRtspPort?: number | null;
    detectedRtspPath?: string | null;
    suggestedRtspPath?: string;
    detectedOnvifPort?: number | null;
    detectedOnvifPath?: string | null;
    detectedOnvifProfileToken?: string | null;
    rtspProbeError?: string | null;
    status: string;
  }>;
}) {
  const [step, setStep] = useState(0);
  const steps = ['Conexão', 'Identidade', 'Gravação', 'Confirmar'];
  const validZones = zones.filter((zone) => zone !== 'All');
  const [form, setForm] = useState({
    ip: '',
    port: '554',
    onvifPort: '8075',
    protocol: 'rtsp',
    username: '',
    password: '',
    rtspPath: '',
    onvifPath: '/onvif/ptz_service',
    onvifProfileToken: 'Profile000',
    channel: '1',
    subtype: '0',
    name: '',
    zone: validZones[0] ?? '',
    building: validZones[0] ?? '',
    recordingMode: 'continuous',
    retentionDays: '90',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const canAdvance = (() => {
    if (step === 0) {
      return form.ip.trim().length > 0 && form.port.trim().length > 0 && form.username.trim().length > 0 && form.password.trim().length > 0;
    }
    if (step === 1) {
      return form.name.trim().length > 0;
    }
    if (step === 2) {
      return form.retentionDays.trim().length > 0;
    }
    return true;
  })();

  const handlePrimary = async () => {
    if (step < steps.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    setIsSaving(true);
    try {
      await onCreated({
        name: form.name.trim(),
        ip: form.ip.trim(),
        rtspPort: Number(form.port),
        onvifPort: form.onvifPort.trim() ? Number(form.onvifPort) : undefined,
        username: form.username.trim(),
        password: form.password,
        rtspPath: form.rtspPath.trim() || undefined,
        onvifPath: form.onvifPath.trim() || undefined,
        onvifProfileToken: form.onvifProfileToken.trim() || undefined,
        channel: Number(form.channel),
        subtype: Number(form.subtype),
        recordingEnabled: form.recordingMode !== 'manual',
      });
      onClose();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível adicionar a câmera.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!form.ip.trim() || !form.port.trim()) {
      window.alert('Preencha IP e porta RTSP antes de testar conexão.');
      return;
    }
    setIsTesting(true);
    try {
      const result = await onTestConnection({
        ip: form.ip.trim(),
        rtspPort: Number(form.port),
        onvifPort: form.onvifPort.trim() ? Number(form.onvifPort) : undefined,
        username: form.username.trim(),
        password: form.password,
        rtspPath: form.rtspPath.trim(),
        onvifPath: form.onvifPath.trim(),
        onvifProfileToken: form.onvifProfileToken.trim(),
        channel: Number(form.channel),
        subtype: Number(form.subtype),
      });
      if (result.suggestedRtspPath && !form.rtspPath.trim()) updateField('rtspPath', result.suggestedRtspPath);
      const selectedPort = Number(form.port);
      if (
        typeof result.detectedRtspPort === 'number' &&
        result.detectedRtspPort === selectedPort &&
        result.detectedRtspPath
      ) {
        updateField('rtspPath', result.detectedRtspPath);
      }
      if (typeof result.detectedOnvifPort === 'number') updateField('onvifPort', String(result.detectedOnvifPort));
      if (result.detectedOnvifPath) updateField('onvifPath', result.detectedOnvifPath);
      if (result.detectedOnvifProfileToken) updateField('onvifProfileToken', result.detectedOnvifProfileToken);
      window.alert(
        `Teste concluído\nRTSP porta informada: ${result.rtspReachable ? 'ok' : 'falhou'}\nRTSP auth na porta informada: ${result.selectedRtspPortAuthOk ? 'ok' : 'falhou'}\nRTSP válido (qualquer porta): ${result.rtspAuthOk ? 'ok' : 'falhou'}\nPortas RTSP detectadas: ${(result.reachableRtspPorts ?? []).join(', ') || '-'}\nPorta RTSP sugerida: ${result.detectedRtspPort ?? '-'}\nCaminho RTSP sugerido: ${result.detectedRtspPath ?? result.suggestedRtspPath ?? '-'}\nONVIF: ${result.onvifReachable ? 'ok' : 'falhou'}\nPTZ digest: ${result.ptzDigestOk ? 'ok' : 'falhou'}\nStatus: ${result.status}${result.rtspProbeError ? `\nErro RTSP: ${result.rtspProbeError}` : ''}`,
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Falha ao testar conexão.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleAutoPath = () => {
    const channel = Number(form.channel || '1');
    const subtype = Number(form.subtype || '0');
    updateField('rtspPath', `/cam/realmonitor?channel=${Number.isFinite(channel) ? channel : 1}&subtype=${Number.isFinite(subtype) ? subtype : 0}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-card border border-border rounded-lg w-[520px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Assistente de Nova Câmera</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[hsl(var(--accent))] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Step indicators */}
        <div className="flex items-center px-5 py-3 border-b border-border">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-colors ${i === step ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : i < step ? 'bg-[hsl(var(--chart-3))] text-white' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className={`ml-1.5 text-[11px] ${i === step ? 'text-foreground font-medium' : 'text-[hsl(var(--muted-foreground))]'}`}>{s}</span>
              {i < steps.length - 1 && <div className="w-8 h-px bg-border mx-2" />}
            </div>
          ))}
        </div>

        <div className="p-5 min-h-48">
          {step === 0 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Endereço IP</label>
                <input value={form.ip} onChange={(e) => updateField('ip', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="192.168.20.149" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Porta</label>
                  <input value={form.port} onChange={(e) => updateField('port', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="554" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Porta ONVIF</label>
                  <input value={form.onvifPort} onChange={(e) => updateField('onvifPort', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="80" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Protocolo</label>
                  <Select value={form.protocol} onValueChange={(value) => updateField('protocol', value)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rtsp" className="text-xs">RTSP</SelectItem>
                      <SelectItem value="onvif" className="text-xs">ONVIF</SelectItem>
                      <SelectItem value="http" className="text-xs">HTTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Usuário</label>
                  <input value={form.username} onChange={(e) => updateField('username', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="admin" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Senha</label>
                  <input type="password" value={form.password} onChange={(e) => updateField('password', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="********" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Canal</label>
                  <input value={form.channel} onChange={(e) => updateField('channel', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="1" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Subtype</label>
                  <input value={form.subtype} onChange={(e) => updateField('subtype', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="0" />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Caminho RTSP</label>
                  <div className="flex gap-2">
                    <input value={form.rtspPath} onChange={(e) => updateField('rtspPath', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="/cam/realmonitor?channel=1&subtype=0" />
                    <button type="button" onClick={handleAutoPath} className="h-9 px-3 rounded border border-border text-xs hover:bg-[hsl(var(--accent))]">Auto</button>
                  </div>
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Caminho ONVIF</label>
                  <input value={form.onvifPath} onChange={(e) => updateField('onvifPath', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="/onvif/ptz_service" />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Token de Perfil ONVIF</label>
                  <input value={form.onvifProfileToken} onChange={(e) => updateField('onvifProfileToken', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="Profile000" />
                </div>
              </div>
              <button onClick={() => void handleTestConnection()} disabled={isTesting} className="flex items-center gap-2 px-3 py-1.5 rounded border border-border text-xs hover:bg-[hsl(var(--accent))] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Wifi className="w-3.5 h-3.5" />
                {isTesting ? 'Testando...' : 'Testar Conexão'}
              </button>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Nome da Câmera</label>
                <input value={form.name} onChange={(e) => updateField('name', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="Ex.: Legacy Camera - Canal 1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Zona</label>
                    <Select value={form.zone} onValueChange={(value) => updateField('zone', value)}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecionar zona..." /></SelectTrigger>
                    <SelectContent>{validZones.map((zone) => <SelectItem key={zone} value={zone} className="text-xs">{zone}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Unidade</label>
                  <Select value={form.building} onValueChange={(value) => updateField('building', value)}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {validZones.map((zone) => <SelectItem key={zone} value={zone} className="text-xs">{zone}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Modo de Gravação</label>
                <Select value={form.recordingMode} onValueChange={(value) => updateField('recordingMode', value)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="continuous" className="text-xs">Contínua</SelectItem>
                    <SelectItem value="motion" className="text-xs">Por Movimento</SelectItem>
                    <SelectItem value="schedule" className="text-xs">Agenda</SelectItem>
                    <SelectItem value="manual" className="text-xs">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Retenção (dias)</label>
                <input value={form.retentionDays} onChange={(e) => updateField('retentionDays', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" />
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-background p-4 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Endereço IP</span><span className="font-mono">{form.ip || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Porta</span><span className="font-mono">{form.port || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Porta ONVIF</span><span className="font-mono">{form.onvifPort || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Protocolo</span><span className="font-mono uppercase">{form.protocol}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Nome</span><span>{form.name || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Usuário</span><span>{form.username || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Canal</span><span className="font-mono">{form.channel || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Subtype</span><span className="font-mono">{form.subtype || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">RTSP Path</span><span className="font-mono break-all text-right">{form.rtspPath || '(padrão automático)'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">ONVIF Path</span><span className="font-mono break-all text-right">{form.onvifPath || '/onvif/ptz_service'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">ONVIF Token</span><span className="font-mono">{form.onvifProfileToken || 'Profile000'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Zona</span><span>{form.zone || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Unidade</span><span>{form.building || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Gravação</span><span className="capitalize">{form.recordingMode}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Retenção</span><span className="font-mono">{form.retentionDays || '-'} dias</span></div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-4 py-2 rounded border border-border text-xs hover:bg-[hsl(var(--accent))] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >Voltar</button>
          <button
            onClick={() => void handlePrimary()}
            disabled={!canAdvance || isSaving}
            className="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >{isSaving ? 'Adicionando...' : step < steps.length - 1 ? 'Próximo' : 'Adicionar Câmera'}</button>
        </div>
      </div>
    </div>
  );
}

export default function CamerasPage() {
  const API_URL = getApiBaseUrl();
  const [, setLocation] = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const cameras = useVmsDataStore((state) => state.cameras);
  const loadData = useVmsDataStore((state) => state.load);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [search, setSearch] = useState('');
  const [zoneFilter, setZonaFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showWizard, setShowWizard] = useState(false);
  const [selectedCam, setSelectedCam] = useState<Camera | null>(null);
  const zones = ['All', ...Array.from(new Set(cameras.map((camera) => camera.zone)))];

  const filtered = cameras.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
    if (zoneFilter !== 'All' && c.zone !== zoneFilter) return false;
    if (statusFilter !== 'All' && c.status !== statusFilter) return false;
    return true;
  });

  const deleteCamera = async (camera: Camera) => {
    if (!accessToken) return;
    const confirmed = window.confirm(`Excluir câmera "${camera.name}" (${camera.code})?`);
    if (!confirmed) return;
    try {
      await axios.delete(`${API_URL}/cameras/${camera.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (selectedCam?.id === camera.id) setSelectedCam(null);
      await loadData();
    } catch {
      window.alert('Não foi possível excluir a câmera.');
    }
  };

  const createCamera = async (payload: {
    name: string;
    ip: string;
    rtspPort: number;
    onvifPort?: number;
    username: string;
    password: string;
    rtspPath?: string;
    onvifPath?: string;
    onvifProfileToken?: string;
    channel?: number;
    subtype?: number;
    recordingEnabled: boolean;
  }) => {
    if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.');
    await axios.post(`${API_URL}/cameras`, payload, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    await loadData();
  };

  const testConnectionDraft = async (payload: {
    ip: string;
    rtspPort: number;
    onvifPort?: number;
    username?: string;
    password?: string;
    rtspPath?: string;
    onvifPath?: string;
    onvifProfileToken?: string;
    channel?: number;
    subtype?: number;
  }) => {
    if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.');
    const { data } = await axios.post(`${API_URL}/cameras/test-connection-draft`, payload, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data as {
      rtspReachable: boolean;
      rtspReachableAny?: boolean;
      reachableRtspPorts?: number[];
      onvifReachable: boolean;
      ptzDigestOk?: boolean;
      reachableOnvifPorts?: number[];
      rtspAuthOk?: boolean;
      selectedRtspPortAuthOk?: boolean;
      detectedRtspPort?: number | null;
      detectedRtspPath?: string | null;
      suggestedRtspPath?: string;
      detectedOnvifPort?: number | null;
      detectedOnvifPath?: string | null;
      detectedOnvifProfileToken?: string | null;
      rtspProbeError?: string | null;
      status: string;
    };
  };

  return (
    <div className="flex h-full min-h-0 p-5">
      <div className="flex-1 flex flex-col min-w-0 min-h-0 gap-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-4 border border-card-border bg-card rounded-xl shrink-0 flex-wrap gap-y-3 shadow-sm">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
            <input
              type="search"
              placeholder="Buscar câmeras..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 pr-3 w-48 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] placeholder:text-[hsl(var(--muted-foreground)_/_0.5)]"
            />
          </div>
          <Select value={zoneFilter} onValueChange={setZonaFilter}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{zones.map(z => <SelectItem key={z} value={z} className="text-xs">{z === 'All' ? 'Todas as Zonas' : z}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s === 'All' ? 'Todos os Status' : s}</SelectItem>)}</SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">{filtered.length} câmeras</span>
            <div className="flex items-center gap-0.5 p-0.5 rounded bg-[hsl(var(--muted))] border border-border">
              <button onClick={() => setViewMode('table')} className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${viewMode === 'table' ? 'bg-card text-foreground' : 'text-[hsl(var(--muted-foreground))] hover:text-foreground'}`}><List className="w-3.5 h-3.5" /></button>
              <button onClick={() => setViewMode('card')} className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${viewMode === 'card' ? 'bg-card text-foreground' : 'text-[hsl(var(--muted-foreground))] hover:text-foreground'}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
            </div>
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold hover:opacity-90 transition-opacity"
              data-testid="button-add-camera"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar Câmera
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-card border border-card-border rounded-xl shadow-sm">
          {viewMode === 'table' ? (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  {['Código', 'Nome', 'Zona', 'Modelo', 'Endereço IP', 'Status', 'FPS', 'Gravação', 'Ações'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium text-[hsl(var(--muted-foreground))] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(cam => (
                  <tr
                    key={cam.id}
                    className="hover:bg-[hsl(var(--accent))] transition-colors cursor-pointer"
                    onClick={() => setLocation(`/cameras/${cam.id}`)}
                  >
                    <td className="px-3 py-2.5 font-mono text-[10px]">{cam.code}</td>
                    <td className="px-3 py-2.5 font-medium max-w-52 truncate">{cam.name}</td>
                    <td className="px-3 py-2.5 text-[hsl(var(--muted-foreground))]">{cam.zone}</td>
                    <td className="px-3 py-2.5 text-[hsl(var(--muted-foreground))] hidden lg:table-cell">{cam.model}</td>
                    <td className="px-3 py-2.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))] hidden xl:table-cell">{cam.ipAddress}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-mono capitalize ${STATUS_BADGE[cam.status] ?? STATUS_BADGE.offline}`}>
                        {cam.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[10px]">{cam.fps}</td>
                    <td className="px-3 py-2.5 capitalize text-[hsl(var(--muted-foreground))]">{cam.recordingMode}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setLocation(`/cameras/${cam.id}?tab=settings`)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--chart-2))] hover:bg-[hsl(var(--accent))] transition-colors" title="Editar câmera"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={() => void deleteCamera(cam)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--accent))] transition-colors" title="Excluir câmera"><Trash2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setLocation(`/playback?cameraId=${encodeURIComponent(cam.id)}`)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-colors" title="Reprodução"><PlaySquare className="w-3.5 h-3.5" /></button>
                        {cam.ptzCapable && <button onClick={() => setLocation(`/ptz?cameraId=${encodeURIComponent(cam.id)}`)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-colors" title="PTZ"><Crosshair className="w-3.5 h-3.5" /></button>}
                        <button className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--chart-2))] hover:bg-[hsl(var(--accent))] transition-colors" title="Reiniciar"><RefreshCw className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 p-5">
              {filtered.map(cam => (
                <div
                  key={cam.id}
                  className="bg-card border border-card-border rounded-xl overflow-hidden hover:border-[hsl(var(--primary)_/_0.4)] cursor-pointer transition-colors shadow-sm"
                  onClick={() => setLocation(`/cameras/${cam.id}`)}
                >
                  <div className="h-24 relative flex items-center justify-center" style={{ background: 'hsl(210,15%,8%)' }}>
                    <CameraIcon className="w-8 h-8 text-[hsl(var(--muted-foreground)_/_0.2)]" />
                    <div className="absolute top-2 left-2 font-mono text-[9px] text-white/50 bg-black/40 px-1.5 py-0.5 rounded">{cam.code}</div>
                    <div className="absolute top-2 right-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-mono capitalize ${STATUS_BADGE[cam.status] ?? STATUS_BADGE.offline}`}>
                        {cam.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-xs font-medium truncate mb-1">{cam.name}</div>
                    <div className="text-[10px] text-[hsl(var(--muted-foreground))] space-y-0.5">
                      <div>{cam.zone} · {cam.building}</div>
                      <div className="font-mono">{cam.model}</div>
                      <div className="font-mono">{cam.ipAddress}</div>
                    </div>
                    <div className="mt-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setLocation(`/cameras/${cam.id}?tab=settings`)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--chart-2))] hover:bg-[hsl(var(--accent))] transition-colors" title="Editar câmera"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => void deleteCamera(cam)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--accent))] transition-colors" title="Excluir câmera"><Trash2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setLocation(`/playback?cameraId=${encodeURIComponent(cam.id)}`)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-colors" title="Reprodução"><PlaySquare className="w-3.5 h-3.5" /></button>
                      {cam.ptzCapable && <button onClick={() => setLocation(`/ptz?cameraId=${encodeURIComponent(cam.id)}`)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-colors" title="PTZ"><Crosshair className="w-3.5 h-3.5" /></button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Camera detail panel */}
      <AnimatePresence>
        {selectedCam && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="ml-4 border border-card-border rounded-xl bg-card flex flex-col overflow-hidden shrink-0 shadow-sm"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="text-sm font-semibold truncate">{selectedCam.code}</h3>
              <button onClick={() => setSelectedCam(null)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[hsl(var(--accent))] transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="h-28 rounded border border-border flex items-center justify-center" style={{ background: 'hsl(210,15%,8%)' }}>
                <CameraIcon className="w-10 h-10 text-[hsl(var(--muted-foreground)_/_0.2)]" />
              </div>
              <div>
                <div className="text-sm font-semibold mb-0.5">{selectedCam.name}</div>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-mono capitalize ${STATUS_BADGE[selectedCam.status] ?? STATUS_BADGE.offline}`}>
                  {selectedCam.status.replace('_', ' ')}
                </span>
              </div>
              <div className="space-y-2 text-xs">
                {[
                  ['Código', selectedCam.code],
                  ['Zona', selectedCam.zone],
                  ['Unidade', selectedCam.building],
                  ['Andar', selectedCam.floor],
                  ['Endereço IP', selectedCam.ipAddress],
                  ['Modelo', selectedCam.model],
                  ['Resolução', selectedCam.resolution],
                  ['FPS', selectedCam.fps.toString()],
                  ['Gravação', selectedCam.recordingMode],
                  ['Retenção', `${selectedCam.retentionDays} dias`],
                  ['PTZ', selectedCam.ptzCapable ? 'Sim' : 'Não'],
                  ['Áudio', selectedCam.hasAudio ? 'Sim' : 'Não'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">{k}</span>
                    <span className="font-mono">{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => setLocation(`/cameras/${selectedCam.id}?tab=settings`)} className="w-full h-9 rounded border border-border text-xs flex items-center justify-center gap-2 hover:bg-[hsl(var(--accent))] transition-colors">
                  <Edit className="w-4 h-4" /> Editar Câmera
                </button>
                <button onClick={() => void deleteCamera(selectedCam)} className="w-full h-9 rounded border border-border text-xs flex items-center justify-center gap-2 hover:bg-[hsl(var(--accent))] transition-colors text-[hsl(var(--destructive))]">
                  <Trash2 className="w-4 h-4" /> Excluir Câmera
                </button>
                <button onClick={() => setLocation('/playback')} className="w-full h-9 rounded border border-border text-xs flex items-center justify-center gap-2 hover:bg-[hsl(var(--accent))] transition-colors">
                  <PlaySquare className="w-4 h-4" /> Abrir Reprodução
                </button>
                {selectedCam.ptzCapable && (
                  <button onClick={() => setLocation(`/ptz?cameraId=${encodeURIComponent(selectedCam.id)}`)} className="w-full h-9 rounded border border-border text-xs flex items-center justify-center gap-2 hover:bg-[hsl(var(--accent))] transition-colors">
                    <Crosshair className="w-4 h-4" /> Controle PTZ
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showWizard && <WizardModal onClose={() => setShowWizard(false)} zones={zones} onCreated={createCamera} onTestConnection={testConnectionDraft} />}
    </div>
  );
}
