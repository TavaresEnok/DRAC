// Config dinâmica do Expo para builds WHITE-LABEL.
//
// Um único código gera APKs diferentes por cliente. Escolha o cliente com a
// variável de ambiente CLIENT (default = 'default'):
//   CLIENT=flashnet npx expo prebuild ...
//
// Cada cliente vive em clients/<slug>/:
//   config.json  → { appName, slug, packageId, apiUrl, primaryColor }
//   icon.png / splash.png / adaptive-icon.png / logo.png  (opcionais; caem no padrão)
//
// O branding chega ao app em runtime via expo-constants (Constants.expoConfig.extra).
const fs = require('fs');
const path = require('path');

const base = require('./app.base.json').expo;
const client = process.env.CLIENT || 'default';
const clientDir = path.join(__dirname, 'clients', client);

function readClientConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(clientDir, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

// Caminho de asset do cliente se existir; senão mantém o padrão do app.base.json.
function asset(name, fallback) {
  const p = path.join(clientDir, name);
  return fs.existsSync(p) ? `./clients/${client}/${name}` : fallback;
}

// Fontes do redesign: registradas como FAMÍLIAS NATIVAS com pesos (res/font/*.xml no
// Android). É isso que faz `fontFamily:'Sora'` + `fontWeight:'800'` escolher o arquivo
// certo — sem isso o RN trata cada peso como família separada e o Android finge negrito.
// Só entram no build da variante do redesign (não pesam o app atual).
const REDESIGN_FONTS = [
  {
    fontFamily: 'Sora',
    fontDefinitions: [
      { path: './assets/fonts/Sora-SemiBold.ttf', weight: 600 },
      { path: './assets/fonts/Sora-Bold.ttf', weight: 700 },
      { path: './assets/fonts/Sora-ExtraBold.ttf', weight: 800 },
    ],
  },
  {
    fontFamily: 'InstrumentSans',
    fontDefinitions: [
      { path: './assets/fonts/InstrumentSans-Regular.ttf', weight: 400 },
      { path: './assets/fonts/InstrumentSans-Medium.ttf', weight: 500 },
      { path: './assets/fonts/InstrumentSans-SemiBold.ttf', weight: 600 },
      { path: './assets/fonts/InstrumentSans-Bold.ttf', weight: 700 },
    ],
  },
  {
    fontFamily: 'JetBrainsMono',
    fontDefinitions: [
      { path: './assets/fonts/JetBrainsMono-Medium.ttf', weight: 500 },
      { path: './assets/fonts/JetBrainsMono-SemiBold.ttf', weight: 600 },
    ],
  },
];

const c = readClientConfig();
const allowCleartextTraffic = c.allowCleartext === true || process.env.ALLOW_CLEARTEXT_TRAFFIC === 'true';
const plugins = (base.plugins || []).map((plugin) => {
  if (!Array.isArray(plugin) || plugin[0] !== 'expo-build-properties') return plugin;
  return [
    plugin[0],
    {
      ...(plugin[1] || {}),
      android: {
        ...((plugin[1] && plugin[1].android) || {}),
        usesCleartextTraffic: allowCleartextTraffic,
      },
    },
  ];
});

// A variante do redesign carrega as fontes; o app atual não (não pesa o APK dele).
const isRedesignBuild = c.redesign === true || process.env.REDESIGN === '1';
// No REDESIGN não entra Firebase: é um build só para avaliar o design com as câmeras
// reais. Sem expo-notifications não há FirebaseMessaging/FirebaseInitProvider, some a
// dependência do google-services.json e o app deixa de depender de push para abrir.
// registerForPush() é todo try/catch e devolve null — o app tolera a ausência.
const pluginsWithFonts = isRedesignBuild
  ? [
      ...plugins.filter((p) => (Array.isArray(p) ? p[0] : p) !== 'expo-notifications'),
      ['expo-font', { android: { fonts: REDESIGN_FONTS } }],
    ]
  : plugins;

module.exports = () => ({
  expo: {
    ...base,
    name: c.appName || base.name,
    // SLUG fixo (= projeto Expo compartilhado): todos os clientes usam o mesmo
    // projeto Expo (mesmo projectId p/ push/EAS). Só o PACOTE muda por cliente.
    // (Antes trocava o slug por cliente, o que conflita com o projectId do EAS.)
    slug: base.slug,
    icon: asset('icon.png', base.icon),
    plugins: pluginsWithFonts,
    splash: {
      ...base.splash,
      image: asset('splash.png', base.splash && base.splash.image),
      backgroundColor: c.splashBackgroundColor || (base.splash && base.splash.backgroundColor),
    },
    android: {
      ...base.android,
      package: c.packageId || base.android.package,
      // FCM/push por cliente: cada cliente tem seu próprio pacote → seu próprio
      // google-services.json (registrado no MESMO projeto Firebase). Se o cliente
      // tiver o arquivo, usa o dele; senão cai no padrão (app principal).
      googleServicesFile: isRedesignBuild ? undefined : asset('google-services.json', base.android.googleServicesFile),
      adaptiveIcon: {
        ...(base.android && base.android.adaptiveIcon),
        foregroundImage: asset('adaptive-icon.png', base.android && base.android.adaptiveIcon && base.android.adaptiveIcon.foregroundImage),
      },
    },
    extra: {
      ...(base.extra || {}),
      client,
      // Liga o REDESIGN (tipografia + paleta novas). Só o cliente "redesign" o ativa —
      // serve para gerar um 2º APK, com o MESMO código e as MESMAS câmeras, mudando só
      // o design, e assim comparar os dois lado a lado de forma justa.
      redesign: c.redesign === true || process.env.REDESIGN === '1',
      appName: c.appName || base.name,
      // Servidor embutido por cliente (cai para a env pública, depois vazio).
      apiUrl: c.apiUrl || process.env.EXPO_PUBLIC_API_URL || '',
      primaryColor: c.primaryColor || null,
    },
  },
});
