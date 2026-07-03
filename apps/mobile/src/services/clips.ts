/**
 * Clipes do celular — salva o vídeo/foto DIRETO na galeria (sem folha de
 * compartilhamento) e mantém um índice local ("Minhas gravações") do que foi
 * gravado pelo app, por câmera, para listar/reproduzir dentro do app.
 *
 * O ARQUIVO fica na galeria (álbum "DRAC") e também no diretório do app (para
 * reprodução in-app confiável). O ÍNDICE (metadados) fica em AsyncStorage — não
 * é uma pasta que o usuário gerencia, é só o app lembrando dos clipes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';

const ALBUM = 'DRAC';
const KEY = '@drac:clips:v1';

/** Salva um arquivo (vídeo/foto) na galeria do celular, no álbum "DRAC". */
export async function saveToGallery(uri: string): Promise<boolean> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) return false;
  const asset = await MediaLibrary.createAssetAsync(uri);
  try {
    const album = await MediaLibrary.getAlbumAsync(ALBUM);
    if (album) await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    else await MediaLibrary.createAlbumAsync(ALBUM, asset, false);
  } catch {
    // O álbum é só organização; o asset já está salvo na galeria de qualquer forma.
  }
  return true;
}

export type SavedClip = {
  id: string;
  cameraId: string;
  cameraName: string;
  uri: string; // arquivo local (documentDirectory) p/ reprodução in-app
  createdAt: string; // ISO
};

export async function listClips(): Promise<SavedClip[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as SavedClip[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function addClip(clip: SavedClip): Promise<SavedClip[]> {
  const all = await listClips();
  all.unshift(clip);
  const trimmed = all.slice(0, 300);
  await AsyncStorage.setItem(KEY, JSON.stringify(trimmed));
  return trimmed;
}

export async function removeClip(id: string): Promise<SavedClip[]> {
  const all = (await listClips()).filter((c) => c.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
  return all;
}
