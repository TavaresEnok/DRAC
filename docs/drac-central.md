# DRAC Central

O DRAC Central e o painel externo para acompanhar varias instalacoes DRAC VMS em clientes diferentes.

Ele fica separado do VMS local. A instalacao local continua responsavel por cameras, gravacao, live, IA e usuarios. O conector cloud apenas envia heartbeat e metricas operacionais para a central.

## O que existe agora

- Painel central MVP em `/home/flashnet/drac-central`.
- API central para receber heartbeat: `POST /api/agent/heartbeat`.
- API central admin para listar instalacoes: `GET /api/admin/installations`.
- API central admin para provisionar cliente: `POST /api/admin/provision`.
- API central admin para alterar status comercial/licenca: `PATCH /api/admin/installations/:id/license`.
- API central admin para auditoria: `GET /api/admin/audit`.
- Conector no DRAC local em `apps/api/src/cloud-connector`.
- Endpoint local admin: `GET /cloud-connector/status`.
- Endpoint local admin para forcar envio: `POST /cloud-connector/heartbeat`.

## Configuracao da central

Copie o exemplo:

```bash
cd /home/flashnet/drac-central
cp .env.example .env
nano .env
```

Variaveis principais:

```bash
DRAC_CENTRAL_HOST=0.0.0.0
DRAC_CENTRAL_PORT=9765
DRAC_CENTRAL_ADMIN_EMAIL=admin@drac.local
DRAC_CENTRAL_ADMIN_PASSWORD_HASH=pbkdf2_sha256$...
DRAC_CENTRAL_SESSION_HOURS=8
DRAC_CENTRAL_ALLOWED_ORIGINS=https://central.seudominio.com.br
DRAC_CENTRAL_COOKIE_SECURE=true
DRAC_CENTRAL_ADMIN_TOKEN=
DRAC_CENTRAL_DATA_FILE=/home/flashnet/drac-central/data/installations.json
```

Gere o hash da senha:

```bash
cd /home/flashnet/drac-central
npm run hash-password -- 'SENHA_FORTE_AQUI'
```

Iniciar:

```bash
node src/server.js
```

## Configuracao em cada DRAC local

### Instalacao automatica recomendada

No painel central, use a aba `Instalação` para gerar um comando oficial por cliente.

A central cria a instalacao antes do servidor do cliente existir no painel:

1. informe nome do cliente;
2. informe codigo da instalacao;
3. informe IP/dominio do servidor do cliente;
4. clique em `Gerar instalação oficial`;
5. copie o comando gerado;
6. execute no servidor Linux do cliente.

Enquanto o servidor nao enviar heartbeat, a instalacao aparece como `Aguardando instalação`. Se foi criada por engano, pode ser cancelada antes do primeiro heartbeat.

No servidor do cliente, execute o instalador com os dados da central:

```bash
curl -fsSL https://raw.githubusercontent.com/TavaresEnok/DRAC/main/scripts/install-drac.sh | \
DRAC_CUSTOMER_NAME='Nome do Cliente' \
DRAC_INSTALLATION_ID='cliente-001' \
DRAC_LICENSE_KEY='chave-gerada-pela-central' \
DRAC_SERVER_IP='IP_OU_DOMINIO_DO_CLIENTE' \
DRAC_CENTRAL_URL='http://168.194.13.70:9765' \
DRAC_AUTO_YES=true \
bash
```

O instalador configura o conector cloud, sobe o DRAC local e envia o primeiro heartbeat imediatamente. Antes de concluir, ele consulta `/api/agent/status` com a identidade da instalação para confirmar que o cliente já aparece na Central.

### Configuracao manual

No `infra/.env` da instalacao do cliente:

```bash
CLOUD_CONNECTOR_ENABLED=true
CLOUD_API_URL=http://IP_OU_DOMINIO_DA_CENTRAL:9765
CLOUD_INSTALLATION_ID=cliente-001
CLOUD_LICENSE_KEY=chave-gerada-para-o-cliente
CLOUD_CUSTOMER_NAME=Nome do Cliente
CLOUD_HEARTBEAT_INTERVAL_SECONDS=60
DRAC_VERSION=local
```

Depois reinicie a API:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d api
```

## Dados enviados

O heartbeat envia:

- identificacao da instalacao;
- nome do cliente;
- versao;
- hostname e sistema operacional;
- CPU, memoria, uptime e load average;
- uso de disco do storage de gravacoes;
- total de cameras, online, offline e erro;
- quantidade de alarmes abertos;
- quantidade e tamanho total de gravacoes;
- ultimo inicio de gravacao;
- alertas simples de disco alto e cameras indisponiveis.

Segredos como senha de camera, JWT, banco e `.env` real nao sao enviados.

## Status comerciais

A central pode retornar:

- `ACTIVE`: instalacao normal;
- `GRACE`: periodo de tolerancia, sem corte operacional;
- `RESTRICTED`: modo restrito comercial, sem corte de live/gravacao;
- `SUSPENDED`: suspenso comercialmente, com bloqueio de recursos operacionais definidos.

A central mostra quando uma politica foi alterada mas ainda nao foi recebida pela instalacao local. A aplicacao real ocorre no proximo heartbeat do cliente.

Politica aplicada pelo DRAC local:

| Recurso | ACTIVE | GRACE | RESTRICTED | SUSPENDED |
| --- | --- | --- | --- | --- |
| Live local | sim | sim | sim | nao |
| Gravacao local | sim | sim | sim | nao |
| Playback local | sim | sim | sim | sim |
| Cadastro de cameras | sim | sim | nao | nao |
| IA avancada | sim | sim | nao | nao |
| Exportacoes | sim | sim | sim | sim |
| Acesso admin | sim | sim | sim | sim |

Quando `localRecording=false`, o conector para gravacoes ativas e impede novas partidas. Quando `aiAdvanced=false`, o conector para a IA ativa e impede novos starts.

Quando `localLive=false`, a API responde `423 Locked` em `GET /camera-stream/:cameraId/urls`. O frontend mostra mensagem generica ao operador:

> Transmissao temporariamente indisponivel. Entre em contato com o administrador do sistema.

Isso e intencional: um VMS/NVR e um sistema sensivel. Qualquer bloqueio comercial deve preservar seguranca operacional, evidencias e acesso minimo de emergencia.

## Proximos passos recomendados

- Colocar a central atras de HTTPS.
- Manter `DRAC_CENTRAL_ADMIN_TOKEN` vazio, exceto se houver automacao interna.
- Definir `DRAC_CENTRAL_ALLOWED_ORIGINS` com o dominio HTTPS real.
- Fazer backup do arquivo `DRAC_CENTRAL_DATA_FILE`.
- Criar cadastro formal de clientes/licencas no painel central.
- Criar agente como servico Docker separado.
- Expandir logs estruturados, auditoria e historico de heartbeats.
- Definir politica segura de restricao comercial sem interromper gravacao critica de forma abrupta.
