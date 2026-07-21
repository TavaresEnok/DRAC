# DRAC VMS — Documentação do Sistema

> Sistema de gerenciamento de vídeo (VMS) para monitoramento de câmeras IP, com
> painel web, aplicativo Android, inteligência artificial de detecção e painel
> mestre multi-instalação.
>
> Documento gerado em 20/07/2026 a partir do código-fonte real do projeto.

---

## 1. Visão geral

O DRAC é um sistema completo de videomonitoramento vendido como produto para
provedores e empresas. Cada cliente recebe uma **instalação própria** (servidor
dedicado, banco próprio, câmeras próprias), e todas as instalações são
monitoradas de um **painel mestre central** operado pelo dono do produto.

**O que o sistema faz, em uma frase:** conecta câmeras IP (RTSP/ONVIF), exibe
ao vivo com baixa latência, grava 24h ou por movimento, detecta eventos com IA,
alerta o usuário no celular e guarda evidências com trilha de auditoria.

### Números do projeto

| Item | Valor |
|---|---|
| Aplicações | 5 (API, Web, Mobile, Central, IA) |
| Linhas de código | ~66.400 |
| Arquivos de código | ~357 |
| Modelos de banco | 22 tabelas + 7 enums |
| Migrações versionadas | 29 |
| Módulos da API | 30 |
| Telas do painel web | 24 |
| Commits | 86 (desde 05/05/2026) |

### Em produção hoje (instalação Grupo Flash)

| Item | Valor |
|---|---|
| Câmeras cadastradas | 23 |
| Gravações indexadas | 2.140 |
| Eventos registrados | 17.199 |
| Endereço | https://ajustcam.ajustconsulting.com.br |

---

## 2. Arquitetura

```
┌─────────────┐   ┌─────────────┐   ┌──────────────┐
│  Painel Web │   │  App Android│   │ DRAC Central │  ← painel mestre (dono)
│  (React)    │   │  (Expo/RN)  │   │  (Node puro) │
└──────┬──────┘   └──────┬──────┘   └──────┬───────┘
       │                 │                  │ heartbeat + provisionamento
       └────────┬────────┘                  │
                │ HTTPS/JWT                 │
         ┌──────▼───────────────────────────▼──┐
         │        API (NestJS + Prisma)        │
         │  auth · câmeras · gravações · IA    │
         │  alarmes · evidências · auditoria   │
         └───┬──────────┬──────────┬───────────┘
             │          │          │
      ┌──────▼───┐ ┌────▼────┐ ┌───▼──────────┐
      │ Postgres │ │  Redis  │ │  MediaMTX    │ ← ponte de mídia
      │    16    │ │ (filas) │ │  (WebRTC/HLS)│
      └──────────┘ └─────────┘ └───┬──────────┘
                                   │ RTSP
                        ┌──────────▼──────────┐
                        │   Câmeras IP (ONVIF)│
                        └──────────┬──────────┘
                                   │ RTSP (análise)
                        ┌──────────▼──────────┐
                        │ IA (Python/FastAPI) │
                        │  movimento · objetos│
                        └─────────────────────┘
```

Tudo roda em **Docker Compose** num único servidor por instalação. O isolamento
por cliente é físico (servidor separado), o que limita o raio de qualquer falha
ou incidente de segurança a um cliente só.

---

## 3. Tecnologias utilizadas

### Back-end — API
| Tecnologia | Versão | Papel |
|---|---|---|
| **NestJS** | 10.4 | Framework HTTP modular (30 módulos) |
| **TypeScript** | 5.x | Linguagem, tipagem estrita |
| **Prisma ORM** | 5.22 | Acesso ao banco + migrações versionadas |
| **PostgreSQL** | 16 | Banco relacional |
| **Redis** | 7 | Fila de trabalhos e cache |
| **BullMQ** | 5.34 | Processamento assíncrono (5 filas) |
| **Passport/JWT** | — | Autenticação com token e refresh |
| **bcrypt** | 5.1 | Hash de senhas |
| **class-validator** | 0.14 | Validação de entrada em todos os endpoints |
| **ONVIF** | 0.8 | Descoberta e controle PTZ de câmeras |

### Mídia
| Tecnologia | Papel |
|---|---|
| **MediaMTX** | Servidor de mídia: recebe RTSP da câmera e entrega WebRTC/HLS |
| **FFmpeg** | Transcodificação, gravação em segmentos, snapshots, clipes |
| **WebRTC (WHEP)** | Entrega ao vivo de baixa latência (caminho principal) |
| **HLS / LL-HLS** | Alternativa automática quando o WebRTC falha |

