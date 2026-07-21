# Análise concorrencial DRAC VMS — matriz por evidência

Data: 21 de julho de 2026

Base: código, documentação, testes e histórico Git presentes no workspace; runtime real do DRAC

Versão: 2.0 — matriz desagregada para VMS

## Veredito

Com critérios próprios de um VMS — separando reprodução de gravação, web de mobile e resiliência de maturidade — o resultado é:

- **Cenário equilibrado:** Frigate em 1º (8,10), **DRAC em 2º (7,98)** e Scrypted em 3º (7,70).
- **Cenário VMS empresarial:** **DRAC em 1º (8,35)**, Frigate em 2º (8,13) e Scrypted em 3º (7,62).
- O DRAC lidera em **multi-cliente** e fica no grupo líder em segurança, live, gravação e resiliência.
- O principal freio do DRAC é **maturidade comprovada**, não ausência de funcionalidade.

O ranking empresarial não significa que o DRAC é universalmente superior. Frigate continua muito à frente em IA e review; Scrypted em streaming/ecossistema mobile; Moonfire em gravação eficiente; ZoneMinder em longevidade; e LightNVR em edge de baixo consumo.

## Matriz-mestre — notas 0–10, por evidência

As notas medem a solução encontrada no snapshot local, não reputação ou marketing. Valores em negrito indicam liderança ou grupo de liderança daquela coluna.

| Sistema | Segurança | Live | Reprodução | Gravação | Detecção/IA | Resiliência | UX Web | Mobile | Multi-cliente | Maturidade |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **DRAC** | **8,5** | **9,0** | **8,8** | **8,5** | 7,0 | **8,5** | **8,5** | 7,5 | **9,5** | 4,0 |
| Frigate | 7,5 | **9,0** | **9,5** | **9,0** | **10,0** | **9,0** | **9,5** | 6,0 | 2,0 | **9,5** |
| Scrypted | 7,0 | **9,5** | 8,0* | 8,0* | 8,0 | 8,0* | **8,5** | **9,0** | 3,0 | 8,0 |
| VibeNVR | 8,0 | 8,0 | 7,5 | 8,0 | 8,0 | 7,0 | **9,0** | 4,0 | 3,0 | 5,0 |
| ZoneMinder | 7,5 | 6,0 | 7,5 | **8,5** | 5,5 | **8,5** | 4,5 | 6,5 | 4,0 | **10,0** |
| Moonfire NVR | 6,5 | 5,5 | 6,5 | **9,5** | 0,0 | **8,5** | 5,0 | 3,0 | 2,0 | 7,5 |
| Bluecherry | 6,0 | 5,5 | 6,5 | 8,0 | 3,0 | 7,0 | 5,0 | 6,5 | 5,0 | 8,0 |
| Kerberos Agent | 6,0 | 7,5 | 5,5 | 6,5 | 5,0 | 7,0 | 7,0 | 5,0 | 7,0 | 7,0 |
| Shinobi | 6,5 | 7,5 | 7,5 | 8,0 | 6,0 | 7,0 | 6,5 | 5,0 | 7,5 | 8,0 |
| LightNVR | **8,5** | **8,5** | 6,0 | 7,5 | 7,0 | 8,0 | 7,5 | 3,5 | 2,0 | 5,5 |
| Viseron | 6,0 | 7,0 | 7,0 | 7,5 | **9,0** | 7,5 | 7,0 | 3,5 | 2,0 | 7,0 |

`*` O NVR principal do Scrypted é um componente comercial ausente deste snapshot. As notas de reprodução, gravação e resiliência usam evidência indireta do core, interfaces, plugins e documentação; têm confiança menor.

Motion, motionEye e Valkka Core foram retirados da matriz principal: Motion é um motor de movimento, motionEye é principalmente uma interface sobre Motion e Valkka é uma biblioteca explicitamente arquivada. Colocá-los no mesmo ranking de produto distorce o resultado.

### Grau de evidência usado

