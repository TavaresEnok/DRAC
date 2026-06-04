# DRAC VMS - Instalacao Limpa

Este roteiro descreve uma instalacao do zero em uma VM Linux nova. Para migracao com backup de ambiente antigo, use tambem `docs/migracao-nova-vm.md`.

## Instalacao rapida recomendada

Para um novo cliente, prefira o instalador automatico:

```bash
curl -fsSL https://raw.githubusercontent.com/TavaresEnok/DRAC/main/scripts/install-drac.sh | bash
```

Ou use o modo silencioso com os dados do cliente:

```bash
curl -fsSL https://raw.githubusercontent.com/TavaresEnok/DRAC/main/scripts/install-drac.sh | \
DRAC_CUSTOMER_NAME='Cliente Exemplo' \
DRAC_INSTALLATION_ID='cliente-exemplo-001' \
DRAC_LICENSE_KEY='drac-chave-forte-unica' \
DRAC_SERVER_IP='192.168.1.10' \
DRAC_CENTRAL_URL='http://168.194.13.70:9765' \
DRAC_AUTO_YES=true \
bash
```

Detalhes em `docs/instalador-automatico.md`.

O restante deste documento descreve a instalacao manual.

## 1. Dependencias do Host

Instale Git, Docker e o plugin Docker Compose:

```bash
sudo apt-get update
sudo apt-get install -y git ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Entre novamente na sessao do usuario para aplicar o grupo `docker`.

## 2. Clonar Projeto

```bash
cd /home/flashnet
git clone git@github.com:TavaresEnok/DRAC.git Drac
cd /home/flashnet/Drac
git checkout main
```

Se a VM usar outro usuario operacional, ajuste `/home/flashnet/Drac` para o caminho real do projeto.

## 3. Preparar Ambiente

Para producao:

```bash
cp infra/.env.prod.example infra/.env
chmod 600 infra/.env
nano infra/.env
```

Para desenvolvimento/operação local:

```bash
cp infra/.env.dev.example infra/.env
chmod 600 infra/.env
nano infra/.env
```

Edite obrigatoriamente:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `CAMERA_SECRET_KEY`
- `INTERNAL_SERVICE_TOKEN`
- `EVIDENCE_HMAC_SECRET`
- `MEDIAMTX_API_USER`
- `MEDIAMTX_API_PASS`
- `CORS_ALLOWED_ORIGINS`
- `MEDIAMTX_WEBRTC_ADDITIONAL_HOST`
- `MEDIAMTX_HLS_ALLOW_ORIGIN`
- `MEDIAMTX_WEBRTC_ALLOW_ORIGIN`

## 4. Subir Containers

Producao:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d --build
```

Desenvolvimento/operação local:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d --build
```

## 5. Banco e Migrations

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.prod.yml exec -w /app/apps/api api npx prisma migrate deploy
```

Se o ambiente foi iniciado com `infra/docker-compose.dev.yml`, use o mesmo override no comando acima.

Se existir rotina de seed/admin no ambiente, rode conforme o script vigente do projeto. Caso contrario, crie ou valide o administrador pela API ou pelo fluxo operacional documentado no ambiente.

## 6. Validacao Basica

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:3000/health
curl -I http://127.0.0.1:5173/
docker logs --tail=120 vms-api
docker logs --tail=120 vms-mediamtx
docker logs --tail=120 vms-ai-service
```

Em producao com reverse proxy:

```bash
curl -I https://drac.example.com/
curl -fsS https://drac.example.com/api/health
```

## 7. Validacao WebRTC

1. Acesse `/live`.
2. Abra uma camera.
3. Confirme que o endpoint `/camera-stream/:cameraId/urls` retorna URL WebRTC/WHEP.
4. Confirme video no navegador.
5. Se houver audio habilitado, confirme recepcao no navegador.
6. Verifique CPU de `vms-mediamtx` e processos `ffmpeg`.

## 8. Cameras

Ao cadastrar camera, o usuario deve informar apenas dados operacionais:

- IP/host.
- Porta RTSP.
- Porta ONVIF.
- Usuario.
- Senha.
- Canal.
- Canal remoto quando aplicavel.
- Protocolo/transporte quando necessario.

O sistema deve detectar internamente caminhos RTSP, caminho ONVIF, tokens ONVIF e perfis de live/gravacao/analytics sempre que possivel.

## 9. IA

Modelos ficam em:

```text
infra/ai-models
```

Valide:

```bash
docker logs --tail=120 vms-ai-service
curl -fsS http://127.0.0.1:3000/health
```

A arquitetura baseline e:

- Gravacao: main stream H.265 direto.
- Live: main stream em alta qualidade, com transcode para H.264/WebRTC quando necessario.
- IA: RTSP direto da camera pelo `analyticsSubtype`, sem depender da live/MediaMTX.

## 10. Retencao e Backup

Confirme:

```bash
ls -lh infra/backups/postgres
du -sh infra/storage
```

## Comandos Operacionais Separados

Instalacao limpa:

```bash
curl -fsSL URL_GERADA_PELA_CENTRAL | bash
```

Atualizacao:

```bash
cd /home/flashnet/Drac
./scripts/update-drac.sh
```

Diagnostico:

```bash
cd /home/flashnet/Drac
./scripts/collect-diagnostics.sh
./scripts/production-readiness.sh
./scripts/prod-regression.sh
```

Restore:

```bash
cd /home/flashnet/Drac
DRAC_RESTORE_YES=true ./scripts/restore-drac.sh dump.dump storage.tar.gz
```

Depois da instalacao, a Central deve mostrar o cliente automaticamente apos o primeiro heartbeat. Se isso nao acontecer em ate 60 segundos, valide `CLOUD_API_URL`, `CLOUD_INSTALLATION_ID`, `CLOUD_LICENSE_KEY` e rede de saida do servidor.

Teste retencao com uma camera de homologacao antes de aplicar a politica definitiva em producao.

## 11. Encerramento Seguro

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.dev.yml down
```

Em producao, troque o override para `infra/docker-compose.prod.yml` quando o ambiente tiver sido iniciado com ele.
