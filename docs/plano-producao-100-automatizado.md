# Plano de Producao 100% Automatizado

Objetivo: transformar o DRAC VMS em um sistema instalavel, monitoravel e validavel automaticamente, removendo validacoes manuais do processo de producao.

Quando todos os itens deste checklist passarem, a instalacao pode ser marcada pela Central como **Producao pronta**.

Perfil inicial aprovado: `DRAC_LAUNCH_PROFILE=standard`. Nesse perfil, gravacao continua e IA
nao sao obrigatorias. O sistema deve ser considerado pronto quando live, cameras, usuarios,
playback, alertas, backups, Central e seguranca passarem; storage para retencao continua vira
capacidade futura enquanto a gravacao continua estiver desligada.

## Estados Da Instalacao

- **Pronto**: todos os checks obrigatorios passaram.
- **Atencao**: sistema opera, mas existe alerta que precisa ser corrigido automaticamente ou acompanhado.
- **Bloqueado**: falha critica de seguranca, licenca, gravacao, storage ou conectividade.

## 1. Instalador Unico

### Entrega

- Central gera instalador por cliente.
- Instalador recebe `INSTALL_TOKEN`.
- Instalacao em VM limpa com um comando:

```bash
curl -fsSL https://central.flashnet.com/install/CLIENTE | bash
```

### O Instalador Deve Fazer

- Instalar Docker.
- Instalar Docker Compose plugin.
- Instalar Git e pacotes necessarios.
- Criar usuario operacional quando necessario.
- Clonar o repositorio DRAC.
- Gerar `.env` seguro.
- Registrar servidor na Central.
- Aplicar migrations.
- Subir containers.
- Configurar firewall.
- Executar healthcheck final.

### Criterio De Conclusao

- VM limpa instala do zero sem intervencao manual.
- Instalacao aparece online na Central.
- API, web, banco, Redis, MediaMTX e IA ficam saudaveis.

## 2. Registro Automatico Na Central

### Entrega

- Cada instalacao deve se registrar automaticamente na Central.
- Registro deve usar token de instalacao, nao usuario/senha.

### Dados Enviados

- ID da instalacao.
- Cliente.
- Hostname.
- IP publico.
- IP local.
- Versao do DRAC.
- Commit atual.
- CPU.
- RAM.
- Disco.
- Uptime.
- Containers ativos.
- Portas expostas.

### Criterio De Conclusao

- A Central lista instalacoes reais sem cadastro manual.
- A instalacao atualiza heartbeat periodicamente.
- A Central detecta instalacao offline automaticamente.

## 3. Provisionamento De Cameras

### Entrega

O operador deve informar apenas:

- IP.
- Porta RTSP.
- Porta ONVIF.
- Usuario.
- Senha.
- Canal.

O sistema deve descobrir automaticamente:

- Caminho RTSP.
- Caminho ONVIF.
- Token ONVIF.
- Perfis disponiveis.
- Codec.
- Resolucao.
- FPS.
- Bitrate.
- Audio.

### Selecao Automatica De Perfis

- Gravacao: main stream, preferencialmente H.265.
- Live: main stream em alta qualidade via WebRTC.
- IA: substream leve direto da camera, sem usar live/MediaMTX.

### Criterio De Conclusao

- Camera so fica como **Pronta** se passar:
  - teste RTSP;
  - teste ONVIF quando disponivel;
  - teste live;
  - teste gravacao curta;
  - teste playback do trecho gravado.

## 4. Live E WebRTC

### Entrega

- WebRTC como protocolo padrao.
- H.265 da camera convertido para H.264 quando necessario.
- H.264 entregue direto quando possivel.
- Reconexao sem tela piscando.
- Mensagens amigaveis sem termos tecnicos.
- Audio validado quando a camera suportar.

### Metricas Obrigatorias

- Tempo ate o primeiro frame.
- Protocolo ativo.
- Codec de entrada.
- Codec entregue ao navegador.
- Resolucao entregue.
- FPS real.
- Latencia aproximada.
- Reconexoes.
- Erros por camera.

### Criterio De Conclusao

