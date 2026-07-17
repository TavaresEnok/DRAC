/**
 * Personalização do APP (só do app — o sistema/servidor nunca é personalizado).
 *
 * O padrão é a paleta do mockup (redesignDark/Light em theme.ts). O cliente pode escolher
 * um accent diferente aqui; "Usar padrão" limpa e volta pro mockup. Guardado localmente
 * (AsyncStorage) neste aparelho.
 *
 * Só tem efeito no build do redesign; fora dele, nada muda.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@drac:app-accent:v1';

/** Cores oferecidas na personalização. A primeira é o PADRÃO (mockup). */
export const ACCENT_PRESETS: Array<{ id: string; label: string; color: string }> = [
  { id: 'default', label: 'Padrão', color: '#3E8BFF' }, // mockup
  { id: 'teal', label: 'Petróleo', color: '#0EA5A5' },
  { id: 'violet', label: 'Violeta', color: '#7C6CF0' },
  { id: 'emerald', label: 'Verde', color: '#12B981' },
  { id: 'amber', label: 'Âmbar', color: '#F59E0B' },
  { id: 'rose', label: 'Rosa', color: '#F0517F' },
  { id: 'flash', label: 'Grupo Flash', color: '#0077A8' },
];

export const DEFAULT_ACCENT = ACCENT_PRESETS[0].color;

export async function loadAppAccent(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export async function saveAppAccent(color: string | null): Promise<void> {
  try {
    if (color) await AsyncStorage.setItem(KEY, color);
    else await AsyncStorage.removeItem(KEY); // "Usar padrão"
  } catch {
    /* ignore */
  }
}
