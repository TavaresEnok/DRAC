import { useState } from 'react';
import {
  SkipBack, SkipForward, Play, Pause, FastForward,
  StepBack, StepForward, Archive, Download, Camera as CameraIcon,
  ZoomIn, ZoomOut
} from 'lucide-react';
import { format, subHours, addMinutes } from 'date-fns';
import { MOCK_CAMERAS, MOCK_EVENTS } from '../data/mockData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SPEEDS = ['0.25x', '0.5x', '1x', '2x', '4x', '8x'];

function buildTimelineSegments() {
  // 24h of segments for a single camera
  const segments = [];
  for (let h = 0; h < 24; h++) {
    // Recorded most of the time
    segments.push({ start: h * 60, end: h * 60 + 55, type: 'recorded' });
    // Occasional gap
    if (h % 7 === 3) segments.push({ start: h * 60 + 55, end: h * 60 + 60, type: 'gap' });
    // Motion events
    if (h % 4 === 1) segments.push({ start: h * 60 + 20, end: h * 60 + 23, type: 'motion' });
    // Alarm events
    if (h % 9 === 2) segments.push({ start: h * 60 + 35, end: h * 60 + 38, type: 'alarm' });
  }
  return segments;
}

const SEGMENTS = buildTimelineSegments();
const TOTAL_MINS = 24 * 60;

