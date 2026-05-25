# Migração e instalação do DRAC VMS em nova VM

Este documento descreve como instalar o sistema em outra máquina a partir do repositório Git. Ele foi escrito para execução por outra IA ou operador técnico, com foco em uma VM Linux x86_64 usando Docker.

## 1. Visão geral do sistema

O projeto é um monorepo com:

- `apps/api`: API NestJS/TypeScript, Prisma, autenticação, câmeras, gravações, eventos, IA e MediaMTX.
- `apps/web`: frontend React/Vite servido por Nginx no container `vms-web`.
- `services/ai-service-python`: serviço FastAPI/Python para IA em CPU com OpenVINO/ONNX Runtime.
- `services/camera-worker-go`: worker legado opcional em Go.
- `infra`: Docker Compose, configuração do MediaMTX, storage local e exemplos de ambiente.
- `docs`: documentação operacional.

Serviços principais via Docker Compose:

- `vms-postgres`: PostgreSQL 16.
- `vms-redis`: Redis 7.
- `vms-api`: API na porta `3000`.
- `vms-web`: frontend nas portas `5173` e `3002`.
- `vms-ai-service`: IA interna na porta `8000` dentro da rede Docker.
- `vms-mediamtx`: RTSP/HLS/WebRTC nas portas `8554`, `8888`, `8889`, `8189/udp`.

## 2. O que deve e não deve ir para o Git

Versionar:

- Código fonte em `apps`, `services`, `infra` e `docs`.
- `pnpm-lock.yaml` e `pnpm-workspace.yaml`.
- `infra/.env.example`, `apps/api/.env.example` e `apps/web/.env.example`.
- Migrações Prisma em `apps/api/prisma/migrations`.

Não versionar:

- `.env`, `.env.*` reais com segredos.
- `infra/storage`, gravações, cache de playback e arquivos de vídeo.
- `infra/backups`, dumps PostgreSQL e bundles locais.
- `infra/ai-models`, exceto se for feito um pacote manual fora do Git.
- `node_modules`, `.venv`, `dist`, builds Android e SDKs locais.
- Scripts locais de probe com segredos reais.

## 3. Requisitos da nova VM

Recomendado:

- Ubuntu Server 22.04 LTS ou 24.04 LTS.
- CPU x86_64 moderna com AVX2. Intel i9 10a geração atende.
- 16 GB RAM ou mais, conforme número de câmeras.
- Disco SSD/NVMe para `infra/storage`.
- IP fixo configurado. Neste ambiente, o IP operacional é `168.194.13.70`.

Pacotes base:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates openssh-client openssl
```

Instalar Docker Engine e Compose plugin:

```bash
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Depois de adicionar o usuário ao grupo `docker`, encerrar a sessão SSH e entrar novamente.

Opcional para desenvolvimento fora do Docker:

```bash
sudo apt install -y nodejs npm python3 python3-venv python3-pip ffmpeg
sudo corepack enable
sudo corepack prepare pnpm@9.15.0 --activate
```

## 4. Clonar o projeto

```bash
cd /home
git clone git@github.com:TavaresEnok/DRAC.git Drac
cd /home/Drac
git checkout main
```

Se a VM ainda não tiver chave SSH autorizada no GitHub, usar uma chave deploy key ou token HTTPS conforme a política do repositório.

## 5. Configurar variáveis de ambiente

Criar o arquivo principal:

```bash
cd /home/Drac
cp infra/.env.example infra/.env
chmod 600 infra/.env
```

Editar `infra/.env`:

```bash
nano infra/.env
```

Gerar segredos fortes:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Preencher no `infra/.env`:

- `POSTGRES_PASSWORD`: senha forte do banco.
- `JWT_SECRET`: segredo JWT com no mínimo 32 caracteres.
- `CAMERA_SECRET_KEY`: chave forte para criptografar credenciais de câmera.
- `INTERNAL_SERVICE_TOKEN`: token interno usado entre API e IA.
- `EVIDENCE_HMAC_SECRET`: segredo para assinatura/verificação de evidências.
- `MEDIAMTX_API_USER`: usuário da API do MediaMTX.
- `MEDIAMTX_API_PASS`: senha da API do MediaMTX.
- `CORS_ALLOWED_ORIGINS`: incluir `http://168.194.13.70:5173` e qualquer domínio público usado.

