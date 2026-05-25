# Drac - Analise de prontidao para lancamento

Data: 2026-05-21

## Resumo executivo

O Drac ja possui a base essencial de um VMS/NVR moderno: login, controle por grupos/permissoes, dashboard, live, cameras, playback, download, PTZ, relay/alarme quando suportado, gravacao manual/movimento, armazenamento/monitoramento, app Android e pipeline MediaMTX/FFmpeg.

O sistema esta em estado avancado para piloto/uso controlado, mas ainda nao deve ser tratado como produto 100% final para escala grande sem os testes de carga prolongados, hardening operacional externo e refinamentos de timeline/eventos listados abaixo.

## O que foi validado nesta revisao

- API NestJS com rotas protegidas por JWT e guards de role.
- Filtro de cameras por grupo/permissao em `/cameras` para usuarios nao administradores.
- Capabilities por camera: `canView`, `canControl`, `canRecord`, `canAdmin`.
- Live web com escolha inteligente de protocolo por codec: WebRTC/HLS/FLV.
- MediaMTX com paths aquecidos para reduzir tempo de abertura das cameras.
- Poster inicial do live protegido por stream token.
- Poster agora prioriza o RTSP interno do MediaMTX antes de cair para RTSP direto da camera.
- App Android consumindo a API real, respeitando cameras retornadas por grupo/permissao.
- Playback com lista do dia, abrir e baixar gravacoes.
- PTZ e relay condicionados a permissao/suporte real.
- Build de API, web e mobile typecheck executados com sucesso.
- Build release do APK Android executado com sucesso.
- Web/API reconstruidos e publicados via Docker Compose.
- MediaMTX validado com 3 paths prontos, HLS muxers ativos e 0 frames inbound em erro.
- Teste simples de carga com 3 cameras executado: 18/18 requisicoes OK para HLS/poster.

## Ajustes finais aplicados nesta rodada

- Bundle web dividido em chunks dedicados para core, HLS, MPEG-TS, graficos, UI e icones.
- Poster do live passou a priorizar o RTSP interno do MediaMTX antes do RTSP direto da camera.
- App Android recebeu UI mais proxima de produto: cards com poster real, visual mobile escuro, tabs, grid e fluxo de live/playback mais polidos.
- HLS do MediaMTX ficou com `hlsAlwaysRemux: true` para evitar cold start de playlist no primeiro acesso.
- HLS do MediaMTX ficou em variante `fmp4`, deixando o fallback mais estavel que Low-Latency HLS para o uso atual.
- Corrigida comparacao de duracao do path MediaMTX (`5m` versus `5m0s`) para impedir recriacao indevida de paths.
- Validado que chamadas para `/camera-stream/:id/urls` nao geram mais `reloading configuration` no MediaMTX quando o path ja esta correto.

## Resultado dos testes rapidos de producao

- API health: OK.
- Web em `:3002`: HTTP 200.
- APK em `:8090/app-release.apk`: HTTP 200, `application/vnd.android.package-archive`, 57 MB.
- Login API: HTTP 201 com token emitido.
- `/cameras`: 3 cameras retornadas para o usuario admin de teste.
- URLs por camera: HLS, WebRTC e poster presentes nas 3 cameras.
- Posters: HTTP 200 e JPEG nas 3 cameras.
- HLS/poster concorrente apos correcao de path: 18/18 OK.
- HLS P50/P95 no teste rapido: 13 ms / 33 ms.
- Poster P50/P95 no teste rapido: 29 ms / 1287 ms, com cache ficando abaixo de 30 ms depois do primeiro frame.
- Recursos apos teste: API cerca de 104 MB, Web cerca de 12 MB, MediaMTX cerca de 60 MB, Postgres cerca de 91 MB, Redis cerca de 12 MB.

## Pontos fortes atuais

- Separacao interna por grupo sem transformar o sistema em multi-tenant complexo.
- Backend centraliza as permissoes; web e app apenas refletem o que a API permite.
- MediaMTX reduz conexoes diretas nas cameras e melhora tempo de abertura.
- UI web ja esta mais enxuta que a versao inicial.
- App Android saiu do aspecto MVP e passou a usar tema/estrutura de produto mobile.
- Docker compose ja sobe os servicos principais e web/API respondem apos reboot.