### Front-end — Painel Web
| Tecnologia | Versão | Papel |
|---|---|---|
| **React** | 18.3 | Interface |
| **Vite** | 6.2 | Build e dev server |
| **TypeScript** | 5.x | Linguagem |
| **Tailwind CSS** | 3.x | Estilo (com temas claro/escuro) |
| **wouter** | 3.7 | Rotas (leve, com links reais) |
| **zustand** | 5.0 | Estado global |
| **hls.js** | 1.6 | Reprodução HLS no navegador |
| **Recharts** | 2.15 | Gráficos de desempenho |
| **Leaflet** | — | Mapa das câmeras |

### Aplicativo Android
| Tecnologia | Versão | Papel |
|---|---|---|
| **Expo SDK** | 54 | Plataforma React Native |
| **React Native** | 0.81.5 | Framework |
| **react-native-webrtc** | 124 | Vídeo ao vivo por WebRTC |
| **expo-video** | 3.0 | Reprodução HLS e de gravações |
| **expo-notifications** | 0.32 | Notificações push (FCM) |
| **expo-font** | 14.0 | Fontes do design (Sora, Instrument Sans, JetBrains Mono) |
| **AsyncStorage** | 2.2 | Preferências locais |

### Inteligência Artificial
| Tecnologia | Papel |
|---|---|
| **Python + FastAPI** | Serviço HTTP de análise |
| **OpenCV** | Processamento de imagem |
| **MOG2** | Detecção de movimento leve (~2% de CPU por câmera) |
| **ONNX Runtime** | Execução de modelos (com suporte a GPU/CUDA) |
| **YOLO** | Detecção de objetos e pessoas |

### Infraestrutura
| Tecnologia | Papel |
|---|---|
| **Docker Compose** | Orquestração de todos os serviços |
| **nginx** | Proxy reverso, HTTPS, entrega dos arquivos estáticos |
| **Let's Encrypt** | Certificado TLS com renovação automática |
| **rclone** | Backup externo (off-site) |
| **Go** | Serviço auxiliar de gravação (camera-worker) |

---

## 4. Funcionalidades

### 4.1 Câmeras
- Cadastro manual ou **descoberta automática por ONVIF**
- Perfis separados para **ao vivo, gravação e análise** (canal/subtipo por uso)
- Detecção automática de codec, resolução e taxa de quadros reais do stream
- **Controle PTZ** (mover, zoom) para câmeras compatíveis
- Organização por **Site → Área → Grupo**
- **Desativar câmera**: para de exibir, transmitir e gravar sem apagar o
  cadastro nem o histórico (útil para câmera em manutenção)
- Teste de conexão e diagnóstico de recursos por câmera

### 4.2 Visualização ao vivo
- **WebRTC como caminho principal** (latência de ~1 segundo), com queda
  automática para HLS se falhar
- Mosaico (grade) com múltiplas câmeras simultâneas
- **Modo parede** (wall) para telão de monitoramento
- Layouts salvos por usuário
- Qualidade adaptativa: perfil reduzido (720p) na grade, resolução original ao
  abrir a câmera sozinha
- **Máxima qualidade (HD)** sob demanda, sem transcodificação
- Mapa com posicionamento geográfico das câmeras

### 4.3 Gravação
- **Contínua (24h)** ou **por movimento**, configurável por câmera
- Gravação em segmentos (padrão de 5 minutos) para busca rápida
- **Retenção automática** com limpeza agendada (padrão 7 dias, ajustável por
  câmera)
- Reprodução com linha do tempo, avanço/retrocesso e velocidade variável
- Download individual ou **em lote (ZIP)**
- Clipes gravados sob demanda pelo aplicativo, salvos no próprio celular

### 4.4 Inteligência Artificial
- **Detecção de movimento** leve por câmera (MOG2, 2 fps em 320×180)
- **Detecção de objetos e pessoas** (YOLO via ONNX Runtime)
- **Detecção de rostos**
- Caixas de detecção desenhadas sobre o vídeo ao vivo
- Aceleração por **GPU (CUDA/NVENC)** quando disponível, com detecção,
  ativação e métricas em tempo real pelo painel