export default function PlaybackPage() {
  const [selectedCamId, setSelectedCamId] = useState(MOCK_CAMERAS[0].id);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('1x');
  const [playhead, setPlayhead] = useState(480); // minutes from start of day
  const [zoom, setZoom] = useState(1); // 1=24h, 2=12h, 4=6h
  const [exportRange, setExportRange] = useState<[number, number] | null>(null);
  const [showExport, setShowExport] = useState(false);

  const selectedCam = MOCK_CAMERAS.find(c => c.id === selectedCamId)!;
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const currentTime = addMinutes(dayStart, playhead);
  const zoomedWindow = TOTAL_MINS / zoom;
  const viewStart = Math.max(0, playhead - zoomedWindow / 2);
  const viewEnd = Math.min(TOTAL_MINS, viewStart + zoomedWindow);

  const getSegmentColor = (type: string) => {
    if (type === 'recorded') return 'hsl(150,60%,32%)';
    if (type === 'motion') return 'hsl(35,95%,50%)';
    if (type === 'alarm') return 'hsl(0,72%,50%)';
    return 'hsl(var(--muted))';
  };

  const relevantEvents = MOCK_EVENTS.filter(e => e.cameraId === selectedCamId).slice(0, 8);

  return (
    <div className="flex flex-col h-full p-4 gap-4 min-h-0">
      {/* Top controls */}
      <div className="flex items-center gap-3 shrink-0">
        <Select value={selectedCamId} onValueChange={setSelectedCamId}>
          <SelectTrigger className="w-72 h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {MOCK_CAMERAS.filter(c => c.isOnline).map(c => (
              <SelectItem key={c.id} value={c.id} className="text-xs font-mono">{c.code} — {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          type="date"
          defaultValue={format(new Date(), 'yyyy-MM-dd')}
          className="h-9 px-3 rounded border border-border bg-card text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
        />

        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">Zoom:</span>
          {[1, 2, 4].map(z => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-2.5 py-1.5 rounded text-xs font-mono transition-colors
                ${zoom === z ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border border-border text-[hsl(var(--muted-foreground))] hover:text-foreground'}`}
            >
              {z === 1 ? '24h' : z === 2 ? '12h' : '6h'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Video area */}
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          {/* Video placeholder */}
          <div
            className="relative rounded-lg overflow-hidden border border-border flex-1 min-h-0"
            style={{ minHeight: 200, background: 'hsl(210,18%,7%)' }}
          >
            {/* Scanline */}
            <div className="camera-scanline absolute inset-0 overflow-hidden pointer-events-none" />

            {/* Top-left info */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="font-mono text-[10px] text-white/60 bg-black/50 px-2 py-1 rounded">
                {selectedCam.code}
              </span>
              <span className="font-mono text-[10px] text-white/60 bg-black/50 px-2 py-1 rounded">
                PLAYBACK
              </span>
              {playing && <span className="w-2 h-2 rounded-full bg-[hsl(var(--destructive))] rec-pulse" />}
            </div>

            {/* Center camera info */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <CameraIcon className="w-10 h-10 text-white/10 mx-auto mb-2" />
                <div className="font-mono text-xs text-white/20">{selectedCam.name}</div>
              </div>
            </div>

            {/* Bottom timestamp */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
              <span className="font-mono text-sm text-white/70 bg-black/50 px-2 py-1 rounded">
                {format(currentTime, 'yyyy-MM-dd HH:mm:ss')}
              </span>
              <span className="font-mono text-xs text-white/50 bg-black/50 px-2 py-1 rounded">
                {speed} · {selectedCam.resolution.split(' ')[0]}
              </span>
            </div>
          </div>

          {/* Timeline area */}
          <div className="bg-card border border-border rounded-lg p-3 shrink-0">
            {/* Minimap */}
            <div className="h-4 rounded bg-[hsl(var(--muted))] mb-2 relative overflow-hidden cursor-pointer"
              onClick={e => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                setPlayhead(Math.round(pct * TOTAL_MINS));
              }}
            >
              {SEGMENTS.map((seg, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full opacity-60"
                  style={{
                    left: `${(seg.start / TOTAL_MINS) * 100}%`,
                    width: `${((seg.end - seg.start) / TOTAL_MINS) * 100}%`,
                    background: getSegmentColor(seg.type),
                  }}
                />
              ))}
              {/* Viewport indicator */}
              <div
                className="absolute top-0 h-full border-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary)_/_0.1)] pointer-events-none"
                style={{
                  left: `${(viewStart / TOTAL_MINS) * 100}%`,
                  width: `${((viewEnd - viewStart) / TOTAL_MINS) * 100}%`,
                }}
              />
              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none"
                style={{ left: `${(playhead / TOTAL_MINS) * 100}%` }}
              />
            </div>

            {/* Main timeline */}
            <div
              className="h-12 bg-[hsl(var(--muted))] rounded relative overflow-hidden cursor-pointer mb-2"
              onClick={e => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                const minute = viewStart + pct * (viewEnd - viewStart);
                setPlayhead(Math.round(minute));
              }}
            >
              {SEGMENTS.filter(s => s.start >= viewStart && s.end <= viewEnd).map((seg, i) => {
                const segStart = Math.max(seg.start, viewStart);
                const segEnd = Math.min(seg.end, viewEnd);
                const window = viewEnd - viewStart;
                return (
                  <div
                    key={i}
                    className="absolute top-0 h-full"
                    style={{
                      left: `${((segStart - viewStart) / window) * 100}%`,
                      width: `${((segEnd - segStart) / window) * 100}%`,
                      background: getSegmentColor(seg.type),
                    }}
                  />
                );
              })}
              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none"
                style={{ left: `${((playhead - viewStart) / (viewEnd - viewStart)) * 100}%` }}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-transparent border-t-white" />
              </div>
              {/* Time labels */}
              {[0, .25, .5, .75, 1].map(pct => {
                const min = viewStart + pct * (viewEnd - viewStart);
                return (
                  <div
                    key={pct}
                    className="absolute bottom-1 font-mono text-[9px] text-white/40 pointer-events-none"
                    style={{ left: `${pct * 100}%`, transform: 'translateX(-50%)' }}
                  >
                    {format(addMinutes(dayStart, min), 'HH:mm')}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 mb-3">
              {[['Recorded', 'recorded'], ['Motion', 'motion'], ['Alarm', 'alarm'], ['No Data', 'gap']].map(([label, type]) => (
                <div key={type} className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: getSegmentColor(type) }} />
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</span>
                </div>
              ))}
              <button
                onClick={() => setShowExport(true)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
                Export Clip
              </button>
            </div>

            {/* Playback controls */}
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPlayhead(p => Math.max(0, p - 15))} className="w-8 h-8 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors">
                <SkipBack className="w-4 h-4" />
              </button>
              <button onClick={() => setPlayhead(p => Math.max(0, p - 1))} className="w-8 h-8 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors">
                <StepBack className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPlaying(p => !p)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                data-testid="button-play-pause"
              >
                {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <button onClick={() => setPlayhead(p => Math.min(TOTAL_MINS, p + 1))} className="w-8 h-8 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors">
                <StepForward className="w-4 h-4" />
              </button>
              <button onClick={() => setPlayhead(p => Math.min(TOTAL_MINS, p + 15))} className="w-8 h-8 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors">
                <SkipForward className="w-4 h-4" />
              </button>

              <div className="ml-4 flex items-center gap-0.5">
                <FastForward className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                {SPEEDS.map(s => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`px-2 py-1 rounded font-mono text-[10px] transition-colors
                      ${speed === s ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))]'}`}
                  >{s}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Event list panel */}
        <div className="w-56 bg-card border border-border rounded-lg flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2.5 border-b border-border shrink-0">
            <span className="text-xs font-semibold">Events on this camera</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {relevantEvents.length > 0 ? relevantEvents.map(evt => (
              <div
                key={evt.id}
                className="flex flex-col gap-0.5 px-3 py-2.5 hover:bg-[hsl(var(--accent))] transition-colors cursor-pointer"
                onClick={() => {
                  const evtTime = new Date(evt.timestamp);
                  const mins = evtTime.getHours() * 60 + evtTime.getMinutes();
                  setPlayhead(mins);
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${evt.severity === 'critical' ? 'status-alarm' : evt.severity === 'warning' ? 'status-motion' : 'status-online'}`} />
                  <span className="text-[10px] font-medium capitalize truncate">{evt.type.replace(/_/g, ' ')}</span>
                </div>
                <span className="font-mono text-[9px] text-[hsl(var(--muted-foreground))]">
                  {format(new Date(evt.timestamp), 'HH:mm:ss')}
                </span>
              </div>
            )) : (
              <div className="flex items-center justify-center h-20">
                <span className="text-xs text-[hsl(var(--muted-foreground))]">No events</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export modal placeholder */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setShowExport(false)}>
          <div className="bg-card border border-border rounded-lg p-6 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-4">Export Video Clip</h3>
            <div className="space-y-3 text-xs text-[hsl(var(--muted-foreground))]">
              <div className="flex justify-between">
                <span>Camera:</span>
                <span className="font-mono text-foreground">{selectedCam.code}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span className="font-mono text-foreground">{format(new Date(), 'yyyy-MM-dd')}</span>
              </div>
              <div className="flex justify-between">
                <span>Time range:</span>
                <span className="font-mono text-foreground">{format(addMinutes(dayStart, Math.max(0, playhead - 5)), 'HH:mm')} — {format(addMinutes(dayStart, Math.min(TOTAL_MINS, playhead + 5)), 'HH:mm')}</span>
              </div>
              <div className="flex justify-between">
                <span>Format:</span>
                <span className="font-mono text-foreground">MP4 / H.265</span>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowExport(false)}
                className="flex-1 h-9 rounded border border-border text-xs hover:bg-[hsl(var(--accent))] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowExport(false)}
                className="flex-1 h-9 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold flex items-center justify-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
