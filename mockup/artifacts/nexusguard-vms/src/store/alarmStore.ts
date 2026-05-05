import { create } from 'zustand';
import { Alarm, MOCK_ALARMS } from '../data/mockData';

interface AlarmState {
  alarms: Alarm[];
  acknowledgeAlarm: (id: string, by: string) => void;
  resolveAlarm: (id: string) => void;
  addAlarm: (alarm: Alarm) => void;
  addNote: (id: string, note: string) => void;
}

export const useAlarmStore = create<AlarmState>((set) => ({
  alarms: MOCK_ALARMS,
  acknowledgeAlarm: (id, by) =>
    set((state) => ({
      alarms: state.alarms.map((a) =>
        a.id === id
          ? { ...a, status: 'acknowledged', acknowledgedAt: new Date().toISOString(), acknowledgedBy: by }
          : a
      ),
    })),
  resolveAlarm: (id) =>
    set((state) => ({
      alarms: state.alarms.map((a) =>
        a.id === id ? { ...a, status: 'resolved' } : a
      ),
    })),
  addAlarm: (alarm) =>
    set((state) => ({ alarms: [alarm, ...state.alarms] })),
  addNote: (id: string, note: string) =>
    set((state) => ({
      alarms: state.alarms.map((a) =>
        a.id === id
          ? { ...a, notes: a.notes ? `${a.notes}\n${note}` : note }
          : a
      ),
    })),
}));