| Grau | Significado | Sistemas |
|---|---|---|
| E4 | código + testes/build executados + runtime observado | DRAC |
| E3 | código, documentação, histórico e testes/CI visíveis no snapshot | Frigate, ZoneMinder, Moonfire, Bluecherry, LightNVR, Viseron |
| E2 | código e documentação visíveis, mas evidência de teste limitada | VibeNVR, Kerberos Agent, Shinobi |
| E1–E2 | core/plugins visíveis; NVR principal e parte da experiência mobile fora do snapshot | Scrypted |

O grau mede a confiança da avaliação, não a qualidade do produto. O DRAC tem a evidência mais direta porque foi o único executado; ao mesmo tempo, tem a menor maturidade histórica.

## O que significa cada nota

### Segurança

Foram considerados autenticação, sessões, MFA, RBAC, isolamento por câmera/cliente, proteção da mídia, cifragem de credenciais, auditoria, rede, headers, segredos, supply chain e testes de segurança.

- **DRAC 8,5:** sessão revogável com refresh rotativo, RBAC fino, câmera/grupo, tokens temporários de mídia, credenciais cifradas, SSRF/path controls, auditoria e evidência assinada. Não recebe 9,0 porque não tem MFA e o `pnpm audit --prod` retornou 57 advisories antes da triagem.
- **LightNVR 8,5:** TOTP, credenciais iniciais geradas, papéis/tags e CI com static analysis, sanitizers, CodeQL e container scan. Tem menos isolamento empresarial que o DRAC.
- **VibeNVR 8,0:** Argon2, TOTP, recovery codes, trusted devices, cookies HttpOnly e RBAC por câmera/grupo. Perde pontos por JWT sem revogação por sete dias e trade-offs documentados de CORS/seccomp/token em query.
- **Frigate 7,5:** PBKDF2-SHA256 com 600 mil iterações, JWT, rate limiting, roles, proxy auth e TLS. A porta interna sem autenticação exige segmentação correta e não há MFA nativo visível.
- **ZoneMinder 7,5:** autenticação, bcrypt/JWT/CSRF e enorme maturidade, mas superfície legada PHP/C++ mais ampla.
- **Scrypted 7,0:** autenticação e permissões no core, mas o NVR que manipula a mídia não está disponível para auditoria equivalente.
- **Shinobi 6,5:** multi-account, subcontas, permission sets e API keys; menos evidência de MFA, sessões modernas e hardening sistemático.
- **Moonfire 6,5:** Rust, modelo de usuário/sessão e guia de proxy seguro; sem TLS nativo e com escopo funcional menor.
- **Bluecherry/Kerberos/Viseron 6,0:** possuem autenticação e controles úteis, porém menor profundidade de isolamento/auditoria ou maior dependência de arquitetura externa.

### Live

Foram considerados WebRTC/MSE/WebCodecs/HLS, primeiro frame, fallback, reconexão, grids, substreams, áudio, PTZ e compatibilidade de codec.

- **Scrypted 9,5:** é a plataforma mais especializada em streaming instantâneo e interoperabilidade de câmeras/ecossistemas.
- **DRAC 9,0:** WHEP/WebRTC, LL-HLS/HLS, seleção inteligente, fallback, timeout de primeiro frame, recuperação ICE, controle de aba oculta, perfis grid/selected/original e transcode seletivo H.265→H.264.
- **Frigate 9,0:** go2rtc, WebRTC/MSE, Birdseye/multiview e integração madura entre live e eventos.
- **LightNVR 8,5:** go2rtc, WebRTC/HLS, NAT/STUN, grid e overlay com core muito leve.
- **VibeNVR 8,0:** WebCodecs H.264/WebSocket, keyframe cache, áudio, fallback JPEG e dual stream; arquitetura mais jovem.
- **Kerberos/Shinobi 7,5:** bons recursos de streaming, mas experiência e resiliência do player abaixo do trio líder.
- **Viseron 7,0:** go2rtc/HLS e frontend funcional; foco maior em analytics.
- **ZoneMinder 6,0, Moonfire/Bluecherry 5,5:** live existe, porém sem a mesma modernidade/baixa latência e ergonomia.

