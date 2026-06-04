# Revisao Das Melhorias Nao-IA - 2026-06-04

Esta rodada implementou melhorias comerciais sem alterar IA, modelos, YOLO, OpenVINO, ByteTrack, overlay de deteccao ou analytics.

## Onda 1 - WebRTC Externo E Live Robusta

- API passou a aceitar `PUBLIC_APP_URL`, `API_PUBLIC_URL`, `MEDIAMTX_PUBLIC_WEBRTC_URL` e `MEDIAMTX_PUBLIC_HLS_URL`.
- URLs publicas do MediaMTX podem ser montadas por base URL explicita, util para reverse proxy HTTPS sem expor portas `8888/8889`.
- Endpoint `/camera-stream/:cameraId/urls` passou a retornar diagnostico de origem, host publico, origin permitido e path MediaMTX.
- Frontend registra falhas de live em `/camera-stream/:cameraId/live-failure`.
- Auditoria passa a receber `stream.live.failure` com protocolo, estagio, motivo e user-agent.

## Onda 2 - Instalador Comercial Simples

- `scripts/install-drac.sh` ganhou preflight de DNS, GitHub, Central, memoria, disco e portas.
- Instalador grava valores publicos iniciais de app/API/MediaMTX no `infra/.env`.
- Documentacao de instalacao foi ampliada com preflight, operacao limpa, update, diagnostico e restore.

## Onda 3 - Reproducao E Timeline

- `/playback` ganhou modo multi-camera v1.
- Ate 4 cameras podem ser comparadas na mesma data e horario.
- Cada camera mostra disponibilidade do trecho atual e mini timeline sincronizada com a janela selecionada.
- Estado vazio por camera aparece como ausencia de gravacao, nao como erro.

## Onda 4 - Central Operacional

- Central ganhou endpoint `GET /api/admin/installations/:id/diagnostics`.
- Diagnostico sanitizado consolida instalacao, readiness, cameras, storage, servidor, alertas ativos e ultimos heartbeats.
- Painel da Central ganhou botao "Copiar diagnostico" na manutencao da instalacao.
- Auditoria registra visualizacao/copia de diagnostico.

## Onda 5 - Mobile

- Dashboard mobile mostra avisos operacionais: servidor indisponivel, camera offline e perfil somente visualizacao.
- Sessao expirada limpa o login local e mostra mensagem clara.
- Live mobile diferencia falta de sinal/permissao e mostra acoes indisponiveis como "Sem permissao".
- Player mobile mostra mensagem mais util quando a transmissao nao esta disponivel.

## Validacao

- `corepack pnpm verify`
- `node --check apps/central/src/server.js`
- `bash -n scripts/install-drac.sh`
- `bash -n scripts/production-readiness.sh`
- `bash -n scripts/prod-regression.sh`
- `./scripts/production-readiness.sh`: 57 checks, 0 atencoes, 0 bloqueios.
- `./scripts/prod-regression.sh`: 21 checks, 0 avisos, 0 falhas, restore temporario OK.

## Fora Do Escopo

- IA continua desativada/intocada.
- Nao foram alterados modelos, tracking, deteccao, classes, overlay ou zonas inteligentes.
- Validacao externa com dominio HTTPS real ainda depende de ambiente publico.
