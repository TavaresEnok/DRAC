export interface Camera {
  id: string;
  code: string;
  name: string;
  location: string;
  zone: string;
  building: string;
  floor: string;
  ipAddress: string;
  model: string;
  status: 'online' | 'offline' | 'recording' | 'motion' | 'alarm' | 'no_signal' | 'maintenance';
  fps: number;
  resolution: string;
  storage: string;
  lastEvent?: string;
  ptzCapable: boolean;
  hasAudio: boolean;
  isOnline: boolean;
  signalStrength: number;
  recordingMode: 'continuous' | 'motion' | 'schedule' | 'manual';
  retentionDays: number;
  lastMotion?: string;
  thumbnailColor: string;
}

export interface User {
  id: string;
  name: string;
  role: 'operator' | 'supervisor' | 'admin';
  email: string;
  badge: string;
  lastLogin: string;
  shift: 'morning' | 'afternoon' | 'night';
  active: boolean;
}

export interface VMSEvent {
  id: string;
  type: 'motion_detected' | 'door_open' | 'tailgating' | 'intrusion' | 'camera_offline' | 'alarm_triggered' | 'ptz_tour_started' | 'recording_gap' | 'face_detected';
  cameraId: string;
  cameraName: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  acknowledged: boolean;
  description: string;
  thumbnail?: string;
}

export interface Alarm {
  id: string;
  name: string;
  type: 'intrusion' | 'fire' | 'access_violation' | 'camera_tampering' | 'perimeter_breach' | 'panic_button' | 'loitering';
  status: 'active' | 'acknowledged' | 'resolved';
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  triggeredAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  cameraId: string;
  zone: string;
  description: string;
  notes?: string;
}

export interface SavedLayout {
  id: string;
  name: string;
  gridSize: '1x1' | '2x2' | '3x3' | '4x4';
  cameraIds: string[];
  createdBy: string;
  lastUsed: string;
}

// Generate 48 realistic cameras
export const MOCK_CAMERAS: Camera[] = Array.from({ length: 48 }).map((_, i) => {
  const isOffline = i === 12 || i === 24 || i === 31;
  const isNoSignal = i === 40 || i === 41;
  const isMaintenance = i === 47;
  
  let status: Camera['status'] = 'online';
  if (isOffline) status = 'offline';
  else if (isNoSignal) status = 'no_signal';
  else if (isMaintenance) status = 'maintenance';
  else if (i % 7 === 0) status = 'motion';
  else if (i % 13 === 0) status = 'alarm';
  else status = 'recording';

  const zones = ["Perimeter", "Access Control", "Parking Structure", "Server Room", "Executive Floor", "Loading Dock", "Lobby", "Stairwell", "Elevator", "Emergency Exit"];
  const buildings = ["Main HQ", "Data Center", "Warehouse", "Security Post"];
  const models = ["Axis P3267-V", "Hikvision DS-2CD2T47G2", "Dahua IPC-HDW5842H", "Bosch FLEXIDOME", "Hanwha XNV-8080R"];
  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

  return {
    id: `cam-${i + 1}`,
    code: `NVR-${['A', 'B', 'C', 'D'][i % 4]}-${(i + 1).toString().padStart(2, '0')}`,
    name: `${zones[i % zones.length]} — Cam ${i + 1}`,
    location: `Sector ${Math.floor(i / 5) + 1}`,
    zone: zones[i % zones.length],
    building: buildings[i % buildings.length],
    floor: `Floor ${Math.floor((i % 10) / 3)}`,
    ipAddress: `192.168.20.${100 + i}`,
    model: models[i % models.length],
    status,
    fps: isOffline || isNoSignal ? 0 : 30,
    resolution: "4K (3840x2160)",
    storage: "H.265+ (12 MB/s)",
    ptzCapable: i % 4 === 0,
    hasAudio: i % 3 === 0,
    isOnline: !isOffline && !isNoSignal,
    signalStrength: isOffline ? 0 : isNoSignal ? 10 : 95 + Math.random() * 5,
    recordingMode: (['continuous', 'motion', 'schedule'][i % 3]) as Camera['recordingMode'],
    retentionDays: 90,
    thumbnailColor: colors[i % colors.length],
  };
});

