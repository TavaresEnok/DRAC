# DRAC VMS - Instalador automatico

O objetivo do instalador e evitar o fluxo manual de clonar repositorio, editar `.env`, instalar Docker, subir Compose e configurar a central.

O tecnico deve executar um unico script no servidor do cliente. O script:

- instala Git, Docker e Docker Compose plugin;
- cria/usa o usuario operacional `flashnet`;
- clona ou atualiza o projeto em `/home/flashnet/Drac`;
- gera senhas e segredos fortes;
- configura `infra/.env`;
- conecta a instalacao com a DRAC Central;
- sobe os containers;
- aplica migrations Prisma;
- valida API local e central;
- executa o checklist automatico de producao.

## Comando interativo

No servidor novo do cliente:

```bash
curl -fsSL https://raw.githubusercontent.com/TavaresEnok/DRAC/main/scripts/install-drac.sh | bash
```

O instalador perguntara:

- nome do cliente;
- codigo da instalacao;
- chave/licenca do cliente;
- IP ou dominio do servidor local;
- URL da DRAC Central.

## Gerar pela DRAC Central

Na central, acesse:

```text
Instalação
```

Preencha:

- nome do cliente;
- codigo da instalacao;
- IP ou dominio do servidor do cliente;
- chave do cliente.

Depois clique em `Copiar comando` e execute no servidor Linux do cliente.

Esse e o fluxo recomendado. A chave do cliente e gerada pela central, a instalacao fica pre-cadastrada como `Aguardando instalação` e o primeiro heartbeat ativa o cliente no painel.

## Comando pronto por cliente

Para facilitar ainda mais, gere um comando ja preenchido:

```bash
DRAC_CUSTOMER_NAME='Cliente Exemplo' \
DRAC_INSTALLATION_ID='cliente-exemplo-001' \
DRAC_LICENSE_KEY='drac-chave-gerada-pela-central' \
DRAC_SERVER_IP='192.168.1.10' \
DRAC_CENTRAL_URL='http://168.194.13.70:9765' \
DRAC_AUTO_YES=true \
bash scripts/install-drac.sh
```

Para executar remotamente via `curl`:

```bash
curl -fsSL https://raw.githubusercontent.com/TavaresEnok/DRAC/main/scripts/install-drac.sh | \
DRAC_CUSTOMER_NAME='Cliente Exemplo' \
DRAC_INSTALLATION_ID='cliente-exemplo-001' \
DRAC_LICENSE_KEY='drac-chave-gerada-pela-central' \
DRAC_SERVER_IP='192.168.1.10' \
DRAC_CENTRAL_URL='http://168.194.13.70:9765' \
DRAC_AUTO_YES=true \
bash
```

## Variaveis suportadas

| Variavel | Padrao | Uso |
| --- | --- | --- |
| `DRAC_REPO_URL` | `git@github.com:TavaresEnok/DRAC.git` | Repositorio do DRAC. |
| `DRAC_BRANCH` | `main` | Branch instalada. |
| `DRAC_INSTALL_DIR` | `/home/flashnet/Drac` | Pasta de instalacao. |
| `DRAC_OPERATING_USER` | `flashnet` | Usuario operacional. |
| `DRAC_CENTRAL_URL` | `http://168.194.13.70:9765` | URL da central. |
| `DRAC_CUSTOMER_NAME` | interativo | Nome do cliente na central. |
| `DRAC_INSTALLATION_ID` | slug do cliente/host | ID unico da instalacao. |
| `DRAC_LICENSE_KEY` | gerada automaticamente | Chave unica do cliente. |
| `DRAC_SERVER_IP` | IP detectado | IP/dominio usado pelo painel local. |
| `DRAC_ENVIRONMENT` | `prod` | `prod` ou `dev`. |
| `DRAC_AUTO_YES` | `false` | `true` para nao perguntar nada. |

## Conexao com a central

O instalador preenche automaticamente no `infra/.env`:

```env
CLOUD_CONNECTOR_ENABLED=true
CLOUD_API_URL=http://168.194.13.70:9765
CLOUD_INSTALLATION_ID=cliente-exemplo-001
CLOUD_LICENSE_KEY=drac-chave-forte-unica
CLOUD_CUSTOMER_NAME=Cliente Exemplo
CLOUD_HEARTBEAT_INTERVAL_SECONDS=60
```

Depois que a API local sobe, ela envia heartbeat para:

```text
POST /api/agent/heartbeat
```

A central cadastra a instalacao automaticamente no primeiro heartbeat. Nao e necessario abrir porta no cliente para a central entrar; a conexao sai do servidor do cliente para a central.

## Preflight Comercial

Antes de clonar ou subir containers, o instalador valida:

- usuario operacional diferente de `root`;
- diretorio fora de `/root`;
- `sudo` quando necessario;
- `curl`;
- resolucao DNS para GitHub e Central;
- acesso ao GitHub raw e `/api/health` da Central;
- portas principais em uso;
- memoria disponivel;
- espaco livre no diretorio de instalacao.

Avisos nao bloqueiam quando ainda podem ser resolvidos depois, como Central temporariamente inacessivel ou porta ocupada por instalacao DRAC existente. Bloqueios param a instalacao quando continuar poderia deixar o servidor em estado ruim.

O instalador tambem grava automaticamente:

```env
PUBLIC_APP_URL=http://IP_DO_SERVIDOR:5173
API_PUBLIC_URL=http://IP_DO_SERVIDOR:3000
MEDIAMTX_PUBLIC_HOST=IP_DO_SERVIDOR
MEDIAMTX_PUBLIC_SCHEME=http
```

Em producao com dominio HTTPS, ajuste essas variaveis para o dominio real e restrinja `MEDIAMTX_HLS_ALLOW_ORIGIN` e `MEDIAMTX_WEBRTC_ALLOW_ORIGIN`.

## Validacao esperada

Ao final, o instalador mostra:

- URL do painel local;
- URL da API local;
- central configurada;
- ID da instalacao enviada.
- resultado do checklist automatico de producao.

Na DRAC Central, a instalacao deve aparecer em ate 60 segundos com:

- cliente;
- status conectado;
- cameras;
- disco;
- alarmes;
- contrato `Regular`.

## Checklist automatico de producao

O instalador executa:

```bash
./scripts/production-readiness.sh
```

O script retorna:

- `Pronto`: todos os checks obrigatorios passaram.
- `Atencao`: sistema opera, mas existe pendencia nao critica.
- `Bloqueado`: existe falha critica que impede considerar producao pronta.

Por seguranca, o instalador nao liga gravacao continua automaticamente em todos os boots. A ativacao de gravacao continua deve ocorrer depois que o storage estiver dimensionado para quantidade de cameras, bitrate e retencao desejada. A guarda de disco das gravacoes fica habilitada por padrao para interromper processos antes de afetar banco, Redis ou API.

Tambem e possivel rodar manualmente:

```bash
cd /home/flashnet/Drac
./scripts/production-readiness.sh
```

Saida em JSON:

```bash
./scripts/production-readiness.sh --json
```

## Observacoes importantes

- O script foi pensado para Ubuntu/Debian.
- Em repositorio privado, o servidor precisa ter acesso ao GitHub via chave SSH ou `DRAC_REPO_URL` alternativo.
- O arquivo `infra/.env` recebe backup automatico se ja existir.
- Senhas reais geradas pelo instalador nao devem ser versionadas.
