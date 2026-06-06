export type CameraStreamMetadata = {
  codec?: string | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  bitrateKbps?: number | null;
};

export type CameraCompatibilityHint = {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  action?: string;
};

export type CameraCompatibilityAssessment = {
  state: 'ideal' | 'compatible' | 'attention';
  detectedFamily: 'dahua' | 'hikvision' | 'reolink' | 'axis' | 'generic';
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  automaticProfile: {
    live: string;
    recording: string;
    analytics: string;
  };
  hints: CameraCompatibilityHint[];
};

function normalizeCodec(codec?: string | null) {
  const value = String(codec ?? '').trim().toLowerCase();
  if (['hevc', 'h265', 'h.265'].includes(value)) return 'h265';
  if (['avc', 'h264', 'h.264'].includes(value)) return 'h264';
  if (['mjpeg', 'mjpg', 'jpeg'].includes(value)) return 'mjpeg';
  return value || 'desconhecido';
}

function formatStream(metadata?: CameraStreamMetadata | null) {
  if (!metadata) return 'não confirmado';
  const codec = normalizeCodec(metadata.codec).toUpperCase();
  const resolution = metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : 'resolução não confirmada';
  const fps = metadata.fps ? ` · ${Math.round(metadata.fps)} FPS` : '';
  return `${codec} · ${resolution}${fps}`;
}

function detectFamily(values: Array<string | null | undefined>) {
  const haystack = values.filter(Boolean).join(' ').toLowerCase();
  if (haystack.includes('/cam/realmonitor') || haystack.includes('dahua') || haystack.includes('amcrest') || haystack.includes('empiretech')) {
    return { family: 'dahua' as const, confidence: 'high' as const };
  }
  if (haystack.includes('/streaming/channels') || haystack.includes('hikvision')) {
    return { family: 'hikvision' as const, confidence: 'high' as const };
  }
  if (haystack.includes('h264preview_') || haystack.includes('h265preview_') || haystack.includes('reolink')) {
    return { family: 'reolink' as const, confidence: 'high' as const };
  }
  if (haystack.includes('/axis-media/') || haystack.includes('axis')) {
    return { family: 'axis' as const, confidence: 'high' as const };
  }
  return { family: 'generic' as const, confidence: 'low' as const };
}

export function assessCameraCompatibility(input: {
  selectedPath?: string | null;
  onvifProfileNames?: Array<string | null | undefined>;
  mainMetadata?: CameraStreamMetadata | null;
  subMetadata?: CameraStreamMetadata | null;
  rtspAuthenticated: boolean;
  onvifProfilesFound: number;
}): CameraCompatibilityAssessment {
  const detected = detectFamily([
    input.selectedPath,
    ...(input.onvifProfileNames ?? []),
  ]);
  const hints: CameraCompatibilityHint[] = [];
  const mainCodec = normalizeCodec(input.mainMetadata?.codec);
  const subCodec = normalizeCodec(input.subMetadata?.codec);
  const subPixels = Number(input.subMetadata?.width ?? 0) * Number(input.subMetadata?.height ?? 0);

  if (!input.rtspAuthenticated) {
    hints.push({
      code: 'rtsp_not_confirmed',
      severity: 'critical',
      title: 'Vídeo não confirmado',
      message: 'A câmera respondeu na rede, mas o DRAC ainda não conseguiu abrir o vídeo.',
      action: 'Confira usuário, senha e se o RTSP está habilitado na câmera.',
    });
  }

  if (!input.mainMetadata) {
    hints.push({
      code: 'main_stream_not_confirmed',
      severity: 'warning',
      title: 'Qualidade principal não confirmada',
      message: 'O perfil principal não informou codec e resolução.',
      action: 'O DRAC continuará tentando detectar o perfil principal em segundo plano.',
    });
  }

  if (!input.subMetadata) {
    hints.push({
      code: 'substream_missing',
      severity: 'warning',
      title: 'Substream não encontrado',
      message: 'Live e gravação funcionarão, mas tarefas de análise não terão um stream leve separado.',
      action: 'Habilite um substream H.264 de 640x360 a 1280x720 na câmera.',
    });
  } else if (subCodec === 'h265') {
    hints.push({
      code: 'substream_hevc',
      severity: 'warning',
      title: 'Substream em H.265',
      message: 'O substream é leve, mas exige mais processamento para análise e diagnóstico.',
      action: 'Prefira H.264 no substream quando a câmera permitir.',
    });
  } else if (subPixels > 0 && subPixels < 320 * 240) {
    hints.push({
      code: 'substream_too_small',
      severity: 'warning',
      title: 'Substream muito pequeno',
      message: 'A resolução do substream pode perder detalhes importantes.',
      action: 'Use ao menos 640x360 quando disponível.',
    });
  }

  if (input.onvifProfilesFound === 0) {
    hints.push({
      code: 'onvif_profiles_missing',
      severity: 'info',
      title: 'Perfis ONVIF não listados',
      message: 'O vídeo pode funcionar normalmente por RTSP, mas alguns recursos de controle podem ficar indisponíveis.',
    });
  }

  if (detected.family === 'reolink') {
    hints.push({
      code: 'reolink_stream_stability',
      severity: 'info',
      title: 'Compatibilidade Reolink',
      message: 'Alguns modelos Reolink apresentam melhor estabilidade quando HTTP/FLV está habilitado no firmware.',
      action: 'Só altere o protocolo se houver reconexões frequentes.',
    });
  }

  if (
    (detected.family === 'dahua' || detected.family === 'hikvision')
    && input.subMetadata
    && subPixels > 0
    && subPixels <= 640 * 480
  ) {
    hints.push({
      code: 'additional_substreams_available',
      severity: 'info',
      title: 'Perfil intermediário pode existir',
      message: 'Esta família de câmera frequentemente oferece outros substreams além do perfil básico detectado.',
      action: 'O perfil atual é seguro; habilite um perfil intermediário apenas se precisar de mais detalhe.',
    });
  }

  const hasCritical = hints.some((hint) => hint.severity === 'critical');
  const hasWarning = hints.some((hint) => hint.severity === 'warning');
  const state = hasCritical ? 'attention' : hasWarning ? 'compatible' : 'ideal';
  const summary = state === 'ideal'
    ? 'Configuração ideal detectada e aplicada automaticamente.'
    : state === 'compatible'
      ? 'Câmera compatível; o DRAC aplicou a configuração mais segura disponível.'
      : 'A câmera respondeu, mas precisa de atenção antes de operar com estabilidade.';

  return {
    state,
    detectedFamily: detected.family,
    confidence: detected.confidence,
    summary,
    automaticProfile: {
      live: `Principal · ${formatStream(input.mainMetadata)}`,
      recording: `Principal · ${mainCodec === 'h265' ? 'H.265 direto, sem conversão' : `${formatStream(input.mainMetadata)} com política H.265`}`,
      analytics: `Substream · ${formatStream(input.subMetadata)}`,
    },
    hints,
  };
}
