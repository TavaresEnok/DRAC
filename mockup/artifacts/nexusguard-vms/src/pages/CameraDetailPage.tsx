import { useParams, useLocation } from 'wouter';
import { useState } from 'react';
import { Camera, ChevronLeft, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ZoomIn, ZoomOut, Focus, RotateCcw, BookmarkIcon } from 'lucide-react';
import { MOCK_CAMERAS } from '../data/mockData';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

const statusColor = (s: string) => {
  if (s === 'online' || s === 'recording') return 'bg-green-500/15 text-green-400 border-green-500/30';
  if (s === 'offline' || s === 'no_signal') return 'bg-red-500/15 text-red-400 border-red-500/30';
  if (s === 'motion' || s === 'alarm') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
};

const ptzPresets = ['Home', 'Entrance', 'Parking', 'Gate', 'Perimeter N', 'Perimeter S'];

export default function CameraDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const cam = MOCK_CAMERAS.find(c => c.id === params.id) ?? MOCK_CAMERAS[0];
  const [zoom, setZoom] = useState([40]);
  const [ptzActive, setPtzActive] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
        <button onClick={() => setLocation('/cameras')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" />
          Camera List
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-semibold">{cam.name}</span>
        <Badge variant="outline" className={cn('text-[10px] ml-1', statusColor(cam.status))}>{cam.status.replace('_', ' ')}</Badge>
        {cam.ptzCapable && <span className="text-[9px] font-bold uppercase text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-1">PTZ</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'IP Address',  value: cam.ipAddress,      mono: true },
            { label: 'Model',       value: cam.model,          mono: true },
            { label: 'Resolution',  value: cam.resolution,     mono: true },
            { label: 'Storage',     value: cam.storage,        mono: true },
            { label: 'Zone',        value: cam.zone,           mono: false },
            { label: 'Building',    value: cam.building,       mono: false },
            { label: 'Recording',   value: cam.recordingMode,  mono: false },
            { label: 'Retention',   value: `${cam.retentionDays}d`, mono: true },
          ].map(item => (
            <div key={item.label} className="bg-card rounded-md border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{item.label}</p>
              <p className={cn('text-sm font-medium', item.mono && 'font-mono')}>{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <div className="aspect-video bg-black rounded-lg border border-border flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 scan-line-overlay" />
              <Camera className="h-12 w-12 text-slate-700" />
              <div className="absolute top-2 left-2 flex items-center gap-2 z-10">
                <div className="h-2 w-2 rounded-full bg-red-500 rec-pulse" />
                <span className="text-xs font-mono text-white/80 bg-black/60 px-1.5 rounded">{cam.code}</span>
              </div>
              <div className="absolute bottom-2 left-2 right-2 flex justify-between z-10">
                <span className="text-[10px] font-mono text-white/70 bg-black/60 px-1.5 rounded">{cam.ipAddress}</span>
                <span className="text-[10px] font-mono text-white/70 bg-black/60 px-1.5 rounded">{new Date().toISOString().replace('T', ' ').substring(0, 19)}</span>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-4 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Stream Info</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">URL</span></div>
              <p className="font-mono text-[10px] text-primary break-all bg-background rounded px-2 py-1">rtsp://{cam.ipAddress}/stream</p>
              <div className="flex justify-between"><span className="text-muted-foreground">Location</span></div>
              <p className="text-xs">{cam.location}</p>
              <div className="flex justify-between"><span className="text-muted-foreground">FPS</span><span className="font-mono">{cam.fps}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Audio</span><span className="font-mono">{cam.hasAudio ? 'Yes' : 'No'}</span></div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="live" className="w-full">
          <TabsList className="bg-card border border-border h-8">
            {['live', 'playback', 'events', 'ptz', 'settings'].map(t => (
              <TabsTrigger key={t} value={t} className="text-xs capitalize h-6 px-3">
                {t === 'ptz' ? 'PTZ Controls' : t === 'live' ? 'Live View' : t.charAt(0).toUpperCase() + t.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="live" className="mt-4">
            <div className="aspect-video bg-black rounded-lg border border-border flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 scan-line-overlay" />
              <Camera className="h-12 w-12 text-slate-700" />
            </div>
          </TabsContent>

          <TabsContent value="playback" className="mt-4">
            <div className="p-6 text-center text-muted-foreground text-sm">
              <p>Use the Playback page to review recordings for this camera.</p>
            </div>
          </TabsContent>

          <TabsContent value="events" className="mt-4">
            <div className="space-y-2">
              {[
                { type: 'Motion',    time: '10:52:14', dur: '00:00:23' },
                { type: 'Line Cross',time: '08:15:07', dur: '00:00:04' },
                { type: 'Motion',    time: '07:34:55', dur: '00:01:12' },
              ].map((e, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2 rounded border border-border bg-card/40 text-xs">
                  <span className="font-mono text-muted-foreground">{e.time}</span>
                  <Badge variant="outline" className="text-[10px] bg-slate-500/15 text-slate-400 border-slate-500/30">{e.type}</Badge>
                  <span className="text-muted-foreground font-mono">{e.dur}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="ptz" className="mt-4">
            {cam.ptzCapable ? (
              <div className="flex gap-8">
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Direction Control</p>
                  <div className="grid grid-cols-3 gap-1.5 w-36">
                    {[
                      { dir: 'NW', icon: null }, { dir: 'N', icon: ArrowUp }, { dir: 'NE', icon: null },
                      { dir: 'W',  icon: ArrowLeft }, { dir: '', icon: null }, { dir: 'E', icon: ArrowRight },
                      { dir: 'SW', icon: null }, { dir: 'S', icon: ArrowDown }, { dir: 'SE', icon: null },
                    ].map(({ dir, icon: Icon }, i) => (
                      <button
                        key={i}
                        onMouseDown={() => setPtzActive(dir)}
                        onMouseUp={() => setPtzActive(null)}
                        disabled={!dir}
                        className={cn(
                          'h-10 rounded border text-[10px] font-mono font-bold flex items-center justify-center transition-colors',
                          dir ? 'border-border bg-card hover:bg-accent cursor-pointer' : 'border-transparent bg-transparent',
                          ptzActive === dir && dir && 'bg-primary text-primary-foreground border-primary'
                        )}
                      >
                        {Icon ? <Icon className="h-4 w-4" /> : dir}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><ZoomIn className="h-3 w-3" />Zoom</p>
                      <Slider value={zoom} onValueChange={setZoom} max={100} className="w-36" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Focus className="h-3 w-3" />Focus</p>
                      <div className="flex gap-1">
                        <button className="h-7 px-3 rounded border border-border bg-card text-xs hover:bg-accent">Near</button>
                        <button className="h-7 px-3 rounded border border-border bg-card text-xs hover:bg-accent">Auto</button>
                        <button className="h-7 px-3 rounded border border-border bg-card text-xs hover:bg-accent">Far</button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="flex items-center gap-1 h-7 px-3 rounded border border-border bg-card text-xs hover:bg-accent">
                        <RotateCcw className="h-3 w-3" />Patrol
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Preset Positions</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ptzPresets.map(p => (
                      <button key={p} className="flex items-center gap-1.5 h-8 px-3 rounded border border-border bg-card text-xs hover:bg-accent transition-colors text-left">
                        <BookmarkIcon className="h-3 w-3 text-primary" />{p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground text-sm">
                <p>This camera does not support PTZ controls.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Recording</p>
                <div>
                  <label className="text-xs font-medium block mb-1">Mode</label>
                  <select className="w-full h-8 rounded border border-border bg-background text-xs px-2 focus:outline-none focus:ring-1 focus:ring-primary">
                    <option selected={cam.recordingMode === 'continuous'}>Continuous</option>
                    <option selected={cam.recordingMode === 'motion'}>Motion</option>
                    <option selected={cam.recordingMode === 'schedule'}>Scheduled</option>
                    <option>Manual</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Stream Quality</label>
                  <select className="w-full h-8 rounded border border-border bg-background text-xs px-2 focus:outline-none focus:ring-1 focus:ring-primary">
                    <option>Ultra HD (4K)</option>
                    <option selected>Full HD (1080p)</option>
                    <option>HD (720p)</option>
                    <option>SD (480p)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Motion Sensitivity</label>
                  <Slider defaultValue={[65]} max={100} className="w-full" />
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Alarm Zones</p>
                <div className="aspect-video bg-slate-900 rounded border border-border flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Zone editor — draw on camera image</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button className="h-8 px-4 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90">Save Settings</button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}