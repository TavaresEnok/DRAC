/**
 * Câmera em destaque da tela Início (redesign).
 *
 * Sem escolha salva, o destaque é a primeira câmera ONLINE (ordem da API).
 * O usuário fixa uma câmera segurando o dedo (long-press) num card de
 * "Suas câmeras" — a escolha vale só neste aparelho (AsyncStorage).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@drac:featured-camera:v1';

export async function loadFeaturedCameraId(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

export async function saveFeaturedCameraId(id: string | null): Promise<void> {
  try {
    if (id) await AsyncStorage.setItem(KEY, id);
    else await AsyncStorage.removeItem(KEY);
  } catch {
    /* best-effort */
  }
}