### 4.5 Alarmes e eventos
- Regras de alarme configuráveis
- Fila de tratamento com **reconhecimento (ack)** e prioridade
- **Notificações push** no celular; tocar na notificação abre a câmera do
  alarme diretamente
- Silenciamento de notificações por câmera
- Histórico completo de eventos por câmera

### 4.6 Evidências e conformidade
- Exportação de evidências com **hash SHA-256** para verificação de
  integridade
- **Investigações**: agrupamento de gravações e eventos em um caso
- **Trilha de auditoria** completa (quem fez o quê, quando, de qual IP)
- Cadeia de custódia das evidências exportadas

### 4.7 Usuários e permissões
- Quatro perfis: **SUPER_ADMIN, ADMIN, OPERATOR, VIEWER**
- **10 permissões granulares** por perfil: `liveView`, `playback`, `ptzControl`,
  `cameraConfig`, `alarmAck`, `exportEvidence`, `reportGenerate`, `auditLogs`,
  `roleManage`, `serverConfig`
- **Permissão por câmera** (um usuário pode ver só as câmeras autorizadas)
- Autenticação com JWT + refresh token e sessões revogáveis
- Login por **biometria** no aplicativo
- Exclusão permanente de usuário além do bloqueio

### 4.8 Personalização (white-label)
- **Aparência** configurável por instalação: logo e 14 cores por tema
  (claro e escuro), aplicadas ao aplicativo do cliente em tempo real
- Botão **"Usar cores padrão"** para voltar ao tema DRAC
- Prévia fiel da tela do aplicativo dentro do painel
- Verificação automática de **contraste (WCAG AA)** para evitar texto ilegível

---

## 5. Aplicativo Android

### Duas gerações convivendo
| | App oficial (2.0.x) | App antigo |
|---|---|---|
| Pacote | `com.ajustconsulting.grupoflash` | `com.ajustconsulting.dracantigo` |
| Design | Novo (mockup aprovado) | Original |
| Uso | Publicado na Play Store | Comparação e plano B |

O app oficial é **atualização** do que já estava publicado (mesma assinatura
digital), não um aplicativo novo.

### Telas
**Início** — saudação, indicadores (online/gravando/offline), avisos
operacionais, câmera em destaque (fixável), carrossel de câmeras e atividade
recente.

**Câmeras** — busca, filtro por grupo, alternância lista/mural, favoritos
persistentes; o mural exibe **vídeo ao vivo real** nas primeiras câmeras.

**Câmera ao vivo** — vídeo com o **campo de visão completo, sem cortes**;
áudio, captura de foto, gravação de clipe, HD, PTZ, notificações, tela cheia
em paisagem; abaixo, as gravações do dia.

**Gravações** — origem servidor ou local; chips de data, linha do tempo de 24h
interativa (toque abre o horário), download e compartilhamento de clipes.

**Eventos** — atividade recente com filtros, limitada aos 50 mais recentes
para não travar em instalações movimentadas.

**Ajustes** — perfil, plano, tema claro/escuro, biometria.

### Geração de aplicativos white-label
Uma única base de código gera **N aplicativos personalizados**, um por cliente:
cada um com nome, ícone, logo, cores e servidor próprios, assinado com uma
**chave dedicada** (para que atualizações sempre instalem por cima). O processo
é disparado por um clique no painel Central, sem digitação.

---

## 6. DRAC Central (painel mestre)

Aplicação separada, operada pelo dono do produto, que:

- Lista e monitora **todas as instalações** de todos os clientes
- Recebe **heartbeat** de cada servidor (status, versão, câmeras, disco)
- Mostra alertas de saúde da infraestrutura
- **Provisiona instalações remotamente** via SSH (instala o DRAC no servidor do
  cliente por um comando)
- **Gera os aplicativos** de cada cliente (APK e pacote da Play Store)
- Gerencia usuários administrativos com trilha de auditoria

---

## 7. Operação e confiabilidade

### Auto-recuperação
- **Watchdog a cada 5 minutos** que detecta queda das portas de mídia e
  **se autocorrige** (reinicia o que travou)
- Detecção de processo FFmpeg travado segurando trava de câmera
- Recuperação automática de caminho de mídia travado
- Reconexão automática do vídeo sem "piscar" a imagem

### Alertas ao dono
- Notificação no **Telegram** quando algo quebra (canal configurável)
- Alertas de segurança (ex.: credencial aparecendo em log)