export const MOCK_USERS: User[] = [
  { id: 'u1', name: "Marcus Reinholt", role: "admin", email: "m.reinholt@nexusguard.local", badge: "SEC-0001", lastLogin: new Date().toISOString(), shift: "morning", active: true },
  { id: 'u2', name: "Priya Nair", role: "admin", email: "p.nair@nexusguard.local", badge: "SEC-0002", lastLogin: new Date().toISOString(), shift: "morning", active: true },
  { id: 'u3', name: "James Okafor", role: "supervisor", email: "j.okafor@nexusguard.local", badge: "SEC-0105", lastLogin: new Date().toISOString(), shift: "afternoon", active: true },
  { id: 'u4', name: "Elena Rostova", role: "supervisor", email: "e.rostova@nexusguard.local", badge: "SEC-0108", lastLogin: new Date().toISOString(), shift: "night", active: true },
  { id: 'u5', name: "David Chen", role: "operator", email: "d.chen@nexusguard.local", badge: "SEC-4821", lastLogin: new Date().toISOString(), shift: "morning", active: true },
  { id: 'u6', name: "Sarah Jenkins", role: "operator", email: "s.jenkins@nexusguard.local", badge: "SEC-4822", lastLogin: new Date().toISOString(), shift: "afternoon", active: true },
  { id: 'u7', name: "Michael Chang", role: "operator", email: "m.chang@nexusguard.local", badge: "SEC-4823", lastLogin: new Date().toISOString(), shift: "night", active: true },
  { id: 'u8', name: "Anita Patel", role: "operator", email: "a.patel@nexusguard.local", badge: "SEC-4824", lastLogin: new Date().toISOString(), shift: "morning", active: true },
  { id: 'u9', name: "Robert Wilson", role: "operator", email: "r.wilson@nexusguard.local", badge: "SEC-4825", lastLogin: new Date().toISOString(), shift: "afternoon", active: true },
  { id: 'u10', name: "Lisa Thompson", role: "operator", email: "l.thompson@nexusguard.local", badge: "SEC-4826", lastLogin: new Date().toISOString(), shift: "night", active: true },
  { id: 'u11', name: "William Davis", role: "operator", email: "w.davis@nexusguard.local", badge: "SEC-4827", lastLogin: new Date().toISOString(), shift: "morning", active: true },
  { id: 'u12', name: "Jennifer Garcia", role: "operator", email: "j.garcia@nexusguard.local", badge: "SEC-4828", lastLogin: new Date().toISOString(), shift: "afternoon", active: true },
  { id: 'u13', name: "Thomas Rodriguez", role: "operator", email: "t.rodriguez@nexusguard.local", badge: "SEC-4829", lastLogin: new Date().toISOString(), shift: "night", active: true },
  { id: 'u14', name: "Jessica Martinez", role: "supervisor", email: "j.martinez@nexusguard.local", badge: "SEC-0112", lastLogin: new Date().toISOString(), shift: "morning", active: true },
  { id: 'u15', name: "Daniel Hernandez", role: "supervisor", email: "d.hernandez@nexusguard.local", badge: "SEC-0115", lastLogin: new Date().toISOString(), shift: "afternoon", active: true },
];

export const MOCK_EVENTS: VMSEvent[] = Array.from({ length: 120 }).map((_, i) => {
  const types = ["motion_detected", "door_open", "tailgating", "intrusion", "camera_offline", "alarm_triggered", "ptz_tour_started", "recording_gap", "face_detected"] as const;
  const severities = ["info", "warning", "critical"] as const;
  const cam = MOCK_CAMERAS[i % MOCK_CAMERAS.length];
  
  const type = types[i % types.length];
  const severity = type === 'intrusion' || type === 'alarm_triggered' ? 'critical' : type === 'camera_offline' || type === 'tailgating' || type === 'recording_gap' ? 'warning' : 'info';
  
  return {
    id: `evt-${1000 + i}`,
    type,
    cameraId: cam.id,
    cameraName: cam.name,
    timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    severity: severity as VMSEvent['severity'],
    acknowledged: i > 20,
    description: `${type.replace('_', ' ').toUpperCase()} detected at ${cam.zone}`,
  };
}).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) as VMSEvent[];

export const MOCK_ALARMS: Alarm[] = Array.from({ length: 40 }).map((_, i) => {
  const types = ["intrusion", "fire", "access_violation", "camera_tampering", "perimeter_breach", "panic_button", "loitering"] as const;
  const type = types[i % types.length];
  const cam = MOCK_CAMERAS[i % MOCK_CAMERAS.length];
  
  return {
    id: `alm-${5000 + i}`,
    name: `${type.replace('_', ' ').toUpperCase()} — ${cam.zone}`,
    type,
    status: (i < 5 ? 'active' : i < 15 ? 'acknowledged' : 'resolved') as Alarm['status'],
    priority: (i === 0 || type === 'fire' || type === 'panic_button' ? 'P1' : type === 'intrusion' ? 'P2' : type === 'perimeter_breach' ? 'P3' : 'P4') as Alarm['priority'],
    triggeredAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
    acknowledgedAt: i >= 5 ? new Date(Date.now() - Math.random() * 12 * 60 * 60 * 1000).toISOString() : undefined,
    acknowledgedBy: i >= 5 ? MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)].name : undefined,
    cameraId: cam.id,
    zone: cam.zone,
    description: `System detected ${type.replace('_', ' ')} in ${cam.zone} via ${cam.name}`,
    notes: i >= 15 ? "Resolved by patrol team. False alarm caused by wildlife." : undefined
  };
}).sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());

export const MOCK_LAYOUTS: SavedLayout[] = [
  { id: 'l1', name: 'Perimeter Overview', gridSize: '3x3', cameraIds: ['cam-1', 'cam-2', 'cam-3', 'cam-4', 'cam-5', 'cam-6', 'cam-7', 'cam-8', 'cam-9'], createdBy: 'Marcus Reinholt', lastUsed: new Date().toISOString() },
  { id: 'l2', name: 'Lobby Focus', gridSize: '2x2', cameraIds: ['cam-7', 'cam-8', 'cam-9', 'cam-10'], createdBy: 'Priya Nair', lastUsed: new Date().toISOString() },
];