- Live abre em ate 5 segundos em cold start.
- Live permanece estavel em teste automatizado.
- Falha de stream gera tentativa de recuperacao automatica.
- Se WebRTC falhar, fallback controlado nao deve travar a tela.

## 5. Gravacao E Playback

### Entrega

- Gravacao continua em H.265 quando possivel.
- Gravacao direta sem reencode quando a camera ja entrega H.265.
- Retencao automatica.
- Auto-start de gravacao continua desativado por padrao, ativado apenas com storage dimensionado.
- Guarda de disco obrigatoria para parar gravacoes antes de afetar Postgres, Redis ou API.
- Reabertura de RTSP quando a camera cair.
- Playback validado por trecho.

### Criterio De Conclusao

- Teste continuo de 24h com cameras reais sem buracos criticos.
- Disco deve ficar abaixo de 75% para iniciar baseline prolongado.
- Cada camera grava segmento curto e reproduz o trecho gravado.
- Queda e retorno de camera sao tratados automaticamente.
- Retencao remove arquivos antigos sem quebrar o indice.
- `RECORDING_DISK_GUARD_ENABLED=true` em producao.

## 6. IA E Overlay

### Entrega

- IA separada da live.
- IA usa `analyticsSubtype`.
- IA le RTSP direto da camera.
- IA usa latest-frame-only.
- IA nao deve receber audio.
- Overlay visual separado de eventos.
- Evento nao deve controlar triangulo.

### Metricas Obrigatorias

- Camera analisada.
- Analytics source sanitizada.
- Codec recebido.
- Resolucao recebida.
- Capture FPS.
- Inference FPS.
- Frame age medio.
- Drops.
- Pool busy drops.
- Advanced infer errors.

### Criterio De Conclusao

- IA nao interfere na live.
- IA nao interfere na gravacao.
- Central mostra saude da IA por camera.
- Se IA cair, live e gravacao continuam funcionando.

## 7. Seguranca De Producao

### Entrega

- HTTPS obrigatorio.
- Firewall padrao.
- API protegida.
- CORS por dominio.
- MediaMTX sem publish publico.
- Portas internas fechadas.
- Docker socket removido da API ou isolado em worker minimo.
- `.env` nunca versionado.
- Backup de configuracao criptografado.

### Criterio De Conclusao

- Scan externo mostra apenas portas esperadas.
- MediaMTX nao aceita publish anonimo.
- API nao expoe endpoints internos sem autenticacao.
- Secrets nao aparecem em logs, docs ou Git.

## 8. Backup E Restore

### Entrega

- Backup automatico do banco.
- Backup criptografado de configuracoes sensiveis.
- Backup de metadados de storage.
- Restore automatizado em VM limpa.
- Relatorio diario de integridade.

### Criterio De Conclusao

- Restore recria uma instalacao funcional.
- Banco, cameras, usuarios e configuracoes voltam corretamente.
- Falha de backup aparece na Central.

## 9. Monitoramento Permanente

### Entrega

Cada instalacao deve enviar para a Central:

- Health da API.
- Health do web.
- Health do banco.
- Health do Redis.
- Health do MediaMTX.
- Health da IA.
- Uso de CPU.
- Uso de RAM.
- Uso de disco.
- Containers ativos.
- Cameras online/offline.
- Status de gravacao.
- Status de live.
- Erros recentes.

### Criterio De Conclusao

- Central detecta falhas automaticamente.
- Central mostra instalacao degradada sem acao humana.
- Alertas possuem causa provavel e acao automatica sugerida.

## 10. Autocorrecao

### Entrega

- Reiniciar stream travado.
- Reabrir RTSP.
- Recriar path MediaMTX.
- Reiniciar container somente quando necessario.
- Alternar perfil de live quando instabilidade persistir.
- Limpar gravacoes antigas quando disco estiver critico.
- Suspender novas gravacoes quando disco estiver em risco extremo.

### Criterio De Conclusao

- Falhas simuladas sao detectadas.
- Sistema tenta correcao automatica.
- Central registra acao tomada.
- Se a correcao falhar, instalacao muda para **Atencao** ou **Bloqueado**.

## 11. Politica Comercial

### Entrega

