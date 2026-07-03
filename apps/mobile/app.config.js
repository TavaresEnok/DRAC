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

const base = require('./app.json').expo;
const client = process.env.CLIENT || 'default';
const clientDir = path.join(__dirname, 'clients', client);

function readClientConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(clientDir, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

// Caminho de asset do cliente se existir; senão mantém o padrão do app.json.
function asset(name, fallback) {
  const p = path.join(clientDir, name);
  return fs.existsSync(p) ? `./clients/${client}/${name}` : fallback;
}

const c = readClientConfig();

module.exports = () => ({
  expo: {
    ...base,
    name: c.appName || base.name,
    // SLUG fixo (= projeto Expo compartilhado): todos os clientes usam o mesmo
    // projeto Expo (mesmo projectId p/ push/EAS). Só o PACOTE muda por cliente.
    // (Antes trocava o slug por cliente, o que conflita com o projectId do EAS.)
    slug: base.slug,
    icon: asset('icon.png', base.icon),
    splash: { ...base.splash, image: asset('splash.png', base.splash && base.splash.image) },
    android: {
      ...base.android,
      package: c.packageId || base.android.package,
      // FCM/push por cliente: cada cliente tem seu próprio pacote → seu próprio
      // google-services.json (registrado no MESMO projeto Firebase). Se o cliente
      // tiver o arquivo, usa o dele; senão cai no padrão (app principal).
      googleServicesFile: asset('google-services.json', base.android.googleServicesFile),
      adaptiveIcon: {
        ...(base.android && base.android.adaptiveIcon),
        foregroundImage: asset('adaptive-icon.png', base.android && base.android.adaptiveIcon && base.android.adaptiveIcon.foregroundImage),
      },
    },
    extra: {
      ...(base.extra || {}),
      client,
      appName: c.appName || base.name,
      // Servidor embutido por cliente (cai para a env pública, depois vazio).
      apiUrl: c.apiUrl || process.env.EXPO_PUBLIC_API_URL || '',
      primaryColor: c.primaryColor || null,
    },
  },
});
