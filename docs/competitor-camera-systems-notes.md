# Referências extraídas dos motores open-source

Projetos analisados em concorrente/: Shinobi, ZoneMinder, Frigate, Kerberos e Viseron.

Achados aplicáveis ao Drac:
- Shinobi: PTZ não deve depender de token fixo; ele cria conexão ONVIF e usa o perfil corrente descoberto.
- Shinobi: scanner ONVIF marca automaticamente câmera como PTZ quando a descoberta informa capacidade PTZ.
- Shinobi/ZoneMinder: autostop/watchdog é obrigatório para movimento contínuo.
- ZoneMinder: velocidade deve ser normalizada por capacidade e pode exigir inversão de eixo/orientação.
- Frigate: restream centralizado reduz múltiplas conexões RTSP na câmera e melhora live view.
- Frigate/Kerberos: WebRTC/MSE deve ser preferido para baixa latência quando possível.
- Kerberos: pré-gravação e pós-gravação via fila de GOP é melhor para gravação por movimento.

Ação implementada agora:
- Drac passou a tentar GetProfiles e usar tokens reais descobertos antes de chutar Profile000/Profile001.
- Drac passou a tentar tokens derivados do canal da câmera, útil para NOC-01/NOC-02/NOC-03 no mesmo IP com portas/canais diferentes.

Próximas candidatas:
- Exibir tokens/perfis ONVIF descobertos no diagnóstico da câmera.
- Adicionar configuração de inverter eixo X/Y por câmera.
- Adicionar preset ONVIF: listar, ir para preset e salvar preset.
- Implementar pré/pós gravação por movimento baseada em buffer/GOP.

## Correção PTZ NOC-01/NOC-02 - 2026-05-19

Problema identificado após comparar com abordagem genérica do Shinobi:
- O fallback HTTP Intelbras/Dahua estava fixo na porta `8075`.
- NOC-01 usa porta ONVIF/PTZ `8076` e NOC-02 usa `8077`.
- O fallback também usava `camera.channel` (`2`/`3`), mas as câmeras expostas por porta encaminhada usam `channel=1` no endpoint da própria porta.

Correção aplicada:
- Para câmeras com padrão Dahua/Intelbras (`/cam/realmonitor`), o Drac prefere CGI antes de ONVIF.
- Tenta primeiro a porta da própria câmera (`onvifPort`) e depois fallbacks.
- Tenta `channel=1` antes do canal salvo.
- Resposta de PTZ agora mostra protocolo, porta, canal e código usados no teste.

Resultado de teste:
- NOC-01: CGI `port=8076`, `channel=1`, códigos `Right` e `Left` aceitos.
- NOC-02: CGI `port=8077`, `channel=1`, códigos `Right` e `Left` aceitos.

## Alarme, relé e fala - 2026-05-19

Achados:
- Kerberos expõe o conceito correto para alarme físico: listar saídas de relé ONVIF e acionar uma saída por token.
- NOC-01 e NOC-02 não informaram relés pelo `GetRelayOutputs` ONVIF.
- Para câmeras Intelbras/Dahua, o fallback compatível é CGI em `configManager.cgi` com `AlarmOut[0].Mode`.
- Frigate trata fala/áudio bidirecional por WebRTC/go2rtc com backchannel de microfone, separado do controle de alarme.

Correção aplicada:
- Drac ganhou endpoint `GET /ptz/:cameraId/relays` para descobrir saídas de alarme/relé.
- Drac ganhou endpoint `POST /ptz/:cameraId/relays/trigger` para acionar alarme por pulso curto com desligamento automático.
- Quando a câmera não informa relé ONVIF, mas usa padrão Intelbras/Dahua, o Drac assume `alarmout-0` como saída compatível.
- A página da câmera ganhou botão `Acionar alarme` no painel de controle PTZ, enviando pulso de 1,5s.

Compatibilidade inicial:
- Intelbras: compatível quando o modelo segue Dahua CGI/ONVIF.
- Dahua: compatível pelo mesmo fallback CGI.
- Hikvision: deve entrar em camada própria ISAPI/ONVIF em etapa separada.
- Giga Security: precisa detectar OEM/modelo; muitos modelos são Intelbras/Dahua/Hikvision-like, mas não todos.
- TP-Link Tapo e Positivo Casa Inteligente: costumam depender de stack proprietária/app/cloud; compatibilidade local precisa ser validada por modelo.