### Reprodução

Reprodução mede encontrar, navegar e usar gravações: timeline, scrub, multi-câmera, velocidade, thumbnails, busca, review, exportação e compatibilidade no navegador.

- **Frigate 9,5:** Review, multi-camera scrubbing, thumbnails, eventos indexados por objeto e fluxo contínuo entre detecção e gravação.
- **DRAC 8,8:** timeline de 24 horas com gaps/eventos/alarmes, zoom/pan, seek, velocidade, reprodução multi-câmera, thumbnails protegidos, mídia compatível, ZIP, clip e anexação a investigação.
- **Scrypted 8,0:** experiência NVR forte declarada, mas o código principal não está auditável no snapshot.
- **VibeNVR/Shinobi/ZoneMinder 7,5:** timeline/eventos e reprodução sólidas, com diferentes níveis de modernidade.
- **Viseron 7,0:** bom acervo orientado a eventos/IA.
- **Moonfire/Bluecherry 6,5:** reprodução útil; Moonfire gera MP4 arbitrário, mas sua própria documentação registra UI básica e ausência de scrub bar.
- **LightNVR 6,0:** player/modal e gestão de gravações funcionais, sem workflow de investigação/review equivalente.
- **Kerberos 5,5:** o Agent isolado não oferece sozinho a experiência central completa.

### Gravação

Gravação mede ingest, stream copy, formatos, contínua/evento, retenção, recuperação de arquivos, disco e eficiência — independentemente da qualidade da tela de playback.

- **Moonfire 9,5:** não decodifica, analisa ou reencoda; foi desenhado especificamente para persistência H.264 eficiente e construção posterior de MP4.
- **Frigate 9,0:** 24×7 e baseada em eventos/objetos, retenção rica, restream e arquitetura amplamente exercitada.
- **DRAC 8,5:** manual/motion/contínua, stream copy, H.265, perfis separados, retenção, disk guard, reconcile, gaps e integridade. Não recebe 9 porque somente uma câmera estava gravando e nenhuma em contínuo na instância analisada.
- **ZoneMinder 8,5:** gravação madura, storage, eventos, filtros e histórico de implantação longo.
- **Scrypted/VibeNVR/Bluecherry/Shinobi 8,0:** pipelines sólidos, mas Scrypted tem evidência incompleta; Vibe é jovem; Bluecherry/Shinobi têm arquitetura mais tradicional.
- **LightNVR/Viseron 7,5:** gravação e retenção reais, com menos profundidade operacional de evidência/exportação.
- **Kerberos 6,5:** bom agente de captura/movimento, mas a solução completa depende de componentes externos.

### Detecção e IA

- **Frigate 10,0:** objetos, tracking, zonas, máscaras, face recognition, LPR, busca semântica, autotracking PTZ, classificações e múltiplos aceleradores.
- **Viseron 9,0:** arquitetura extensível com YOLO, EdgeTPU, Hailo, CodeProject.AI, CompreFace, dlib e outros componentes.
- **Scrypted/VibeNVR 8,0:** vários runtimes/plugins no Scrypted; YOLO/MobileNet/Coral, tracking e zonas no VibeNVR.
- **DRAC/LightNVR 7,0:** DRAC possui OpenVINO, YOLO, ByteTrack, motion gating e detecção facial; LightNVR integra ONNX/TFLite/SOD e zonas. No DRAC, face detection não é face recognition.
- **Shinobi 6,0 e ZoneMinder 5,5:** detecção/plugins e zonas tradicionais, abaixo dos pipelines AI-first.
- **Kerberos 5,0 e Bluecherry 3,0:** analytics mais limitado ou dependente de componentes externos.
- **Moonfire 0,0:** o README afirma explicitamente não haver motion detection; dar 2,0 por mera possibilidade futura seria premiar funcionalidade inexistente.

