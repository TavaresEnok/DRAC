# VMS Platform

## 1. Visão geral

Base profissional de VMS/NVR em monorepo com API NestJS, frontend React e infraestrutura local via Docker. Esta fase já inclui live view MJPEG via FFmpeg e PTZ ONVIF (SOAP Digest), mantendo o legado em `legacy/`.

## 2. Stack

- Backend: NestJS + TypeScript
- Banco: PostgreSQL
- ORM: Prisma
- Fila/cache: Redis + BullMQ
- Frontend: React + Vite + TypeScript
- Futuro streaming worker: Go + FFmpeg
- Futuro IA: Python + FastAPI
- Monorepo: pnpm workspaces

## 3. Estrutura

```text
apps/
  api/
  web/
infra/
legacy/
services/
  camera-worker-go/
  ai-service-python/
```

## 4. Instalação

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install
```

## 5. Subir infraestrutura

```bash
pnpm docker:up
```

Portas:

- PostgreSQL: `5432`
- Redis: `6379`
- Adminer: `8090`

## 6. Configurar variáveis

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

## 7. Banco de dados

```bash
pnpm db:migrate
pnpm --filter api prisma db seed
pnpm --filter api import:legacy-camera
```

## 8. Rodar API e frontend

```bash
pnpm dev:api
pnpm dev:web
```

Health check:

```bash
curl http://localhost:3000/health
```

## 9. Cadastrar câmera

Via frontend:

1. Abra a dashboard.
2. Preencha nome, IP, usuário e senha.
3. Ajuste RTSP/ONVIF (porta/path/profile token) conforme o modelo da câmera.
4. Salve e selecione a câmera na lista.

Via API:

```bash
curl -X POST http://localhost:3000/cameras \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Cam A",
    "ip":"192.168.0.10",
    "rtspPort":554,
    "onvifPort":80,
    "username":"admin",
    "password":"change_me",
    "rtspPath":"/cam/realmonitor?channel=1&subtype=0",
    "onvifPath":"/onvif/ptz_service",
    "onvifProfileToken":"Profile000",
    "channel":1,
    "subtype":0
  }'
