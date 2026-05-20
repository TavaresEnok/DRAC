# Referencias uteis extraidas do Shinobi

Data: 2026-05-18

Objetivo: remover a instalacao do Shinobi, mantendo apenas ideias tecnicas que podem orientar melhorias futuras no Drac. Esta nota nao contem credenciais, URLs RTSP completas ou dados sensiveis encontrados nos backups antigos.

## O que vale reaproveitar como referencia

- PTZ hibrido: o Shinobi suporta dois caminhos, ONVIF e controle generico via URL HTTP. O caminho generico permite configurar uma URL por direcao, metodo HTTP, digest auth e comando de stop separado.
- Stop automatico de PTZ: os movimentos podem iniciar e parar automaticamente depois de um timeout, reduzindo risco de camera ficar girando por comando preso.
- ONVIF com fallback de fabricante: existe a opcao `onvif_non_standard` para cameras que desviam do padrao ONVIF. Isso reforca a necessidade de termos um modo de compatibilidade por marca/modelo no Drac.
- Presets e Home PTZ: ha funcoes para listar presets, criar preset, mover para preset e voltar para home. Boa referencia para organizar nossa API PTZ.
- PTZ follow: o Shinobi tem uma logica de mover a camera com base na matriz de deteccao de objeto. Nao deve entrar agora em producao, mas e uma referencia futura.
- Eventos ONVIF: o Shinobi escuta eventos ONVIF e transforma em evento interno de movimento/alarme. Vale considerar como alternativa leve a analise por frame quando a camera entrega eventos confiaveis.
- Scanner ONVIF/FFprobe: a combinacao de scanner ONVIF com ffprobe e util para detectar capacidade real de codec, resolucao, FPS e bitrate antes de salvar configuracoes.
- Snapshot fallback: snapshot ONVIF/JPEG e usado como fallback para visualizacao, teste e configuracao quando live stream nao e necessario.
- Pipeline FFmpeg: o Shinobi trabalha com `rtsp_transport`, `analyzeduration`, `probesize`, input maps, copy/transcode e saidas HLS/FLV/MP4. Para o Drac, a recomendacao continua sendo manter o minimo necessario e priorizar MediaMTX/WebRTC/HLS compativel com navegador.

## O que nao vale trazer para o Drac agora

- Interface e arquitetura monolitica do Shinobi.
- Dependencia do banco/estrutura `ccio`.
- Plugins antigos de notificacao/upload.
- Gateway legado que chamava APIs do Shinobi.
- Configuracoes antigas com credenciais embutidas em arquivos/backups.

## Recomendacao para o Drac

- Implementar PTZ em camadas: `onvif`, `vendor_http`, e `disabled`.
- Salvar capacidades detectadas por camera com fonte e data da ultima deteccao.
- Adicionar scanner de compatibilidade por camera usando ONVIF + ffprobe.
- Separar controles de operacao atual de configuracoes tecnicas avancadas.
- Nao copiar codigo do Shinobi diretamente; usar apenas a logica como referencia comportamental.

## Limpeza executada

- Container legado `drac-gateway` removido. Ele era criado por `/root/Shinobi/apps/drac-gateway/docker-compose.yml` e apontava para `SHINOBI_BASE_URL`.
- Rede Docker `shinobidocker_default` removida apos a retirada do gateway legado.
- Assets Drac legados encontrados dentro de `/root/Shinobi/apps` foram movidos para `/root/drac-legacy-from-shinobi` como quarentena, para evitar perda acidental.
- Instalacao `/root/Shinobi` removida.
- Containers atuais do Drac preservados: `vms-web`, `vms-api`, `vms-postgres`, `vms-redis`, `vms-mediamtx`, `vms-ai-service`.

## Observacao de seguranca

Volumes Docker anonimos sem nome Shinobi foram preservados porque nao havia label/nome confiavel ligando esses volumes ao Shinobi. A remocao deve ser feita somente apos aprovacao explicita ou auditoria manual desses volumes.
