import { FileText, BarChart3, HardDrive, Camera, Activity } from 'lucide-react';
import { useVmsDataStore } from '../store/vmsDataStore';

function formatBytesToGb(value: number) {
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function RelatóriosPage() {
  const cameras = useVmsDataStore((state) => state.cameras);
  const events = useVmsDataStore((state) => state.events);
  const alarms = useVmsDataStore((state) => state.alarms);
  const recordings = useVmsDataStore((state) => state.recordings);
  const system = useVmsDataStore((state) => state.system);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-primary" />
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">Relatórios</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Gere e exporte relatórios operacionais</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Resumo Operacional</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Camera className="h-3.5 w-3.5" />
              Câmeras
            </div>
            <div className="mt-3 text-2xl font-semibold">{cameras.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">{cameras.filter((camera) => camera.isOnline).length} online</div>
          </div>

          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              Eventos
            </div>
            <div className="mt-3 text-2xl font-semibold">{events.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">{alarms.filter((alarm) => alarm.status === 'active').length} alertas ativos</div>
          </div>

          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              Gravações
            </div>
            <div className="mt-3 text-2xl font-semibold">{recordings.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {system ? formatBytesToGb(system.recordings.totalBytes) : 'Sem métrica'} gravados
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5" />
              Disco
            </div>
            <div className="mt-3 text-2xl font-semibold">{system?.disk.usagePercent ?? 0}%</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {system ? formatBytesToGb(system.disk.freeBytes) : 'Sem métrica'} livres
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-5">
          <div className="text-sm font-semibold">Resumo disponível</div>
          <div className="mt-2 text-sm text-muted-foreground">
            Esta tela usa apenas dados reais do servidor atual. Exportações e relatórios analíticos avançados entram como próxima camada, sem simular informação.
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-border bg-background px-4 py-3">
              <div className="text-muted-foreground text-[10px]">Servidor</div>
              <div className="mt-1 font-mono">{system?.server.hostname ?? 'N/D'}</div>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-3">
              <div className="text-muted-foreground text-[10px]">Pasta das gravações</div>
              <div className="mt-1 font-mono">{system?.recordingsRoot ?? 'N/D'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
