# DRAC Mobile — Mockup de UI (React Native + Expo + TypeScript)

Implementação de **interface** do novo design do app DRAC, pronta para a IA de
produção conectar à API, ao streaming WebRTC e ao playback HLS já existentes no monorepo.

> É um **mockup funcional de UI**: navegação real, tema claro/escuro real, dados mock.
> Nenhuma chamada de rede está ligada ainda — os pontos de integração estão marcados nos arquivos.

## Stack alvo
- React Native + **Expo (SDK 54)**, TypeScript
- Estilo: **StyleSheet nativo** (sem Tailwind/CSS)
- Tema próprio claro/escuro (`src/theme/`)
- Streaming (a ligar): `react-native-webrtc` (ao vivo) + `expo-video` (HLS/playback)

## Dependências usadas pela UI
```bash
npx expo install expo-linear-gradient react-native-svg \
  react-native-safe-area-context @react-native-async-storage/async-storage
# já no app de produção: react-native-webrtc, expo-video
```

## Estrutura
```
drac-rn/
  App.tsx                      # raiz: login gate + tabs por estado + rota Live fullscreen
  src/
    theme/
      theme.ts                 # tokens dark/light (derivados de apps/mobile/src/styles/colors.ts)
      ThemeProvider.tsx        # useTheme(): { theme, mode, setMode, toggle } + persistência
    components/
      Icon.tsx                 # ícones em react-native-svg
      BottomTabs.tsx           # navegação inferior + badge de alarmes
      CameraTile.tsx           # preview de câmera + estrela de favoritar
      FavoritesSheet.tsx       # modal "Gerenciar favoritas"
      GroupEditorSheet.tsx     # modal criar/editar grupo (nome + seleção)
    screens/
      LoginScreen.tsx
      CentralScreen.tsx        # "página central" / home
      MosaicScreen.tsx         # mosaico (grade)
      LiveScreen.tsx           # ao vivo de 1 câmera + PTZ (tela cheia)
      PlaybackScreen.tsx       # gravações + timeline
      AlarmsScreen.tsx
      SettingsScreen.tsx       # ajustes (inclui o toggle de tema)
    state/
      LibraryProvider.tsx      # useLibrary(): favoritas + grupos (+ persistência)
    data/mock.ts               # dados de exemplo (mockCameras, mockGroups, mockFavorites)
    types.ts
```

## Favoritas e Grupos
São **dois eixos independentes**, ambos em `state/LibraryProvider.tsx` (`useLibrary()`),
persistidos em AsyncStorage:

- **Favoritas** (`favorites: string[]`) — atalho pessoal. A estrela aparece no canto de
  cada câmera (Mosaico/Live) e numa folha "Gerenciar favoritas". A Central mostra as
  favoritas em destaque; vazio → estado de "escolher favoritas".
  `toggleFavorite(id)` / `isFavorite(id)`.
- **Grupos** (`groups: CameraGroup[]`) — organização espacial (ex.: prédio de 4 andares,
  3 câmeras por andar). Os chips do Mosaico vêm dos grupos; "+ Novo/Grupo" abre a folha de
  criar/editar (nome + seleção de câmeras por checkbox) com excluir.
  `createGroup(name, ids)` / `updateGroup(id, patch)` / `deleteGroup(id)`.
  Uma câmera pode estar em vários grupos.

Produção: trocar os seeds (`mockGroups`, `mockFavorites`) por `GET /camera-groups` e
`GET /favorites`, e espelhar as mutações no backend.

## Como rodar isolado (opcional)
Copie a pasta `drac-rn/` para um app Expo em branco (`npx create-expo-app`), instale as
dependências acima e substitua o `App.tsx` raiz. Ou copie `src/` e telas direto para
`apps/mobile/` do monorepo. Envolva o app com `<ThemeProvider>` e `<LibraryProvider>`.

## Pontos de integração para a produção
- **Login** (`LoginScreen.onSubmit`) → `POST /auth/login`, salvar sessão (ver `services/sessionStore.ts`).
- **Câmeras** (`data/mock.ts` → `mockCameras`) → `GET /cameras`.
- **Favoritas / Grupos** (`state/LibraryProvider.tsx`) → `GET/PUT /favorites` e `GET/POST/PATCH/DELETE /camera-groups`.
- **Live** (`LiveScreen`) → trocar o `LinearGradient` por `<RTCView>` (WHEP/WebRTC);
  `onPtz(dir)` → `POST /ptz/:cameraId/move`.
- **Playback** (`PlaybackScreen`) → `expo-video` para HLS/MP4 + `POST /recordings/:id/play-token`;
  lista via `GET /recordings`.
- **Alarmes** (`AlarmsScreen`) → `GET` de alarmes + ações reconhecer/resolver.
- **Tema**: já funcional via `ThemeProvider`; opcional sincronizar com `useColorScheme()` do SO.

## Decisões de design
- Tema **escuro como padrão** (premium, foco no vídeo), claro disponível e persistido.
- Accent azul `#3b82f6` (mantido do sistema atual).
- A tela **Live é sempre escura**, independente do tema, porque o conteúdo é vídeo.
- Previews de câmera são placeholders de gradiente — trocar por poster/stream real.
- Tipografia: fonte do sistema (SF/Roboto). Para ficar idêntico ao mockup HTML,
  carregar **Manrope** via `expo-font` e definir como família padrão.
