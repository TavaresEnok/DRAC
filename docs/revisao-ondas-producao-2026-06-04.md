# Revisao Das Ondas De Producao - 2026-06-04

Este documento registra a revisao final das ondas executadas para deixar o DRAC VMS mais perto de operacao comercial limpa, automatizada e sustentavel.

## Estado Geral

Status: ondas 1 a 6 concluidas no codigo.

IA: mantida desativada no momento, conforme decisao operacional atual.

Gravacao continua: nao obrigatoria por padrao. O administrador pode alternar entre gravacao continua e gravacao por movimento nas configuracoes da camera.

## Revisao Por Onda

| Onda | Status | Entrega principal | Commits relacionados |
| --- | --- | --- | --- |
| 1 | Concluida | Cadastro de cameras mais automatico, com menos campos tecnicos para o usuario final e descoberta ONVIF de perfis. | `cdd0d8b`, `ed3b059` |
| 2 | Concluida | Separacao mais clara entre gravacao, live e analytics; resumo tecnico do pipeline por camera. | `e12e700` |
| 3 | Concluida | Inicializacao de live/WebRTC mais estavel, menos tentativas concorrentes e melhor diagnostico de falha. | `b449d70` |
| 4 | Concluida | Playback/reproducao com validacao de saude, caminho compativel e mensagens mais claras. | `cad2d9e` |
| 5 | Concluida | Central com resumo de frota, estado operacional das instalacoes e instalador com preflight. | `4d44321` |
| 6 | Concluida | UX final: textos em portugues, menos elementos "em breve", mobile/web mais coerentes e linguagem de produto. | commit de fechamento desta revisao |

## Onda 1 - Camera E Onboarding

- Campos tecnicos como caminho RTSP/ONVIF e token de perfil sairam do fluxo principal.
- O sistema passou a preferir descoberta automatica de perfis ONVIF.
- Cadastro fica mais proximo de NVR comercial: endereco, portas, usuario, senha, canal e escolhas operacionais simples.
- Perfis tecnicos continuam existindo internamente para compatibilidade e diagnostico.

## Onda 2 - Pipelines De Stream

- Gravacao, live e analytics passaram a ser tratados como fontes separadas.
- A camera pode manter live em qualidade alta sem forcar a IA a consumir o mesmo stream pesado.
- O status tecnico exposto ajuda a confirmar subtype de gravacao, live e analytics.
- A arquitetura base ficou alinhada ao modelo:
  - gravacao: main stream;
  - live: stream do cliente;
  - analytics: fonte leve e direta.

## Onda 3 - Live E WebRTC

- O player evita iniciar protocolos de forma desordenada.
- A selecao de protocolo ficou mais previsivel.
- Fluxo de reconexao ganhou mensagens menos confusas.
- O comportamento foi ajustado para reduzir tela piscando e falhas repetidas de startup.

## Onda 4 - Reproducao

- Playback foi revisado como "Reproducao" na camada visual.
- Fluxos de URL, fallback e exportacao ficaram mais claros.
- Mensagens de erro foram alinhadas para operador final.
- O caminho compativel continua disponivel para arquivos que nao tocam direto.

## Onda 5 - Central E Instalador

- Central ganhou endpoint `GET /api/admin/summary`.
- Painel central passou a usar totais reais de instalacoes, cameras, alertas e armazenamento.
- Instalador rapido ganhou preflight:
  - bloqueia instalacao como root operacional;
  - bloqueia diretorio `/root`;
  - valida `sudo` quando necessario;
  - valida `curl`;
  - avisa sobre portas ocupadas.
- A Central foi validada com uma instalacao online registrada.

## Onda 6 - UX Tela A Tela

- Web e mobile tiveram textos visiveis revisados para linguagem final em portugues.
- "Playback", "bookmark", "clip" e "storage" foram reduzidos nas telas finais quando apareciam para operador.
- Mobile removeu acoes desabilitadas de "em breve" que davam cara de prototipo.
- Login mobile foi padronizado como DRAC.
- Abas, alertas e mensagens ficaram mais proximas de produto operacional.

## Validacoes Executadas

- `corepack pnpm --filter web build`
- `corepack pnpm --filter mobile typecheck`
- `node --check apps/central/src/server.js`
- `bash -n scripts/install-drac.sh`
- `corepack pnpm verify`
- `./scripts/production-readiness.sh`

Resultado do readiness em 2026-06-04:

- checks: 56;
- atencoes: 0;
- bloqueios: 0;
- API, web, banco, Redis, MediaMTX, backup, Central e containers saudaveis;
- 9/9 cameras online;
- todas as cameras em WebRTC para live;
- todas as cameras com live configurada em 1280x720;
- IA desativada e dispensada pelo perfil atual;
- Central com licenca `ACTIVE` e heartbeat recente.

## Revisao De Prontidao

Itens conferidos como parte desta revisao:

- Cadastro de camera menos tecnico.
- Live/WebRTC com fluxo mais previsivel.
- Reproducao com mensagens e fallback mais claros.
- Central com visao de frota.
- Instalador rapido com preflight.
- UX sem textos obvios de prototipo nas telas tocadas.
- IA mantida desligada por decisao atual.
- Gravacao continua mantida como escolha administrativa, nao requisito obrigatorio.

## Pendencias Sem Dependencia De Codigo Imediato

- Teste prolongado de campo com cameras reais e rede real.
- Validacao de dominio publico com HTTPS e WebRTC fora da rede local.
- Ajuste fino de bitrate, codec e substream por modelo de camera quando houver variacao de fabricante.
- Evolucao futura da IA quando ela voltar a ser prioridade operacional.