## Itens que ainda faltam para chamar de 100% final

1. Teste de carga prolongado com muitas cameras reais simultaneas.
2. Teste de estabilidade 24h/72h medindo CPU, RAM, disco, MediaMTX, FFmpeg e gravacoes.
3. Monitoramento externo com alerta de containers, disco, CPU, memoria, perda de stream e espaco de gravacao.
4. Backup externo do banco e arquivos de configuracao.
5. Timeline de playback mais madura, com zoom, eventos e reproducao multicamera sincronizada.
6. Busca avancada por eventos e filtros operacionais mais completos.
7. Descoberta automatica ONVIF na rede.
8. Configuracao ONVIF mais completa por fabricante.
9. Zonas de movimento desenhadas pela interface.
10. Mascara de privacidade.
11. Push notification mobile.
12. Exportacao de evidencia com player/verificador embutido.
13. Testes automatizados de permissoes por grupo, PTZ, gravacao e playback.
14. Assinatura/release final do APK com keystore de producao e distribuicao controlada.
15. Revisao final de segredos e rotacao de senhas/tokens antes do lancamento publico.

## Notas por caracteristica

| Caracteristica | Nota | Comentario |
| --- | ---: | --- |
| Arquitetura geral | 8.0/10 | Boa separacao API/web/mobile/infra; ainda falta observabilidade externa madura. |
| Seguranca de acesso | 8.2/10 | JWT, roles e permissoes por grupo/camera; faltam testes automatizados extensivos e rotacao formal de segredos. |
| Permissoes por grupo | 8.5/10 | Implementacao simples e funcional; app e web herdam o filtro da API. |
| Live web | 8.4/10 | MediaMTX aquecido, fallback por codec e poster inicial; falta teste prolongado com muitas cameras. |
| Playback | 7.2/10 | Funcional com abrir/download; timeline ainda precisa ficar nivel NVR profissional. |
| Gravacao | 8.0/10 | Manual/movimento e MP4 compativel; falta validacao longa de retencao/gaps em escala. |
| PTZ | 7.8/10 | Funcionando em cameras testadas; perfis por fabricante ainda podem evoluir. |
| Relay/alarme | 6.8/10 | Condicionado a suporte real; precisa matriz por fabricante/modelo e tratamento melhor de falhas. |
| App Android | 7.6/10 | Agora tem visual e fluxo mais proximo de produto; falta push, instalador assinado e testes reais em varios aparelhos. |
| UI/UX web | 7.8/10 | Bem mais limpa; ainda ha paginas administrativas que podem ser lapidadas. |
| Performance frontend | 8.0/10 | Chunk principal reduzido; libs pesadas separadas e lazy. HLS permanece grande, mas isolado. |
| Infra Docker/reboot | 8.0/10 | Containers e servicos sobem; falta monitoramento externo e politicas de backup fora do host. |
| Observabilidade | 6.5/10 | Logs e monitoramento local existem; falta alerta operacional robusto. |
| Prontidao para piloto | 8.2/10 | Adequado para ambiente controlado. |
| Prontidao para lancamento amplo | 7.2/10 | Precisa carga prolongada, backup externo, monitoramento e polish de timeline/app. |

## Nota geral

Nota geral atual: 7.8/10.

Minha avaliacao: o sistema esta pronto para piloto serio e operacao controlada, mas eu ainda nao chamaria de 100% final para venda ampla sem pelo menos uma bateria de estabilidade 24h/72h, backup externo e monitoramento/alertas fora do proprio sistema.

## Proximo bloco recomendado

- Rodar teste 24h com todas as cameras gravando e exibindo live periodicamente.
- Adicionar push notification mobile.
- Evoluir timeline de playback para padrao NVR profissional.
- Criar testes automatizados de permissao por grupo/camera.
- Fechar checklist de segredos, backup externo e plano de restore.
