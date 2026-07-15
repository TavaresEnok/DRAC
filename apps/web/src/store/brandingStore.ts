import axios from 'axios';
import { create } from 'zustand';
import { getApiBaseUrl } from '../lib/api-base';

type PublicBranding = {
  facilityName?: string;
};

type BrandingState = {
  facilityName: string;
  loaded: boolean;
  load: () => Promise<void>;
};

export const useBrandingStore = create<BrandingState>((set) => ({
  facilityName: 'DRAC VMS',
  loaded: false,
  load: async () => {
    try {
      const { data } = await axios.get<PublicBranding>(`${getApiBaseUrl()}/settings/branding`, { timeout: 8_000 });
      set({
        facilityName: data.facilityName?.trim() || 'DRAC VMS',
        loaded: true,
      });
    } catch {
      set((state) => ({ ...state, loaded: true }));
    }
  },
}));