Configuração recomendada para IA na VM nova:

```env
AI_CPU_RESERVE_PERCENT=14
AI_INFERENCE_WORKER_COUNT=
AI_INFERENCE_THREADS_OVERRIDE=
AI_GRID_DETECTION_FPS=1.0
AI_GRID_ANALYSIS_WIDTH=640
AI_GRID_ANALYSIS_HEIGHT=360
AI_GRID_IMGSZ=512
AI_QOS_LIVE_ENABLED=true
AI_ADAPTIVE_MODE=true
AI_ADAPTIVE_PILOT_CAMERA_IDS=*
```

Observação: manter `AI_INFERENCE_THREADS_OVERRIDE` vazio deixa o serviço calcular automaticamente o orçamento de CPU pelo percentual reservado. Use override apenas para debug.

## 6. Modelos de IA

Os modelos não devem ir para o Git. Existem duas opções.

Opção A: copiar modelos da máquina antiga:

```bash
mkdir -p /home/Drac/infra/ai-models
rsync -a antigo:/home/flashnet/Drac/infra/ai-models/ /home/Drac/infra/ai-models/
```

Opção B: gerar/baixar modelos na VM nova:

```bash
cd /home/Drac/services/ai-service-python
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
pip install ultralytics
AI_MODELS_DIR=/home/Drac/infra/ai-models python download_models.py
deactivate
```

O modo geral atual usa `yolo26n` com `OpenVINO CPU` e precisão `int8`, conforme `services/ai-service-python/runtime_profiles.py`.

## 7. Subir infraestrutura

```bash
cd /home/Drac
docker compose -f infra/docker-compose.yml up -d --build
```

Verificar containers:

```bash
docker ps
docker compose -f infra/docker-compose.yml logs --tail=80 api
docker compose -f infra/docker-compose.yml logs --tail=80 ai-service
docker compose -f infra/docker-compose.yml logs --tail=80 web
```

## 8. Banco de dados

Para uma instalação limpa, aplicar migrações:

```bash
cd /home/Drac
docker compose -f infra/docker-compose.yml exec -w /app/apps/api api npx prisma migrate deploy
```

Criar ou atualizar o super admin inicial:

```bash
docker compose -f infra/docker-compose.yml exec \
  -w /app/apps/api \
  -e ADMIN_EMAIL=admin@local.dev \
  -e ADMIN_PASSWORD='troque_por_senha_forte_com_10_ou_mais_caracteres' \
  -e ADMIN_NAME='Administrador' \
  api npx prisma db seed
```

Se for migrar dados reais da máquina antiga, gerar dump no servidor antigo:

```bash
cd /home/flashnet/Drac
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" vms-postgres \
  pg_dump -U vms -d vms_db -Fc -f /tmp/drac-migration.dump
docker cp vms-postgres:/tmp/drac-migration.dump /home/flashnet/drac-migration.dump
```

Copiar para a VM nova:

```bash
scp antigo:/home/flashnet/drac-migration.dump /home/Drac/
```

Restaurar na VM nova antes de usar em produção:

```bash
cd /home/Drac
docker cp /home/Drac/drac-migration.dump vms-postgres:/tmp/drac-migration.dump
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" vms-postgres \
  pg_restore -U vms -d vms_db --clean --if-exists /tmp/drac-migration.dump
docker compose -f infra/docker-compose.yml restart api
```

Se o usuário/senha/banco forem diferentes de `vms` e `vms_db`, usar os valores reais definidos em `infra/.env`.

## 9. Storage e gravações

O storage fica em:

```text
/home/Drac/infra/storage
```

Para migrar gravações antigas:

```bash
rsync -a antigo:/home/flashnet/Drac/infra/storage/ /home/Drac/infra/storage/
```

