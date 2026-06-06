# Analise De Concorrentes: Performance, Live, Gravacao E Playback

Data: 2026-06-04

Escopo: Frigate, Scrypted, Shinobi, Moonfire NVR, lightNVR e projetos auxiliares em `/concorrentes`.

## Padroes Que Valem Para O DRAC

1. Separar papeis de stream.
   Frigate e Scrypted tratam `detect`, `record` e `live` como papeis diferentes. Isso evita que a IA ou a live puxem o mesmo stream pesado da gravacao.

2. Preservar video original quando possivel.
   Moonfire e Shinobi priorizam `copy`/pass-through para gravacao. Transcode deve ser excecao, porque 1080p/2K em tempo real custa CPU e aumenta instabilidade.

3. Transcode somente sob demanda.
   Para live HEVC, o DRAC deve manter o modelo atual: MediaMTX com `runOnDemand`, ligando FFmpeg apenas quando existe leitor WebRTC/HLS.

4. Playback precisa de timeline por metadados, nao varredura pesada de disco.
   Moonfire usa metadados/indexacao para navegar gaps e segmentos. O DRAC ja possui banco de gravacoes, gaps e cache compativel; a evolucao correta e fortalecer diagnostico e timeline, nao reprocessar arquivos em toda tela.

5. Saude operacional deve ser por camera.
   lightNVR expoe metricas de stream, quedas, reconnects, gaps e bytes. O DRAC precisa mostrar por camera o custo esperado: HEVC live, audio Opus, readers no MediaMTX, analytics acoplado, codec de gravacao e risco de playback.

## Situacao Atual Do DRAC

- Live: WebRTC como padrao, LL-HLS/HLS como fallback.
- HEVC na live: convertido para H.264/WebRTC via MediaMTX on-demand.
- Audio: quando habilitado, convertido para Opus para WebRTC.
- Gravacao: perfil separado, com politica de preservar main stream e cache de playback compativel.
- Analytics: campo `analyticsSubtype` existe e deve apontar para substream direto da camera.

## Melhoria Implementada Nesta Onda

Criado `StreamResourceAdvisorService` com rotas:

- `GET /camera-stream/resource-diagnostics`
- `GET /camera-stream/:cameraId/resource-diagnostics`

O diagnostico retorna:

- perfil de live, gravacao e analytics por camera;
- se live vai exigir transcode para navegador;
- se audio esta gerando conversao Opus;
- se analytics esta acoplado a live;
- se gravacao esta no main stream e se e amigavel a copy H.265;
- leitores atuais no path MediaMTX, quando a API runtime estiver disponivel;
- risco por camera (`ok`, `attention`, `high`, `critical`);
- recomendacoes agregadas para suporte.

Tambem foi criada a tela operacional:

- `/performance`

Ela consolida os mesmos dados para administradores e suporte: cameras online, live com transcode provavel, analytics separado, leitores MediaMTX, risco por camera e recomendacoes.

## Proximas Ondas Recomendadas

1. Exibir esse diagnostico no painel de camera e na Central.
2. Transformar findings criticos em alertas persistentes, sem criar ruido para operador comum.
3. Registrar historico de readers, transcodes, quedas e gaps por camera.
4. Usar o advisor para sugerir ajustes automaticos seguros: `analyticsSubtype=1`, live WebRTC, live main stream e gravacao main stream.
5. Manter IA fora do caminho da live e da gravacao: substream direto, sem audio e latest-frame-only.

## Ondas Executadas

### Onda 2 - Live/WebRTC Diagnosticavel

- Falhas registradas pelo frontend em `stream.live.failure` agora entram no diagnostico por camera.
- O advisor calcula `failuresLast24h`, ultimo motivo, protocolo, etapa e estado.
- Falhas repetidas viram finding `repeated_live_failures`.

### Onda 3 - Gravacao Operacional

- Cada camera passa a mostrar segmentos das ultimas 24h, segmentos ativos e ultimo segmento.
- Gravacao continua sem segmento recente vira finding `recording_recent_segments_missing`.
- A regra respeita o produto: gravacao continua nao e obrigatoria quando a camera esta em modo manual/movimento.

### Onda 4 - Playback Pronto Para Suporte

- O diagnostico inclui estado de playback e ultimo candidato de midia.
- O diagnostico estima cobertura de gravacao nas ultimas 24h, segundos de gap e maior gap por camera.
- A estimativa usa metadados do banco e nao varre todos os arquivos em disco.
- Continua usando a politica DRAC: servir original com range request e usar cache H.264/AAC quando o navegador precisar.

### Onda 5 - Historico E Central

- Heartbeat da Central agora recebe resumo de streaming:
  - cameras com risco alto de CPU;
  - lives com transcode provavel;
  - falhas de live nas ultimas 24h;
  - leitores MediaMTX;
  - acoes seguras pendentes.
- Central armazena esses campos no historico de heartbeat.
- Central mostra streaming em graficos, detalhe do cliente e alertas operacionais.

### Onda 6 - Otimizacao Assistida Segura

- Criadas rotas:
  - `GET /camera-stream/optimization-plan`
  - `POST /camera-stream/optimization/apply-safe`
- Aplicacao segura pode normalizar:
  - `preferredLiveProtocol=webrtc`;
  - `liveSubtype=0`;
  - `recordingSubtype=0`;
  - `analyticsSubtype=1` quando analytics estiver acoplado a live.
- Nao altera IP, usuario, senha, caminhos RTSP/ONVIF, codec fisico da camera ou audio.

### Onda 7 - UX Operacional

- Tela `/performance` mostra:
  - falhas de live;
  - transcode provavel;
  - segmentos de gravacao;
  - analytics separado/acoplado;
  - leitores MediaMTX;
  - risco por camera;
  - botao "Ajustar seguro" para administradores.

### Onda 8 - Compatibilidade, Preflight E Operacao Sem Ruido

- O assistente de camera passou a:
  - reconhecer familias comuns por caminhos/perfis descobertos;
  - testar candidatos RTSP em lotes concorrentes e parar assim que encontra um perfil valido;
  - escolher principal/substream e mostrar somente recomendacoes acionaveis;
  - suportar caminhos adicionais usados por Reolink, Axis e outras familias ONVIF/RTSP.
- A live passou a avaliar readiness de WebRTC antes de explicar a falha:
  - MediaMTX desabilitado;
  - path ainda nao publicado;
  - WHEP ausente;
  - mixed content HTTP em painel HTTPS;
  - origem WebRTC nao autorizada.
- Instalador envia e confirma o primeiro heartbeat imediatamente.
- Central ganhou `GET /api/agent/status`, autenticado por identidade/licenca da instalacao.
- Readiness, regressao e pacote de diagnostico validam o vinculo real com a Central.
- Quando IA esta desativada, polling de overlay/live-view responde em modo no-op sem tentar acessar container ausente.

## Regra De Produto

O DRAC deve parecer simples para o operador, mas internamente agir como NVR profissional:

- usuario escolhe camera e qualidade;
- sistema escolhe a rota mais barata e estavel;
- suporte enxerga causa real quando algo pesa ou falha.