### Resiliência

Resiliência mede comportamento sob câmera instável, processo morto, disco cheio, power loss, arquivos inválidos, rede interrompida, backup/restore e observabilidade operacional.

- **Frigate 9,0:** arquitetura madura, processos isolados, métricas Prometheus, health, retenção e comunidade/testes extensos.
- **DRAC 8,5:** health/readiness, restart policies, watchdog, reconciliação, gaps, disk guard, backup validado, restore, offsite e Central. Não recebe 9,5 porque não há HA/failover nem soak test de gravação plena e o disco estava bloqueado em 87%.
- **ZoneMinder 8,5:** décadas de operação, multi-server, storage e ferramentas maduras.
- **Moonfire 8,5:** formato/persistência e baixo processamento favorecem estabilidade do gravador; escopo simples reduz modos de falha.
- **Scrypted/LightNVR 8,0:** arquitetura robusta e boa recuperação, com ressalva de auditabilidade do NVR Scrypted.
- **Viseron 7,5; Vibe/Shinobi/Bluecherry/Kerberos 7,0:** bons mecanismos, mas menos evidência combinada de recovery, backup e carga.

### UX Web

- **Frigate 9,5:** live, Review, busca, configuração e visualização de IA muito integrados.
- **VibeNVR 9,0:** frontend moderno e coerente, dashboard configurável e bom onboarding.
- **DRAC/Scrypted 8,5:** DRAC é mais completo para operação empresarial; Scrypted é forte em dispositivos/plugins. O DRAC ainda tem inconsistências de acabamento e pouca cobertura visual automatizada.
- **LightNVR 7,5; Kerberos/Viseron 7,0; Shinobi 6,5:** interfaces funcionais com diferentes graus de modernização.
- **Moonfire/Bluecherry 5,0 e ZoneMinder 4,5:** capacidade existe, mas a experiência é mais básica ou antiga.

### Mobile

Mobile separa app nativo/cliente dedicado de web responsiva ou PWA.

- **Scrypted 9,0:** melhor experiência/ecossistema mobile do conjunto, ligada a HomeKit/Google/Alexa e clientes da plataforma; parte dessa evidência não está no código NVR local.
- **DRAC 7,5:** Expo/React Native real, Android/iOS, WebRTC, biometria, secure storage, push, playback, mosaico, APK/AAB e white-label. Perde pontos por juventude, diferenças de cobertura frente ao web e ausência de suíte E2E no dispositivo.
- **ZoneMinder/Bluecherry 6,5:** ecossistemas/clientes mobile mais antigos e maduros, porém menos integrados ao snapshot principal.
- **Frigate 6,0:** excelente PWA instalável e responsiva, mas não equivale integralmente a app nativo.
- **Kerberos/Shinobi 5,0; Vibe 4,0; LightNVR/Viseron 3,5; Moonfire 3,0:** predominam web responsiva/PWA ou dependência de componentes externos.

### Multi-cliente

Multi-cliente não significa apenas “muitos usuários”. Mede tenants/instalações, isolamento, administração central, grupos, delegação, licenças, operação remota e personalização por cliente.

- **DRAC 9,5:** Central, installation ID, heartbeat, licença, políticas comerciais, update/restore/diagnóstico, clientes de app, APK/AAB white-label, grupos e group tenancy. É o maior diferencial da solução.
- **Shinobi 7,5:** multi-account/subaccounts, permission sets e recursos distribuídos; não possui a mesma cadeia comercial/white-label visível.
- **Kerberos 7,0:** modelo de agentes distribuídos e conexão com Hub/cloud é naturalmente multi-site, embora o Agent sozinho não componha toda a experiência.
- **Bluecherry 5,0 e ZoneMinder 4,0:** multi-server/usuários e administração tradicional, mas não tenancy comercial completo.
- **Scrypted/VibeNVR 3,0:** usuários/papéis e múltiplos dispositivos, sem Central multi-instalação comparável.
- **Frigate/LightNVR/Viseron/Moonfire 2,0:** predominantemente single-installation.