```

## 10. Testar RTSP e ONVIF

- `POST /cameras/:id/test-connection`
- `GET /cameras/:id/status`

Retorno inclui RTSP online/offline, ONVIF online/offline e status geral da câmera.

Observabilidade operacional:

- `GET /cameras/overview` (VIEWER+): resumo operacional (contadores, atividade 24h, câmeras stale).
- `GET /camera-stream/stats` (ADMIN+): métricas globais de stream FLV (requests, falhas, fallback, streams ativos).
- `GET /camera-stream/:cameraId/stats` (ADMIN+): métricas por câmera.
- Incidentes de stream são registrados como `CameraEvent` automaticamente com deduplicação por janela.
- `GET /cameras/events-feed` (VIEWER+): feed paginado/filtrável de eventos (`cameraId`, `type`, `severity`, `from`, `to`, `limit`, `offset`).
- `GET /cameras/alarms` (VIEWER+): visão operacional de alarmes (`OPEN`, `ACKED`, `RESOLVED`).
- `POST /cameras/alarms/:eventId/ack` (OPERATOR+): acknowledge de alarme.
- `POST /cameras/alarms/:eventId/resolve` (OPERATOR+): resolve de alarme.
- `GET /cameras/incidents` (VIEWER+): lista incidentes de stream com filtros (`cameraId`, `from`, `to`, `acknowledged`, `limit`).
- `POST /cameras/incidents/:eventId/ack` (OPERATOR+): reconhece incidente com nota opcional.
- `POST /cameras/incidents/ack/bulk` (OPERATOR+): reconhece múltiplos incidentes em lote.
- `GET /cameras/incidents/export.csv` (VIEWER+): exportação CSV de incidentes filtrados.
- `GET /cameras/health-scores` (VIEWER+): score de saúde por câmera para priorização operacional.
- `GET /cameras/reliability?days=7|30` (VIEWER+): relatório de confiabilidade operacional por câmera.
- `GET /cameras/reliability-trend?days=30&cameraId=...` (VIEWER+): tendência diária de confiabilidade.
- `GET /cameras/alerts` (VIEWER+): alertas ativos com severidade `WARNING`/`CRITICAL` por limiares.

Frontend adicional (mockup avançado):

- `/events`: feed completo de eventos com filtros e detalhe.
- `/alarms`: gestão de alarmes com prioridade, ACK e resolve.
- `/map`: floorplan por unidade/andar com upload de planta SVG, marcadores arrastáveis e persistência no backend.
- `/playback`: playback avançado com scrubber temporal e marcadores de evento.
- `/investigation`: timeline multi-câmera com cesta de evidências.
- `/evidence`: export de pacote de evidência (JSON + hash SHA-256), assinatura HMAC opcional e verificação de integridade/assinatura.
- `Ctrl+K`: command palette global; `Alt+1..9`: navegação rápida.

Layout de mapa por unidade:

- `GET /sites/:siteId/map-layouts` (VIEWER+): lista layouts salvos por andar.
- `GET /sites/:siteId/map-layouts/:floor` (VIEWER+): retorna layout específico do andar.
- `PUT /sites/:siteId/map-layouts/:floor` (ADMIN+): cria/atualiza planta SVG e marcadores por câmera.
- `DELETE /sites/:siteId/map-layouts/:floor` (ADMIN+): remove layout salvo do andar.

Assinatura/verificação server-side de evidência:

- `POST /evidence/sign` (OPERATOR+): assina payload com HMAC-SHA256 do servidor e retorna `packageHash` + `signature`.
- `POST /evidence/verify` (VIEWER+): valida hash/assinatura de um pacote JSON de evidência.

## 11. Live view MJPEG (protegido)

- Gerar token: `POST /camera-stream/:cameraId/token` (JWT obrigatório)
- Stream: `GET /camera-stream/:cameraId/mjpeg?token=...`
- Frontend gera token temporário e usa no `<img src="...">`.
- O player reconecta automaticamente em falha e possui botão de recarregar stream.

## 12. PTZ ONVIF

- Endpoint: `POST /ptz/:cameraId/move`
- Start:

```json
{ "action": "start", "direction": "Up" }
```

- Stop:

```json
{ "action": "stop" }
```

Direções suportadas: `Up`, `Down`, `Left`, `Right`, `ZoomIn`, `ZoomOut`.

## 13. Segurança e autenticação

- Login JWT: `POST /auth/login`
- Sessão atual: `GET /auth/me`
- Seed cria `SUPER_ADMIN` inicial com:
  - `ADMIN_EMAIL`
  - `ADMIN_PASSWORD`
  - `ADMIN_NAME`
- Hash de senha de usuário com `bcrypt`.
- Senhas são criptografadas antes de salvar.
- API nunca retorna `passwordHash`.
- API nunca retorna `passwordEncrypted`.
- Logs de RTSP são sanitizados para não expor credenciais.
- Processos FFmpeg são encerrados ao fechar conexão do cliente.
- Health check continua público (`GET /health`).
- Demais endpoints exigem autenticação (com exceção de stream/playback via token temporário).

Papéis de acesso:

- `SUPER_ADMIN`: acesso total.
- `ADMIN`: câmeras, gravações, usuários (exceto promover para `SUPER_ADMIN`), auditoria, PTZ.
- `OPERATOR`: live view, PTZ, start/stop gravação, listagem/playback de gravações.
- `VIEWER`: live view e playback/listagem de gravações (sem PTZ e sem start/stop gravação).

Tokens temporários:

- Live view: `POST /camera-stream/:cameraId/token` gera token curto (padrão `5m`), válido só para a câmera solicitada.
- Playback: `POST /recordings/:id/play-token` gera token curto (padrão `5m`), válido só para a gravação solicitada.
- Variável de expiração: `STREAM_TOKEN_EXPIRES_IN`.
- Janela de deduplicação de incidente de stream: `STREAM_INCIDENT_COOLDOWN_SECONDS`.
- Auto-remediação de saúde: `HEALTH_AUTO_REMEDIATION_ENABLED` e `HEALTH_AUTO_REMEDIATION_MAX_PER_RUN`.
- Limiar de alertas: `ALERT_SCORE_WARNING`, `ALERT_SCORE_CRITICAL`, `ALERT_OPEN_INCIDENTS_CRITICAL`, `ALERT_RECENT_WINDOW_MINUTES`.

Auditoria:

- Endpoint: `GET /audit-logs` (ADMIN/SUPER_ADMIN).
- Eventos auditados: login sucesso/falha, ações de usuários, câmeras, PTZ, gravação e geração de tokens temporários.

## 14. Gravação por segmentos

Variáveis da API (`apps/api/.env`):

- `RECORDINGS_ROOT=./storage/recordings`
- `RECORDING_SEGMENT_SECONDS=300`
- `FFMPEG_RECORDING_FORMAT=mp4`
- `FFMPEG_RECORDING_COPY_CODEC=true`
- `RECORDING_CONTROL_MODE=local` (`local` para FFmpeg no NestJS, `worker` para delegar start/stop ao worker Go via Redis Pub/Sub)
- `WORKER_COMMAND_CHANNEL=camera:commands`
- `EVIDENCE_HMAC_SECRET=...` (mínimo recomendado 16 caracteres)
- `EVIDENCE_HMAC_KEY_ID=local-v1`

Endpoints:

- Iniciar gravação: `POST /cameras/:cameraId/recording/start`
- Parar gravação: `POST /cameras/:cameraId/recording/stop`
- Status: `GET /cameras/:cameraId/recording/status`
- Listagem: `GET /recordings?cameraId=...&from=...&to=...&limit=...&offset=...`
- Gerar token playback: `POST /recordings/:id/play-token`
- Playback: `GET /recordings/:id/play?token=...`
- Download: `GET /recordings/:id/download`

Arquivos são salvos em:

```text
storage/recordings/camera-{cameraId}/YYYY/MM/DD/HH/*.mp4
```

No frontend, selecione a câmera e use:

1. Card `Gravação` para iniciar/parar.
2. Card `Gravações` para filtrar/listar.
3. Card `Playback` para assistir no `<video controls>`.

Limitações atuais:

- Gravação ainda é controlada pelo backend NestJS.
- Sem refresh token avançado.
- Sem 2FA.
- Sem SSO.
- Sem multiempresa.
- `localStorage` é aceitável apenas para MVP/dev.
- HTTPS é obrigatório em produção.
- Sem retenção automática de arquivos.
- Sem HLS/WebRTC.
- Sem IA/analytics/detecção de movimento.
- Playback depende do codec da câmera.
- Câmeras H.265/HEVC podem não tocar em alguns navegadores.
- Worker Go ainda não implementado.

Modo híbrido de gravação (novo):

- `local`: backend NestJS executa FFmpeg (compatível com setup atual).
- `worker`: backend NestJS envia comandos `start/stop` no Redis (`WORKER_COMMAND_CHANNEL`) e o worker Go executa gravação.
- Worker Go também deve usar o mesmo `WORKER_COMMAND_CHANNEL` e `INTERNAL_SERVICE_TOKEN`.

## 13.1 Instalação local: unidades, setores, grupos e permissões

- Este sistema é **on-premise** (instalação local para uma única empresa), não SaaS.
- Cada instalação pode organizar sua operação em:
  - `Site` (Unidade)
  - `Area` (Setor)
  - `CameraGroup` (Grupo de câmeras)
  - `CameraPermission` (permissão por câmera ou grupo)

Níveis de permissão por câmera:

- `VIEW`: live view + playback + download.
- `CONTROL`: tudo de `VIEW` + PTZ.
- `RECORD`: tudo de `CONTROL` + iniciar/parar gravação.
- `ADMIN`: tudo de `RECORD` + ações administrativas por câmera.

Como usar:

1. Criar unidades em `Unidades`.
2. Criar setores em `Setores` (com filtro por unidade).
3. Criar grupos em `Grupos`.
4. Associar câmera a grupo em `Grupos` ou no cadastro de câmera (`siteId`, `areaId`, `groupId`).
5. Conceder permissão em `Permissões` escolhendo:
   - usuário + câmera + nível, **ou**
   - usuário + grupo + nível.

Como testar perfis:

- `VIEWER` com `VIEW`: visualiza live/playback, sem PTZ e sem start/stop.
- `OPERATOR` com `CONTROL`: PTZ liberado.
- `OPERATOR` com `RECORD`: PTZ + start/stop gravação.
- `ADMIN`: gerenciamento total local de unidades/setores/grupos/câmeras/permissões.

Limitações atuais desta fase:

- sem permissões por horário;
- sem mapa/planta baixa;
- sem LDAP/AD/SSO;
- sem 2FA;
- sem worker Go;
- sem IA.

## 15. Troubleshooting

- FFmpeg não instalado:
  - Instale `ffmpeg` no host e reinicie a API.
  - API retorna erro claro quando binário não existe.
- RTSP offline:
  - Verifique IP, porta, usuário/senha, path, codec e firewall.
- ONVIF bloqueado:
  - Verifique ONVIF habilitado, porta correta e path (`/onvif/ptz_service`).
- Senha errada:
  - Atualize credencial da câmera e teste novamente.
- Porta errada:
  - Ajuste `rtspPort` e `onvifPort`.
- Câmera em H.265/HEVC:
  - Prefira substream H.264 para MJPEG estável.
- CORS:
  - Confira `VITE_API_URL` e porta da API.
- Firewall:
  - Libere tráfego entre servidor e câmera para portas RTSP/ONVIF.

## 16. Próximas fases recomendadas

1. Organizações/clientes (multiempresa).
2. Grupos de câmeras.
3. Permissões por câmera.
4. Criptografia mais forte de credenciais.
5. Retenção automática.
6. Migração do `camera-worker` para Go.

## Legacy

O protótipo Node/Express funcional foi preservado em `legacy/node-express-prototype/` como referência de FFmpeg, MJPEG, RTSP e PTZ.

## 17. Refatoração Visual (Maio 2026)

A interface foi completamente redesenhada para oferecer uma experiência enterprise moderna, clean e minimalista.

### Destaques do Novo Design
- **Estética SaaS**: Inspirada em produtos como Vercel, Linear e Stripe Dashboard.
- **Modo Claro/Escuro**: Suporte nativo com troca dinâmica e persistência local.
- **Navegação Lateral**: Menu lateral fixo para acesso rápido a todas as funções principais.
- **Componentes Refinados**: Uso de design system baseado em Radix UI e Tailwind CSS 4.
- **Performance**: Layouts otimizados e carregamento sob demanda de streams.

### Novas Páginas
1. **Dashboard**: Visão executiva com estatísticas de câmeras (online, offline, gravando).
2. **Monitoramento ao Vivo**: Grid otimizado com player avançado e controles PTZ HUD.
3. **Gerenciamento de Câmeras**: Tabela administrativa profissional com CRUD via modais.
4. **Histórico de Gravações**: Filtros por data e câmera com player de playback integrado.
5. **Usuários e Auditoria**: Telas limpas para gestão de acesso e logs de segurança.
