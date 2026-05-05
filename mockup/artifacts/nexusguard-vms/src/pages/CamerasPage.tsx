import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutGrid, List, Search, Filter, Plus, Edit, PlaySquare,
  Crosshair, RefreshCw, ChevronRight, X, Wifi, HardDrive,
  Camera as CameraIcon, Check
} from 'lucide-react';
import { format } from 'date-fns';
import { MOCK_CAMERAS, Camera } from '../data/mockData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocation } from 'wouter';

const ZONES = ['All', ...Array.from(new Set(MOCK_CAMERAS.map(c => c.zone)))];
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

function WizardModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const steps = ['Connection', 'Identity', 'Recording', 'Confirm'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-[520px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Add Camera Wizard</h3>
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
                <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">IP Address</label>
                <input className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="192.168.20.149" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Port</label>
                  <input className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="554" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Protocol</label>
                  <Select defaultValue="rtsp">
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rtsp" className="text-xs">RTSP</SelectItem>
                      <SelectItem value="onvif" className="text-xs">ONVIF</SelectItem>
                      <SelectItem value="http" className="text-xs">HTTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded border border-border text-xs hover:bg-[hsl(var(--accent))] transition-colors">
                <Wifi className="w-3.5 h-3.5" />
                Test Connection
              </button>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Camera Name</label>
                <input className="w-full h-9 px-3 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="e.g. Lobby North — Entrance B" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Zone</label>
                  <Select><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select zone..." /></SelectTrigger>
                    <SelectContent>{ZONES.filter(z => z !== 'All').map(z => <SelectItem key={z} value={z} className="text-xs">{z}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Building</label>
                  <Select><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {['Main HQ', 'Data Center', 'Warehouse', 'Security Post'].map(b => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Recording Mode</label>
                <Select defaultValue="continuous">
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="continuous" className="text-xs">Continuous</SelectItem>
                    <SelectItem value="motion" className="text-xs">Motion Triggered</SelectItem>
                    <SelectItem value="schedule" className="text-xs">Schedule</SelectItem>
                    <SelectItem value="manual" className="text-xs">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Retention (days)</label>
                <input className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" defaultValue="90" />
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-background p-4 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">IP Address</span><span className="font-mono">192.168.20.149</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Protocol</span><span className="font-mono">RTSP</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Name</span><span>Lobby North — Entrance B</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Recording</span><span className="capitalize">continuous</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Retention</span><span className="font-mono">90 days</span></div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <button
            onClick={() => step === 0 ? onClose() : setStep(s => s - 1)}
            className="px-4 py-2 rounded border border-border text-xs hover:bg-[hsl(var(--accent))] transition-colors"
          >{step === 0 ? 'Cancel' : 'Back'}</button>
          <button
            onClick={() => step < steps.length - 1 ? setStep(s => s + 1) : onClose()}
            className="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold hover:opacity-90 transition-opacity"
          >{step < steps.length - 1 ? 'Next' : 'Add Camera'}</button>
        </div>
      </div>
    </div>
  );
}

export default function CamerasPage() {
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showWizard, setShowWizard] = useState(false);
  const [selectedCam, setSelectedCam] = useState<Camera | null>(null);

  const filtered = MOCK_CAMERAS.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
    if (zoneFilter !== 'All' && c.zone !== zoneFilter) return false;
    if (statusFilter !== 'All' && c.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="flex h-full min-h-0 p-5">
      <div className="flex-1 flex flex-col min-w-0 min-h-0 gap-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-4 border border-card-border bg-card rounded-xl shrink-0 flex-wrap gap-y-3 shadow-sm">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
            <input
              type="search"
              placeholder="Search cameras..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 pr-3 w-48 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] placeholder:text-[hsl(var(--muted-foreground)_/_0.5)]"
            />
          </div>
          <Select value={zoneFilter} onValueChange={setZoneFilter}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{ZONES.map(z => <SelectItem key={z} value={z} className="text-xs">{z === 'All' ? 'All Zones' : z}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s === 'All' ? 'All Status' : s}</SelectItem>)}</SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">{filtered.length} cameras</span>
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
              Add Camera
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-card border border-card-border rounded-xl shadow-sm">
          {viewMode === 'table' ? (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  {['Code', 'Name', 'Zone', 'Model', 'IP Address', 'Status', 'FPS', 'Recording', 'Actions'].map(h => (
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
                        <button onClick={() => setLocation('/playback')} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-colors" title="Playback"><PlaySquare className="w-3.5 h-3.5" /></button>
                        {cam.ptzCapable && <button onClick={() => setLocation('/ptz')} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-colors" title="PTZ"><Crosshair className="w-3.5 h-3.5" /></button>}
                        <button className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--chart-2))] hover:bg-[hsl(var(--accent))] transition-colors" title="Reboot"><RefreshCw className="w-3.5 h-3.5" /></button>
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
                  ['Code', selectedCam.code],
                  ['Zone', selectedCam.zone],
                  ['Building', selectedCam.building],
                  ['Floor', selectedCam.floor],
                  ['IP Address', selectedCam.ipAddress],
                  ['Model', selectedCam.model],
                  ['Resolution', selectedCam.resolution],
                  ['FPS', selectedCam.fps.toString()],
                  ['Recording', selectedCam.recordingMode],
                  ['Retention', `${selectedCam.retentionDays} days`],
                  ['PTZ', selectedCam.ptzCapable ? 'Yes' : 'No'],
                  ['Audio', selectedCam.hasAudio ? 'Yes' : 'No'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">{k}</span>
                    <span className="font-mono">{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => setLocation('/playback')} className="w-full h-9 rounded border border-border text-xs flex items-center justify-center gap-2 hover:bg-[hsl(var(--accent))] transition-colors">
                  <PlaySquare className="w-4 h-4" /> Go to Playback
                </button>
                {selectedCam.ptzCapable && (
                  <button onClick={() => setLocation('/ptz')} className="w-full h-9 rounded border border-border text-xs flex items-center justify-center gap-2 hover:bg-[hsl(var(--accent))] transition-colors">
                    <Crosshair className="w-4 h-4" /> PTZ Control
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showWizard && <WizardModal onClose={() => setShowWizard(false)} />}
    </div>
  );
}