### Maturidade

Maturidade não é quantidade de features. Foram considerados idade, commits, autores, tags, testes, CI, estabilidade da arquitetura e reprodutibilidade.

| Sistema | Primeiro commit no histórico local | Commits | Autores | Tags | Arquivos de teste* | Nota |
|---|---:|---:|---:|---:|---:|---:|
| ZoneMinder | 2002 | 28.223 | 416 | 104 | 726 | 10,0 |
| Frigate | 2019 | 5.799 | 403 | 156 | 64 | 9,5 |
| Scrypted | 2021 | 8.497 | 104 | 99 | 18 | 8,0 |
| Bluecherry | 2010 | 3.726 | 57 | 237 | 27 | 8,0 |
| Shinobi | 2018 | 3.642 | 98 | 6 | 12 | 8,0 |
| Moonfire | 2016 | 1.091 | 21 | 40 | 5 | 7,5 |
| Kerberos Agent | 2020 | 1.383 | 23 | 242 | 0 | 7,0 |
| Viseron | 2019 | 2.957 | 23 | 72 | 71 | 7,0 |
| LightNVR | 2025 | 2.386 | 21 | 219 | 107 | 5,5 |
| VibeNVR | 2026 | 360 | 4 | 91 | 0 | 5,0 |
| **DRAC** | **2026** | **86** | **2** | **1** | **6** | **4,0** |

`*` Contagem heurística por nome/path; pode incluir fixtures e arquivos auxiliares. Serve como sinal, não cobertura percentual.

O DRAC fica em 4,0 porque tem pouco mais de dois meses no histórico local, dois autores, uma tag, árvore de trabalho não consolidada e testes concentrados. A suíte é útil e passou, mas isso não substitui anos de produção, releases, upgrades, incidentes e compatibilidade acumulada.

## Rankings por característica

| Critério | 1º | 2º | 3º | Posição DRAC |
|---|---|---|---|---:|
| Segurança | DRAC/LightNVR (8,5) | VibeNVR (8,0) | Frigate/ZoneMinder (7,5) | **#1 empatado** |
| Live | Scrypted (9,5) | DRAC/Frigate (9,0) | LightNVR (8,5) | **#2 empatado** |
| Reprodução | Frigate (9,5) | DRAC (8,8) | Scrypted (8,0) | **#2** |
| Gravação | Moonfire (9,5) | Frigate (9,0) | DRAC/ZoneMinder (8,5) | **#3 empatado** |
| Detecção/IA | Frigate (10) | Viseron (9,0) | Scrypted/VibeNVR (8,0) | **#5 empatado** |
| Resiliência | Frigate (9,0) | DRAC/ZoneMinder/Moonfire (8,5) | Scrypted/LightNVR (8,0) | **#2 empatado** |
| UX Web | Frigate (9,5) | VibeNVR (9,0) | DRAC/Scrypted (8,5) | **#3 empatado** |
| Mobile | Scrypted (9,0) | DRAC (7,5) | ZoneMinder/Bluecherry (6,5) | **#2** |
| Multi-cliente | DRAC (9,5) | Shinobi (7,5) | Kerberos (7,0) | **#1** |
| Maturidade | ZoneMinder (10) | Frigate (9,5) | Scrypted/Bluecherry/Shinobi (8,0) | **#11** |

## Ranking geral — duas leituras

### 1. Equilibrado: todas as colunas com o mesmo peso

| Rank | Sistema | Média |
|---:|---|---:|
| 1 | Frigate | 8,10 |
| **2** | **DRAC** | **7,98** |
| 3 | Scrypted | 7,70 |
| 4 | Shinobi | 6,95 |
| 5 | ZoneMinder | 6,85 |
| 6 | VibeNVR | 6,75 |
| 7 | LightNVR | 6,40 |
| 8 | Kerberos Agent | 6,35 |
| 8 | Viseron | 6,35 |
| 10 | Bluecherry | 6,05 |
| 11 | Moonfire NVR | 5,40 |

