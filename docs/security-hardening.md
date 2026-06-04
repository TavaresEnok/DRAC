# DRAC VMS - Security Hardening

Este guia consolida os ajustes minimos para uma instalacao de producao controlada. Ele complementa `docs/production-readiness-checklist.md` e deve ser revisado sempre que portas, dominios, MediaMTX ou storage mudarem.

## Principios

- Nao versionar `.env` reais, dumps de banco, chaves privadas ou credenciais de cameras.
- Publicar a aplicacao por HTTPS em dominio real.
- Manter banco, Redis, API interna do MediaMTX e metrics em loopback ou rede privada.
- Permitir publish no MediaMTX apenas para servicos internos autenticados.
- Deixar o navegador com permissao de leitura/playback, nunca publish.
- Usar firewall para reduzir superficie antes de expor o servidor na internet.

## Compose

Use o Compose base sempre com um override explicito:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d --build
docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d --build
```

O arquivo `infra/docker-compose.yml` contem os servicos comuns. Os arquivos `infra/docker-compose.dev.yml` e `infra/docker-compose.prod.yml` definem como as portas saem do host.

Em producao, mantenha por padrao:

- API em `127.0.0.1:3000`.
- Web em `127.0.0.1:5173`.
- Postgres em `127.0.0.1:5432`.
- Redis em `127.0.0.1:6379`.
- MediaMTX API e metrics em `127.0.0.1`.
- WebRTC HTTP/UDP exposto apenas se o reverse proxy e a topologia exigirem.

## MediaMTX

O usuario `any` deve ficar limitado a leitura:

- `read`
- `playback`

O usuario interno definido por `MEDIAMTX_API_USER` e `MEDIAMTX_API_PASS` pode:

- `publish`
- `read`
- `playback`
- `api`
- `metrics`

Configure origens de HLS/WebRTC:

```env
MEDIAMTX_HLS_ALLOW_ORIGIN=https://drac.example.com
MEDIAMTX_WEBRTC_ALLOW_ORIGIN=https://drac.example.com
MEDIAMTX_WEBRTC_ADDITIONAL_HOST=drac.example.com
```

Em desenvolvimento, `*` e aceitavel. Em producao, use o dominio HTTPS real.

## HTTPS e WebRTC

Configure as URLs publicas antes de expor o sistema em dominio real:

```env
PUBLIC_APP_URL=https://drac.example.com
API_PUBLIC_URL=https://drac.example.com/api
MEDIAMTX_PUBLIC_HOST=drac.example.com
MEDIAMTX_PUBLIC_SCHEME=https
MEDIAMTX_PUBLIC_WEBRTC_URL=https://drac.example.com/webrtc
MEDIAMTX_PUBLIC_HLS_URL=https://drac.example.com/hls
MEDIAMTX_WEBRTC_ALLOW_ORIGIN=https://drac.example.com
MEDIAMTX_HLS_ALLOW_ORIGIN=https://drac.example.com
```

Use `MEDIAMTX_PUBLIC_WEBRTC_URL` e `MEDIAMTX_PUBLIC_HLS_URL` quando o reverse proxy publicar MediaMTX sem as portas `8889` e `8888` no navegador. Se essas variaveis ficarem vazias, a API monta as URLs usando `MEDIAMTX_PUBLIC_HOST`, `MEDIAMTX_PUBLIC_SCHEME` e as portas configuradas.

Use `infra/reverse-proxy.nginx.example` como base. Valide:

```bash
curl -I https://drac.example.com/
curl -fsS https://drac.example.com/api/health
```

Teste WebRTC em navegador real:

1. Acesse a tela `/live` via HTTPS.
2. Abra uma camera com origem main.
3. Confirme que o endpoint `/camera-stream/:cameraId/urls` retorna `webrtcUrl` ou `whepUrl` com o host correto.
4. No navegador, confirme `connectionState=connected`.
5. Valide audio quando a camera tiver audio habilitado.
6. Monitore `docker stats vms-mediamtx vms-api` e processos `ffmpeg`.
7. Se falhar, consulte auditoria com acao `stream.live.failure` para ver protocolo, estagio e motivo reportado pelo navegador.

Se o dominio estiver atras de NAT, ajuste `MEDIAMTX_WEBRTC_ADDITIONAL_HOST` para o dominio publico ou IP publico correto.

## CORS

Configure somente origens reais:

```env
CORS_ALLOWED_ORIGINS=https://drac.example.com
VITE_API_URL=/api
```

Evite IPs temporarios em producao, exceto durante janela controlada de migracao.

## Segredos

Gere valores longos e unicos para:

- `JWT_SECRET`
- `CAMERA_SECRET_KEY`
- `INTERNAL_SERVICE_TOKEN`
- `EVIDENCE_HMAC_SECRET`
- `POSTGRES_PASSWORD`
- `MEDIAMTX_API_PASS`

Rode:

```bash
chmod 600 infra/.env
```

Troque `EVIDENCE_HMAC_KEY_ID` ao fazer rotacao planejada de chave de evidencia.

## Firewall

Exemplo base com `ufw`:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8189/udp
sudo ufw enable
```

Abra RTSP/HLS/WebRTC diretamente apenas quando houver necessidade operacional clara.

## Healthchecks

O Compose possui healthchecks para:

- Postgres
- Redis
- API
- Web
- AI Service
- MediaMTX

Validacao:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.prod.yml ps
docker inspect --format '{{json .State.Health}}' vms-api
docker inspect --format '{{json .State.Health}}' vms-mediamtx
```

## Backups e Restore

Backups locais ficam em:

```text
infra/backups/postgres
```

Em producao, copie para storage externo. Valide restore em banco temporario antes de confiar no backup.

Fluxo recomendado:

```bash
docker exec vms-postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
ls -lh infra/backups/postgres
```

Teste restore em ambiente separado ao menos uma vez por ciclo de release.

## Retencao de Gravacoes

Variaveis principais:

```env
RETENTION_DAYS=30
RECORDING_RETENTION_DAYS=30
RETENTION_USE_BULLMQ=true
```

Validacao real:

1. Configure uma camera com retencao curta em ambiente de teste.
2. Grave segmentos suficientes para atravessar a janela.
3. Rode o worker/agendamento de retencao.
4. Confirme que gravacoes antigas foram removidas.
5. Confirme que evidencias em legal hold nao foram apagadas.

## Monitoramento

Monitore no minimo:

- CPU e memoria por container.
- Uso de disco do storage de gravacoes.
- Uso de disco de `infra/backups`.
- Quantidade de processos `ffmpeg`.
- Latencia e queda de conexoes WebRTC.
- Logs de `vms-api`, `vms-mediamtx` e `vms-ai-service`.
- Healthchecks em estado `unhealthy`.

Comandos rapidos:

```bash
docker stats --no-stream
docker logs --tail=120 vms-api
docker logs --tail=120 vms-mediamtx
docker logs --tail=120 vms-ai-service
```

## Checklist Final

- `.env` real fora do Git e com `chmod 600`.
- `docker-compose.prod.yml` em uso.
- HTTPS ativo.
- `/api/health` respondendo pelo dominio.
- WebRTC validado em navegador real.
- CORS restrito ao dominio.
- MediaMTX sem publish anonimo.
- Backup externo configurado.
- Restore testado.
- Retencao testada com gravacao real.
- Logs e alertas ativos.
