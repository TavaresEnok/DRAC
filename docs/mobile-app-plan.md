# DRAC Mobile App Plan

## Objetivo

Criar um app Android primeiro, com base React Native/Expo, usando a API atual do Drac e a mesma regra de acesso interna por grupos. A mesma base deve permitir evoluir para iPhone depois, sem criar outro backend nem transformar o sistema em SaaS.

## Regras de acesso

- O app usa `/auth/login` e envia o mesmo Bearer JWT do web.
- O app lista cameras por `/cameras`; o backend ja filtra por usuario, permissao direta e permissao por grupo.
- Acoes de PTZ usam `/ptz/:cameraId/move` e dependem de permissao `CONTROL`.
- Gravacao manual usa `/cameras/:cameraId/recording/start` e `/stop`, dependente de permissao `RECORD`.
- Playback usa `/recordings` e tokens de `/recordings/:id/play-token`.
- Alarme manual aparece apenas quando `/ptz/:cameraId/relays` retorna relay acionavel.

## Primeira entrega Android

- Login configuravel com URL da API.
- Dashboard por grupos com status das cameras liberadas.
- Live individual e grid 1/2/4 usando HLS do MediaMTX.
- Controles PTZ basicos e zoom.
- Start/stop de gravacao manual.
- Lista de gravacoes do dia por camera, abrir playback e baixar/compartilhar.
- Perfil com usuario logado, API conectada e logout.

## Evolucao para iPhone

Depois da validacao Android, manter a mesma base Expo e revisar apenas detalhes nativos: permissao de rede local, comportamento de video HLS, compartilhamento de arquivos e assinatura/publicacao na App Store.
