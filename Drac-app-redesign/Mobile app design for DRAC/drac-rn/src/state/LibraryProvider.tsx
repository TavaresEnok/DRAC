/**
 * LibraryProvider — fonte de verdade de FAVORITAS e GRUPOS de câmeras.
 *
 * Mantém os dois eixos independentes:
 *   - favorites: string[]  (ids de câmera fixadas na Central)
 *   - groups: CameraGroup[] (organização espacial; uma câmera pode estar em vários grupos)
 *
 * Persiste em AsyncStorage por usuário. A IA de produção troca os seeds por
 * GET /favorites e GET /camera-groups e espelha as mutações no backend
 * (toggleFavorite → PUT, createGroup/updateGroup/deleteGroup → POST/PATCH/DELETE).
 *
 * Uso:
 *   <LibraryProvider><App /></LibraryProvider>
 *   const { favorites, isFavorite, toggleFavorite,
 *           groups, createGroup, updateGroup, deleteGroup } = useLibrary();
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { mockFavorites, mockGroups } from '../data/mock';
import type { CameraGroup } from '../types';

const FAV_KEY = '@drac:favorites';
const GROUP_KEY = '@drac:groups';

interface LibraryContextValue {
  favorites: string[];
  isFavorite: (cameraId: string) => boolean;
  toggleFavorite: (cameraId: string) => void;

  groups: CameraGroup[];
  createGroup: (name: string, cameraIds: string[]) => CameraGroup;
  updateGroup: (id: string, patch: Partial<Omit<CameraGroup, 'id'>>) => void;
  deleteGroup: (id: string) => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>(mockFavorites);
  const [groups, setGroups] = useState<CameraGroup[]>(mockGroups);

  // hidratar do storage
  useEffect(() => {
    AsyncStorage.multiGet([FAV_KEY, GROUP_KEY])
      .then(([[, favRaw], [, grpRaw]]) => {
        if (favRaw) setFavorites(JSON.parse(favRaw));
        if (grpRaw) setGroups(JSON.parse(grpRaw));
      })
      .catch(() => undefined);
  }, []);

  const persistFav = useCallback((next: string[]) => {
    setFavorites(next);
    void AsyncStorage.setItem(FAV_KEY, JSON.stringify(next));
  }, []);
  const persistGroups = useCallback((next: CameraGroup[]) => {
    setGroups(next);
    void AsyncStorage.setItem(GROUP_KEY, JSON.stringify(next));
  }, []);

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  const toggleFavorite = useCallback((id: string) => {
    persistFav(favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id]);
  }, [favorites, persistFav]);

  const createGroup = useCallback((name: string, cameraIds: string[]): CameraGroup => {
    const group: CameraGroup = { id: 'g' + Date.now(), name: name.trim() || 'Novo grupo', cameraIds };
    persistGroups([...groups, group]);
    return group;
  }, [groups, persistGroups]);

  const updateGroup = useCallback((id: string, patch: Partial<Omit<CameraGroup, 'id'>>) => {
    persistGroups(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }, [groups, persistGroups]);

  const deleteGroup = useCallback((id: string) => {
    persistGroups(groups.filter((g) => g.id !== id));
  }, [groups, persistGroups]);

  const value = useMemo<LibraryContextValue>(
    () => ({ favorites, isFavorite, toggleFavorite, groups, createGroup, updateGroup, deleteGroup }),
    [favorites, isFavorite, toggleFavorite, groups, createGroup, updateGroup, deleteGroup],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary deve ser usado dentro de <LibraryProvider>.');
  return ctx;
}