Essa média favorece soluções completas. Moonfire, por exemplo, é extraordinário no que se propõe, mas perde por não querer ser um VMS full-stack.

### 2. VMS empresarial

Pesos: segurança 15%, live 12%, reprodução 12%, gravação 12%, IA 8%, resiliência 14%, web 8%, mobile 5%, multi-cliente 10% e maturidade 4%.

| Rank | Sistema | Nota empresarial |
|---:|---|---:|
| **1** | **DRAC** | **8,35** |
| 2 | Frigate | 8,13 |
| 3 | Scrypted | 7,62 |
| 4 | VibeNVR | 7,06 |
| 5 | Shinobi | 7,04 |
| 6 | ZoneMinder | 6,88 |
| 7 | LightNVR | 6,79 |
| 8 | Viseron | 6,46 |
| 9 | Kerberos Agent | 6,41 |
| 10 | Bluecherry | 6,07 |
| 11 | Moonfire NVR | 5,79 |

O DRAC vence esse cenário porque combina segurança operacional, live forte, playback/evidência, resiliência e multi-cliente. Maturidade recebe peso baixo porque a pergunta aqui é adequação funcional empresarial hoje, não risco histórico de adoção. Para decisão de compra conservadora, maturidade deve receber peso maior e Frigate/ZoneMinder sobem.

## DRAC contra cada concorrente

| Concorrente | Onde supera o DRAC | Onde o DRAC supera | Decisão prática |
|---|---|---|---|
| Frigate | IA, review, busca, observabilidade, maturidade | multi-cliente, Central, white-label, investigação/evidência, autorização comercial | Frigate para AI-first; DRAC para operação empresarial/multi-site |
| Scrypted | live instantâneo, integrações, mobile/ecossistema | auditabilidade do NVR local, evidência, Central, tenancy, workflow operacional | Scrypted para smart home; DRAC para VMS controlado |
| VibeNVR | acabamento/onboarding web, MFA pronto | live mais resiliente, playback investigativo, Central, app nativo, evidência | Vibe para simplicidade visual; DRAC para operação crítica |
| ZoneMinder | maturidade, histórico, multi-server | live moderno, web, mobile white-label, IA, investigação e facilidade operacional | ZoneMinder minimiza novidade; DRAC minimiza dívida de experiência |
| Moonfire | eficiência e pureza da gravação | todo o restante do VMS: live, IA, usuários, casos, app e Central | Moonfire como gravador especializado; DRAC como produto completo |
| Bluecherry | longevidade e gravação clássica | segurança moderna, live, IA, web, tenancy e investigação | DRAC é a opção moderna; Bluecherry favorece legado já implantado |
| Kerberos Agent | footprint/distribuição de agentes edge | playback, gravação central, segurança granular e produto end-to-end | podem ser complementares; Agent não substitui sozinho o DRAC |
| Shinobi | histórico, plugins, multi-account amplo | live/player, segurança de mídia, investigação, app e Central comercial | Shinobi para extensibilidade; DRAC para fluxo operacional fechado |
| LightNVR | consumo, edge, CI/security scanning, TOTP | playback, multi-cliente, mobile, casos/evidência e profundidade VMS | LightNVR para SBC; DRAC para servidor/cliente empresarial |
| Viseron | variedade de IA/detectores | live, segurança, mobile, multi-cliente, playback e operação comercial | Viseron para laboratório AI/local; DRAC para VMS de produção |

## Evidência real do DRAC durante esta análise

