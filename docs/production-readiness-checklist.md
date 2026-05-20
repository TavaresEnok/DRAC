# Drac VMS - Checklist de Produção

Data da última validação: 2026-05-19

## Escopo desta rodada

Itens concluídos:
- Backup automático local do banco Postgres.
- Teste real de restore em banco temporário.
- Política de restart dos containers.
- Segredos obrigatórios fortes e carregados por `.env`.
- Menu lateral limpo com módulos essenciais.
- Página `/storage` renomeada visualmente para `Monitoramento`.
- Retenção de gravações explicitada.
- Build frontend otimizado com carregamento por página.
- Smoke tests de API, web e login.

Itens pulados por decisão operacional:
- Backup externo fora do servidor.
- Sistema completo de monitoramento/alertas externos de container, disco, CPU, memória e gravação.

## Backup do Banco

Destino local no servidor:

```text
/home/flashnet/Drac/infra/backups/postgres
```

Formato:

```text
drac-postgres-YYYYMMDDTHHMMSSZ.dump
```

Configuração padrão:
- `POSTGRES_BACKUP_RETENTION_DAYS=14`
- `POSTGRES_BACKUP_INTERVAL_SECONDS=86400`

Validação realizada:
- Um banco temporário foi criado.
- O dump mais recente foi restaurado com `pg_restore`.
- Foram consultadas tabelas principais.
- O banco temporário foi removido após o teste.

## Retenção de Gravações

Configuração padrão:
- `RETENTION_DAYS=7`
- `RECORDING_RETENTION_DAYS=7`
- `RETENTION_USE_BULLMQ=true`

Regra operacional:
- A retenção global padrão é de 7 dias.
- Cada câmera pode sobrescrever esse valor com `retentionDays`.
- Evidências em legal hold devem permanecer protegidas contra limpeza automática.

## Restart dos Containers

Containers essenciais com `restart: unless-stopped`:
- `vms-postgres`
- `vms-redis`
- `vms-mediamtx`
- `vms-api`
- `vms-web`
- `vms-postgres-backup`
- `vms-ai-service`

## Portas e Exposição

Exposição atual esperada:
- Web: `5173`
- API: `3000`
- MediaMTX RTSP/HLS/WebRTC: `8554`, `8888`, `8889`, `8189/udp`

Serviços protegidos em loopback/rede interna:
- Postgres: `127.0.0.1:5432`
- Redis: `127.0.0.1:6379`
- MediaMTX API: `127.0.0.1:9997`
- MediaMTX metrics: `127.0.0.1:9998`
- Adminer: profile `admin-tools` e loopback

Observação:
- A API `3000` continua pública porque o frontend atual chama `http(s)://host:3000` diretamente.
- Para fechar a API em produção, antes é necessário colocar proxy `/api` no Nginx/web e ajustar `VITE_API_URL`.

## Menu Essencial

Itens visíveis:
- Painel
- Ao Vivo
- Reprodução
- Câmeras
- Monitoramento
- Usuários
- Configurações
- Atalhos

Itens em standby:
- Rotas antigas podem existir para compatibilidade, mas não aparecem no menu lateral.
- Se for necessário endurecer ainda mais, remover as rotas standby do `App.tsx` depois de confirmar que ninguém usa links diretos.

## Deploy

Comando padrão:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --build api web mediamtx postgres-backup
```

Validações pós-deploy:

```bash
docker ps
curl -fsS http://127.0.0.1:3000/health
curl -I -fsS http://127.0.0.1:5173/
docker logs --tail=120 vms-api
docker logs --tail=80 vms-mediamtx
docker logs --tail=80 vms-postgres-backup
```

## Rollback

Passos seguros:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d api web
```

Se precisar restaurar banco:

```bash
# 1. Parar serviços que escrevem no banco.
docker stop vms-api

# 2. Restaurar dump escolhido em ambiente controlado.
# Nunca sobrescrever produção sem antes testar restore em banco temporário.

# 3. Subir API novamente.
docker start vms-api
```

## Status Final desta Rodada

Classificação:

```text
Release candidate para produção controlada
```

Pendências conscientes:
- Backup externo.
- Monitoramento/alertas externos.
- Proxy `/api` para permitir fechar porta `3000`.
