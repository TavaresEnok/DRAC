export type LiveReadinessCheck = {
  code: string;
  state: 'ok' | 'warning' | 'blocked';
  message: string;
  action?: string;
};

function originOf(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isSecureOrigin(value?: string | null) {
  return originOf(value)?.startsWith('https://') ?? false;
}

export function assessLiveReadiness(input: {
  requestOrigin?: string | null;
  publicAppUrl?: string | null;
  mediamtxEnabled: boolean;
  pathReady: boolean;
  whepUrl?: string | null;
  hlsUrl?: string | null;
  webrtcAllowOrigin?: string | null;
}) {
  const checks: LiveReadinessCheck[] = [];
  const appOrigin = originOf(input.publicAppUrl) ?? originOf(input.requestOrigin);
  const whepOrigin = originOf(input.whepUrl);
  const secureApp = isSecureOrigin(appOrigin);

  checks.push(input.mediamtxEnabled
    ? { code: 'mediamtx_enabled', state: 'ok', message: 'MediaMTX habilitado.' }
    : {
        code: 'mediamtx_disabled',
        state: 'blocked',
        message: 'O serviço de entrega ao navegador está desabilitado.',
        action: 'Habilite o MediaMTX para disponibilizar WebRTC e HLS.',
      });

  checks.push(input.pathReady
    ? { code: 'path_ready', state: 'ok', message: 'Caminho da câmera publicado.' }
    : {
        code: 'path_not_ready',
        state: 'blocked',
        message: 'A câmera ainda não publicou vídeo no MediaMTX.',
        action: 'Valide o RTSP da câmera e os logs do MediaMTX.',
      });

  if (!input.whepUrl) {
    checks.push({
      code: 'whep_missing',
      state: input.hlsUrl ? 'warning' : 'blocked',
      message: 'URL WebRTC/WHEP indisponível.',
      action: input.hlsUrl ? 'A live tentará HLS até o WebRTC ficar disponível.' : 'Configure a URL pública WebRTC do MediaMTX.',
    });
  } else if (secureApp && !isSecureOrigin(input.whepUrl)) {
    checks.push({
      code: 'whep_mixed_content',
      state: 'blocked',
      message: 'O painel usa HTTPS, mas a URL WebRTC/WHEP usa HTTP.',
      action: 'Publique o endpoint WebRTC/WHEP também por HTTPS.',
    });
  } else {
    checks.push({ code: 'whep_ready', state: 'ok', message: 'Endpoint WebRTC/WHEP disponível.' });
  }

  const allowOrigin = String(input.webrtcAllowOrigin ?? '').trim();
  if (allowOrigin && allowOrigin !== '*' && appOrigin) {
    const allowed = allowOrigin.split(',').map((item) => item.trim()).filter(Boolean);
    if (!allowed.includes(appOrigin)) {
      checks.push({
        code: 'origin_not_allowed',
        state: 'blocked',
        message: 'O domínio do painel não está autorizado no WebRTC.',
        action: `Inclua ${appOrigin} em MEDIAMTX_WEBRTC_ALLOW_ORIGIN.`,
      });
    }
  } else if (secureApp && allowOrigin === '*') {
    checks.push({
      code: 'origin_wildcard',
      state: 'warning',
      message: 'WebRTC aceita qualquer origem.',
      action: `Restrinja MEDIAMTX_WEBRTC_ALLOW_ORIGIN para ${appOrigin}.`,
    });
  }

  if (input.whepUrl && appOrigin && whepOrigin && appOrigin !== whepOrigin) {
    checks.push({
      code: 'cross_origin_delivery',
      state: 'warning',
      message: 'WebRTC é entregue por uma origem diferente do painel.',
      action: 'Garanta CORS, certificado e firewall corretos para o endpoint WebRTC.',
    });
  }

  const blocked = checks.filter((check) => check.state === 'blocked');
  const warnings = checks.filter((check) => check.state === 'warning');
  const state = blocked.length ? 'blocked' : warnings.length ? 'degraded' : 'ready';
  const primary = blocked[0] ?? warnings[0] ?? null;

  return {
    state,
    readyForWebrtc: !checks.some((check) => check.state === 'blocked' && ['mediamtx_disabled', 'path_not_ready', 'whep_missing', 'whep_mixed_content', 'origin_not_allowed'].includes(check.code)),
    fallbackAvailable: Boolean(input.hlsUrl),
    userMessage: state === 'ready'
      ? 'WebRTC pronto.'
      : primary?.message ?? 'Live requer atenção.',
    recommendedAction: primary?.action ?? null,
    checks,
  };
}