Validar permissões:

```bash
mkdir -p /home/Drac/infra/storage
chmod -R u+rwX,g+rwX /home/Drac/infra/storage
```

Se a VM usar disco separado, montar o volume no host e apontar `/home/Drac/infra/storage` para esse disco antes de iniciar gravações.

## 10. Portas e firewall

Liberar no firewall da VM, se ativo:

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 5173/tcp
sudo ufw allow 3002/tcp
sudo ufw allow 8554/tcp
sudo ufw allow 8888/tcp
sudo ufw allow 8889/tcp
sudo ufw allow 8189/udp
```

Portas internas/locais:

- PostgreSQL exposto apenas em `127.0.0.1:5432`.
- Redis exposto apenas em `127.0.0.1:6379`.
- API MediaMTX exposta apenas em `127.0.0.1:9997` e `127.0.0.1:9998`.

## 11. Validação pós-instalação

Health da API:

```bash
curl -i http://168.194.13.70:3000/health
```

Frontend:

```bash
curl -I http://168.194.13.70:5173/live
curl -I http://168.194.13.70:5173/dashboard
```

Resultado esperado:

- `/live` retorna HTML do frontend.
- `/dashboard` redireciona para `/live`.

Verificar IA:

```bash
docker compose -f infra/docker-compose.yml logs --tail=120 ai-service
docker compose -f infra/docker-compose.yml exec ai-service python - <<'PY'
from runtime_profiles import GENERAL_PROFILE
print(GENERAL_PROFILE)
PY
```

Conferir containers:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

## 12. Operação diária

Subir:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Parar:

```bash
docker compose -f infra/docker-compose.yml down
```

Rebuild após atualização via Git:

```bash
cd /home/Drac
git pull
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml exec -w /app/apps/api api npx prisma migrate deploy
```

Logs:

```bash
docker compose -f infra/docker-compose.yml logs -f api
docker compose -f infra/docker-compose.yml logs -f web
docker compose -f infra/docker-compose.yml logs -f ai-service
docker compose -f infra/docker-compose.yml logs -f mediamtx
```

## 13. Checklist de migração

Antes da troca definitiva:

- Confirmar IP fixo `168.194.13.70` na VM nova.
- Confirmar `infra/.env` com segredos fortes e CORS correto.
- Confirmar `infra/ai-models` presente ou modelos gerados.
- Restaurar banco ou executar migrações e seed.
- Migrar `infra/storage` se for necessário manter gravações.
- Subir todos os containers.
- Validar login no frontend.
- Validar câmeras, live, gravação, playback e IA.
- Validar CPU em `/storage` e health da IA.
- Manter a VM antiga desligada ou fora da rede para evitar conflito de IP.

## 14. Problemas comuns

Frontend antigo ainda aparecendo:

```bash
docker compose -f infra/docker-compose.yml up -d --build web
```

Depois limpar cache do navegador com `Ctrl+F5`.

Erro de CORS:

- Ajustar `CORS_ALLOWED_ORIGINS` em `infra/.env`.
- Recriar API: `docker compose -f infra/docker-compose.yml up -d --build api`.

IA não carrega modelo:

- Verificar `infra/ai-models`.
- Verificar logs do `ai-service`.
- Confirmar que `AI_MODELS_DIR=/app/models` está no container.
- Copiar ou gerar `yolo26n_int8_openvino_model`.

Banco sem tabelas:

```bash
docker compose -f infra/docker-compose.yml exec -w /app/apps/api api npx prisma migrate deploy
```

Sem usuário admin:

```bash
docker compose -f infra/docker-compose.yml exec \
  -w /app/apps/api \
  -e ADMIN_EMAIL=admin@local.dev \
  -e ADMIN_PASSWORD='senha_forte_aqui' \
  -e ADMIN_NAME='Administrador' \
  api npx prisma db seed
```

Conflito de IP:

- Nunca deixar a máquina antiga e a VM nova ativas simultaneamente com o mesmo IP.
- Validar ARP/gateway após a troca.
