# DRAC Mobile

Aplicativo Android inicial do DRAC, construido com Expo/React Native para reaproveitar a mesma API e a mesma separacao interna por grupos do sistema web.

## Rodar para teste

```bash
corepack pnpm --filter mobile start:lan
```

Abra o link/QR no Expo Go no Android. A URL padrao da API pode ser alterada na tela de login para o IP ou dominio da instalacao.

## Funcionalidades iniciais

- Login com o JWT da API atual.
- Dashboard com cameras ja filtradas pelo backend conforme grupos/permissoes.
- Ao vivo por HLS quando MediaMTX publicar `hlsUrl`.
- Grid mobile com 1, 2 ou 4 cameras.
- PTZ por camera quando a API retornar permissao `canControl`.
- Gravacao manual quando a API retornar permissao `canRecord`.
- Playback com gravacoes do dia, abrir video e baixar/compartilhar MP4.
- Alarme/relay apenas quando `/ptz/:cameraId/relays` retornar saida acionavel.

## Android nativo

Para gerar APK/AAB local depois de validar no Expo Go:

```bash
corepack pnpm --filter mobile exec expo prebuild --platform android
cd apps/mobile/android
./gradlew assembleDebug
```

O APK debug fica em `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