- Central controla status da licenca.
- Instalacao consulta politica periodicamente.
- Bloqueio nao apaga dados.
- Bloqueio nao corrompe gravacoes.
- Desbloqueio reativa servicos automaticamente.

### Comportamento Em Bloqueio

- Parar novas gravacoes.
- Manter acesso restrito.
- Mostrar aviso neutro e amigavel.
- Manter playback conforme politica definida.
- Nao usar mensagem agressiva como "pagar conta".

### Criterio De Conclusao

- Bloqueio remoto funciona.
- Desbloqueio remoto funciona.
- Estado comercial aparece na Central.
- Sistema nao perde configuracao apos bloqueio/desbloqueio.

## 12. UX Final

### Entrega

- Marca padronizada como DRAC VMS.
- Remover termos tecnicos de telas operacionais.
- Cadastro de camera simples.
- Configuracoes avancadas recolhidas.
- Estados de erro amigaveis.
- Acoes perigosas bem separadas.
- Live limpa.
- Cameras com acoes essenciais.

### Criterio De Conclusao

- Operador comum usa o sistema sem entender RTSP path, ONVIF token, subtype ou codec.
- Fluxos principais ficam claros:
  - abrir live;
  - cadastrar camera;
  - ver gravacao;
  - buscar playback;
  - entender falha de camera.

## 13. Teste Final Automatizado

### Entrega

Comando criado:

```bash
./scripts/production-readiness.sh
```

### O Script Deve Testar

- API.
- Web.
- Banco.
- Redis.
- MediaMTX.
- IA.
- Central connector.
- Licenca.
- Firewall.
- Backup.
- Restore.
- Camera real ou mock.
- Live.
- Gravacao curta.
- Playback.

### Criterio Final

O script deve retornar:

- **Pronto** quando todos os checks obrigatorios passarem.
- **Atencao** quando houver problema nao critico.
- **Bloqueado** quando houver falha critica.

### Status Atual

- Script criado em `scripts/production-readiness.sh`.
- Instalador automatico executa o script ao final.
- O script valida:
  - comandos basicos;
  - `.env` e permissoes;
  - segredos obrigatorios;
  - conector Central;
  - containers essenciais;
  - API;
  - Web;
  - Postgres;
  - Redis;
  - AI service;
  - MediaMTX;
  - disco;
  - backup local do Postgres;
  - exposicao publica de Postgres/Redis;
  - ausencia de Docker socket na API;
  - origem HLS/WebRTC do MediaMTX;
  - heartbeat/licenca na Central.

Pendencias para versao final do teste:

- teste ativo de live por camera;
- teste ativo de gravacao curta;
- teste ativo de playback;
- restore automatizado em banco temporario;
- relatorio enviado para a Central como parte do heartbeat.

### Execucao Inicial

Executado nesta primeira etapa:

- `scripts/production-readiness.sh` criado.
- Instalador passou a executar o readiness ao final.
- Readiness passou a validar perfis de camera:
  - WebRTC;
  - liveSubtype/main stream;
  - live 1280x720;
  - gravacao habilitada;
  - gravacao em main stream;
  - preferencia H.265/HEVC;
  - analyticsSubtype separado;
  - IA habilitada.
- API passou a iniciar automaticamente gravacoes continuas habilitadas.
- Heartbeat da Central passou a enviar:
  - `productionReadiness`;
  - contagem de gravacoes recentes;
  - contagem runtime de gravacoes ativas;
  - perfil operacional das cameras;
  - resumo de IA;
  - resumo de seguranca MediaMTX/CORS.
- Instalacao atual validada com readiness `Pronto`.

## Definicao De 100%

O DRAC VMS so deve ser considerado **100% pronto para producao** quando:

- instalacao limpa passar sem acao manual;
- Central registrar e monitorar automaticamente;
- cameras forem provisionadas com poucos campos;
- live WebRTC estiver estavel;
- gravacao e playback forem validados;
- IA estiver isolada da live;
- backup e restore forem testados;
- seguranca passar nos checks;
- politica comercial funcionar;
- UX final estiver limpa;
- `production-readiness.sh` retornar **Pronto**.