- `pnpm verify` passou: 49 checks críticos API, 19 mobile, dois web, três Central, builds e typechecks.
- Docker Compose de produção validou.
- API, PostgreSQL, Redis, MediaMTX, web e IA estavam saudáveis.
- 23 câmeras cadastradas; 20 online no checklist.
- MediaMTX: 34 paths, oito ready e dois leitores no instante da coleta.
- Storage: 2.980 arquivos e aproximadamente 34,84 GB.
- Arquivo real validado: MP4 H.264, 1920×1080, 30 fps, AAC, 125 s.
- Backup PostgreSQL recente e verificado.
- Um bloqueio operacional real: disco em 87%.
- Gravação habilitada em somente uma câmera; nenhuma contínua.
- `pnpm audit --prod`: 57 advisories, sendo três críticos e 27 altos antes da triagem de contexto.

Esses fatos explicam simultaneamente as notas altas de capacidade e resiliência e a nota baixa de maturidade. O sistema funciona; ainda não acumulou evidência longitudinal suficiente.

## Prioridades que mudam efetivamente o ranking

### P0 — transformar capacidade em confiabilidade comprovada

1. Corrigir o bloqueio de disco e testar retenção/emergência com pouco espaço.
2. Triar e corrigir os advisories, começando por caminhos da API e imagens de produção.
3. Adicionar TOTP/WebAuthn, recovery codes e gestão de dispositivos confiáveis.
4. Soak test de sete dias em 4/8/16/23 câmeras com gravação contínua, live concorrente e IA.
5. E2E real: login → primeiro frame → gravação → segmento → playback → seek → exportação → auditoria.

### P1 — fechar os gaps frente aos líderes

1. Prometheus/OpenTelemetry e dashboard de primeiro frame, latência, reconnect, FPS, gaps, CPU/RAM e disco.
2. Suite própria da IA com vídeos fixture, overload, tracking e regressão de precisão.
3. Zonas poligonais, privacy masks, regras por classe e autotracking PTZ.
4. LPR e reconhecimento facial com política de privacidade; o código atual só detecta faces.
5. MQTT/Home Assistant e documentação OpenAPI para integrações.
6. CI com SCA, CodeQL/Semgrep, secret scan, SBOM, assinatura e scan de containers.

### P2 — elevar maturidade de 4 para 7+

1. Consolidar a árvore de trabalho e publicar releases reproduzíveis/changelog/migrations testadas.
2. Aumentar cobertura real do web, mobile em dispositivo, IA e processos FFmpeg/MediaMTX.
3. Testar update, rollback, power loss e restore em matriz de versões.
4. Publicar sizing guide e benchmark por codec/resolução/hardware.
5. Manter piloto contínuo em múltiplos clientes e registrar MTBF, incidentes e tempo de recuperação.

## Conclusão final

O retrato correto do DRAC não é “3º em um ranking genérico”. É mais específico:

- **2º produto mais completo no equilíbrio das dez dimensões.**
- **1º quando o problema é VMS empresarial multi-cliente.**
- **2º em reprodução e mobile; grupo líder em segurança, live e resiliência.**
- **Último em maturidade entre os 11 produtos comparáveis.**

Essa última posição é o risco central. O DRAC já possui uma arquitetura e um conjunto funcional capazes de vencer concorrentes maduros em adequação ao negócio, mas ainda precisa provar isso em tempo, escala e incidentes reais. A prioridade não deve ser adicionar mais páginas; deve ser MFA, supply chain limpa, observabilidade, gravação contínua em carga, testes E2E e histórico de releases estáveis.

## Fontes locais examinadas

- DRAC: `README.md`, `apps/api`, `apps/web`, `apps/mobile`, `apps/central`, `services`, `infra`, `scripts`, `.github/workflows`.
- Concorrentes: código, READMEs, documentação, manifests, testes, workflows e histórico Git em cada pasta de `concorrentes/`.
- Snapshots: Frigate `39a3667`, Scrypted `1545790`, VibeNVR `363f8b7`, ZoneMinder `c8d47e6`, Moonfire `60fd870`, Bluecherry `13970c1`, Kerberos Agent `e77af9e`, Shinobi `f5cb53d`, LightNVR `2635450` e Viseron `bdd047a`.
