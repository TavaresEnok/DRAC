import { useState, type Dispatch, type SetStateAction } from 'react';
import { Activity, Brain, CarFront, Clock3, ToggleLeft, ToggleRight, Users, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type DetectionKey = 'motion' | 'human' | 'car';

const DETECTIONS: Array<{
  key: DetectionKey;
  label: string;
  icon: typeof Activity;
  description: string;
}> = [
  { key: 'motion', label: 'Deteccao de movimento', icon: Activity, description: 'Gera eventos por deslocamento em areas monitoradas.' },
  { key: 'human', label: 'Deteccao de humano', icon: Users, description: 'Marca presenca humana em zonas sensiveis.' },
  { key: 'car', label: 'Deteccao de carro', icon: CarFront, description: 'Reconhece veiculos e placas em acessos.' },
];

export default function AIPage() {
  const [enabled, setEnabled] = useState(true);
  const [motion, setMotion] = useState(true);
  const [human, setHuman] = useState(true);
  const [car, setCar] = useState(false);

  const states: Record<DetectionKey, boolean> = { motion, human, car };
  const setters: Record<DetectionKey, Dispatch<SetStateAction<boolean>>> = { motion: setMotion, human: setHuman, car: setCar };

  return (
    <div className="h-full min-h-0 p-6">
      <div className="mx-auto grid h-full min-h-0 max-w-4xl gap-4">
        <Card className="border-card-border bg-card">
          <CardHeader className="space-y-2 border-b border-border">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
              <Brain className="h-3.5 w-3.5" />
              IA / Analiticos
            </div>
            <CardTitle className="text-[15px]">Controles de deteccao</CardTitle>
            <CardDescription>Ative ou desative os analiticos por tipo de evento.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 p-5">
            <div className="rounded-2xl border border-border bg-[hsl(var(--muted))] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold">Analiticos de video</div>
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))]">Motor central de eventos automaticos.</div>
                </div>
                <button
                  onClick={() => setEnabled(v => !v)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                    enabled
                      ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                      : 'border border-border bg-background text-foreground hover:bg-[hsl(var(--accent))]'
                  }`}
                >
                  {enabled ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                  {enabled ? 'Ativo' : 'Desligado'}
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  { label: 'Cameras online', value: '32', icon: Clock3 },
                  { label: 'Latencia media', value: '180 ms', icon: Clock3 },
                  { label: 'Eventos/hora', value: '18', icon: Zap },
                ].map(item => (
                  <div key={item.label} className="rounded-2xl border border-border bg-background p-3">
                    <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
                      <item.icon className="h-3 w-3" />
                      {item.label}
                    </div>
                    <div className="mt-1 text-sm font-semibold">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              {DETECTIONS.map(det => {
                const active = states[det.key];
                const Icon = det.icon;

                return (
                  <button
                    key={det.key}
                    onClick={() => setters[det.key](v => !v)}
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-4 text-left transition-colors ${
                      active ? 'border-[hsl(var(--primary)_/_0.28)] bg-[hsl(var(--primary)_/_0.06)]' : 'border-border bg-background hover:bg-[hsl(var(--accent))]'
                    }`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 text-[hsl(var(--primary))]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">{det.label}</div>
                        <Badge variant="outline">{active ? 'Ativo' : 'Desligado'}</Badge>
                      </div>
                      <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{det.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