### Backups
- **Backup do Postgres** automático, com container que **verifica a restauração**
- Backup dos dados da Central
- **Backup off-site** via rclone
- Backup diário das chaves de assinatura dos aplicativos

### Diagnóstico
- Endpoint de saúde com métricas de câmeras, disco, gravações
- Página de desempenho no painel
- Script de coleta de diagnóstico
- Script de verificação de prontidão para produção

---

## 8. Segurança

Auditoria completa realizada em julho/2026, com **13 vulnerabilidades
corrigidas**, entre elas:

- **Execução remota de código** pelo gerador de aplicativos
- **Leitura arbitrária de arquivos** do servidor
- **Vazamento de senha de câmera** em log (a saída de erro do FFmpeg continha a
  URL completa com credenciais)
- **XSS** no painel Central via heartbeat
- **Escalação de privilégio**: administrador de grupo assumindo outro grupo;
  usuário se auto-promovendo
- **Vazamento de auditoria** de cadeia de custódia
- **Oráculo de autenticação** no endpoint de mídia
- **SSRF** por redirecionamento
- **Isolamento entre clientes** (tenant scoping) em mapas de site

Medidas permanentes:
- Senhas de câmera **criptografadas** no banco
- Comparação de credenciais em **tempo constante** (contra ataque de tempo)
- Sanitização de textos sensíveis antes de qualquer log
- Token de mídia por câmera com validade curta
- Endpoint interno de autorização de mídia bloqueado na borda
- Serviços expostos apenas em **loopback**, acessíveis só pelo nginx
- HTTPS obrigatório com cookie seguro
- Rate limiting e proteção contra força bruta no login

---

## 9. Como foi construído

### Linha do tempo
- **Maio/2026** — início do projeto
- **Junho/2026** — painel web, gravação, IA, white-label, painel Central
- **Julho/2026** — HTTPS e domínio próprio, auditoria de segurança,
  monitoramento com auto-recuperação, publicação na Play Store, redesign
  completo do aplicativo (versão 2.0)

### Método de trabalho
O desenvolvimento seguiu alguns princípios que se mostraram decisivos:

**Verificação real, não suposição.** Toda mudança no aplicativo é validada em
um emulador Android de verdade — instalando o APK, fazendo login, navegando e
lendo os logs do renderizador de vídeo. Um episódio ilustra a importância:
durante o redesign, o vídeo ao vivo não aparecia e a hipótese registrada era
"limitação do emulador". Só quando o aplicativo **antigo** foi instalado no
mesmo emulador como referência — e renderizou a 25 quadros por segundo — ficou
claro que o problema era do código novo, não do ambiente. O erro real era de
dimensionamento: o container do vídeo colapsava para altura zero.

**O app antigo como referência viva.** Sempre que algo do aplicativo novo se
comporta diferente, a resposta está em como o antigo faz — ele é mantido
instalável lado a lado justamente para isso.

**Segurança acima da estética.** Uma versão do redesign preenchia a tela
cortando as laterais do vídeo. Foi revertido: em câmera de segurança, cortar
imagem esconde parte da cena do usuário. A solução foi usar a proporção real da
câmera (sem corte e sem tarjas) e preencher o espaço restante com conteúdo útil.

**Memória de decisões.** Cada correção não óbvia, armadilha de infraestrutura e
regra de negócio fica registrada, com o *porquê* — para que a mesma investigação
não precise ser refeita.

---

## 10. Estado atual

### Pronto e em produção
- Servidor, painel web e infraestrutura — rodando com 23 câmeras reais
- Segurança auditada e corrigida
- Backups verificados e monitoramento com auto-recuperação
- Aplicativo Android publicado na Play Store

### Pontos de atenção
- **Somente Android** — não há versão iOS
- **Disco em ~88%** no servidor atual; a retenção protege, mas convém
  acompanhar
- **Escala não testada** acima de ~25 câmeras por instalação
- **Cobertura de testes automatizados baixa** — a validação hoje é manual e por
  scripts de regressão

### Próximos passos sugeridos
1. Confirmar em campo a entrega das notificações push (depende de credencial
   externa)
2. Filtro por câmera na tela de eventos do aplicativo
3. Indicadores de carregamento (skeletons) no aplicativo
4. Troca de senha pelo próprio aplicativo
5. Avaliar versão iOS
6. Ampliar testes automatizados nas rotas críticas

---

*Documento técnico do DRAC VMS — Ajust Consulting.*
