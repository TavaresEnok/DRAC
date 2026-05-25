# Plano de Execucao Completo - VMS NexusGuard/DRAC

Data base: 2026-05-05

Objetivo: transformar o sistema em uma plataforma VMS/NVR profissional, confiavel e competitiva de ponta a ponta, com todas as funcionalidades criticas funcionando com dados reais, operacao auditavel, UX consistente com o mockup e base tecnica pronta para escala.

Regra de acompanhamento:
- Marcar cada caixa somente quando a entrega estiver implementada, testada e validada em ambiente real.
- Toda fase deve terminar com build, deploy local, teste funcional guiado, atualizacao deste documento e registro de riscos remanescentes.
- Nada deve ser tratado como concluido se ainda depender de dado fake, mock visual ou comportamento apenas prototipado.
- Padrao visual de concluido: `- [x] <span style="color:#16a34a;">Item concluido</span>`.

## Ordem Das Fases

- [ ] Fase 1: Motor de alarmes real e notificacoes operacionais.
- [ ] Fase 2: Playback, investigacao e evidencia forense.
- [ ] Fase 3: PTZ profissional e controle de dispositivos.
- [ ] Fase 4: Saude operacional, gravacao e confiabilidade.
- [ ] Fase 5: Seguranca enterprise e governanca.
- [ ] Fase 6: UX final, mockup 100% e operacao diaria.
- [ ] Fase 7: DevOps, qualidade, backup e observabilidade.
- [ ] Fase 8: Analytics de video real com IA.

## Progresso Geral

- Referencia de medicao: 2026-05-06.
- Itens concluidos no checklist: 147 de 340.
- Percentual total concluido: 43,2%.
- Percentual restante para 100%: 56,8%.

## Principios Tecnicos

- [ ] Backend principal em NestJS + TypeScript segue sendo a API de dominio, auth, auditoria, regras, playback, investigacao e administracao.
- [ ] Camera Worker em Go segue responsavel por gravacao, health-check pesado, FFmpeg e funcoes de camera que exigem processo continuo.
- [ ] PostgreSQL segue como fonte de verdade para cameras, usuarios, eventos, alarmes, investigacoes, gravacoes e auditoria.
- [ ] Redis + BullMQ ficam para filas de thumbnails, notificacoes, limpeza, alarmes, health-checks e tarefas demoradas.
- [ ] React + Vite segue como console operacional, sem dados inventados em telas de producao.
- [ ] Python + FastAPI permanece opcionalmente provisionado em ambiente de desenvolvimento, mas so entra em operacao produtiva na Fase 8 apos estabilizacao de camera/gravacao/alarmes/playback.
- [ ] Docker Compose segue como deploy inicial, com caminho claro para producao mais robusta.

## Fase 1 - Motor De Alarmes Real E Notificacoes Operacionais

Meta: substituir alertas visuais e cards falsos por um motor real de alarmes, com regras, ciclo de vida, notificacoes e auditoria.

### Modelagem E Backend

- [ ] Revisar modelos existentes `AlarmRule` e `AlarmInstance` e mapear lacunas.
- [ ] Criar ou completar modelo de `NotificationTarget` para email, webhook e futuros canais.
- [ ] Criar ou completar modelo de `AlarmAction` para acoes automatizadas.
- [ ] Criar campos de regra: nome, escopo, cameras, areas, severidade, fonte, condicoes, horario ativo, cooldown e status.
- [ ] Criar campos de instancia: regra, camera, evento origem, estado, severidade, primeira ocorrencia, ultima ocorrencia, contador, reconhecido por, resolvido por e timestamps.
- [ ] Implementar avaliador de regras no backend.
- [x] <span style="color:#16a34a;">Integrar avaliador com eventos reais de camera, stream, gravacao, movimento e health-check.</span>
- [x] <span style="color:#16a34a;">Implementar deduplicacao por camera/regra/janela de tempo.</span>
- [x] <span style="color:#16a34a;">Implementar cooldown configuravel por regra.</span>
- [x] <span style="color:#16a34a;">Implementar estados `OPEN`, `ACKED`, `RESOLVED` e suporte a silenciamento (`snooze`) via metadata + timeline de transicoes.</span>
- [x] <span style="color:#16a34a;">Implementar historico de transicoes de estado.</span>
- [x] <span style="color:#16a34a;">Implementar endpoint para listar regras.</span>
- [x] <span style="color:#16a34a;">Implementar endpoint para criar regra.</span>
- [x] <span style="color:#16a34a;">Implementar endpoint para editar regra.</span>
- [x] <span style="color:#16a34a;">Implementar endpoint para ativar/desativar regra.</span>
- [x] <span style="color:#16a34a;">Implementar endpoint para simular regra contra evento de teste.</span>
- [x] <span style="color:#16a34a;">Implementar endpoint para reconhecer alarme.</span>
- [x] <span style="color:#16a34a;">Implementar endpoint para resolver alarme.</span>
- [x] <span style="color:#16a34a;">Implementar endpoint para silenciar alarme temporariamente.</span>
- [x] <span style="color:#16a34a;">Implementar endpoint para comentarios/notas em alarme.</span>

### Notificacoes

- [x] <span style="color:#16a34a;">Implementar fila BullMQ para envio de notificacoes.</span>
- [x] <span style="color:#16a34a;">Implementar webhook com retry, timeout e registro de falha.</span>
- [x] <span style="color:#16a34a;">Implementar email SMTP configuravel.</span>
- [x] <span style="color:#16a34a;">Implementar templates basicos de notificacao em PT-BR.</span>
- [x] <span style="color:#16a34a;">Implementar politica de escalonamento por severidade.</span>
- [x] <span style="color:#16a34a;">Implementar supressao basica de notificacoes repetidas por dedupe de job.</span>
- [x] <span style="color:#16a34a;">Registrar toda tentativa de notificacao em auditoria.</span>
- [x] <span style="color:#16a34a;">Exibir status de entrega na tela de alarmes.</span>

### Frontend

- [ ] Remover cards de alerta que ainda dependem de dados inventados.
- [x] <span style="color:#16a34a;">Tela `/alarms` deve listar apenas alarmes reais.</span>
- [x] <span style="color:#16a34a;">Criar editor de regras com formulario completo.</span>
- [x] <span style="color:#16a34a;">Adicionar filtros por camera, area, severidade, estado e periodo.</span>
- [x] <span style="color:#16a34a;">Adicionar painel de detalhes do alarme com timeline de eventos/transicoes.</span>
- [x] <span style="color:#16a34a;">Adicionar botoes reais de reconhecer e resolver.</span>
- [x] <span style="color:#16a34a;">Mostrar contadores reais no dashboard.</span>
- [x] <span style="color:#16a34a;">Exibir falhas de notificacao com mensagem clara.</span>
- [x] <span style="color:#16a34a;">Garantir textos 100% PT-BR para usuario final.</span>

### Criterios De Aceite

- [x] <span style="color:#16a34a;">Um evento real de camera gera alarme quando regra ativa combinar.</span>
- [x] <span style="color:#16a34a;">Um evento fora da regra nao gera alarme.</span>
- [x] <span style="color:#16a34a;">Cooldown impede tempestade de alarmes repetidos.</span>
- [x] <span style="color:#16a34a;">Acknowledgement e resolve persistem no banco e aparecem no audit log.</span>
- [x] <span style="color:#16a34a;">Webhook/email sao disparados por fila, com registro de sucesso/falha.</span>
- [x] <span style="color:#16a34a;">Dashboard e `/alarms` nao exibem dados fake.</span>
- [x] <span style="color:#16a34a;">Build API e Web passam.</span>

## Fase 2 - Playback, Investigacao E Evidencia Forense

Meta: transformar playback e investigation em fluxo forense real, com multi-camera, bookmarks, exportacao, cadeia de custodia e evidencia verificavel.

### Playback Real

- [x] <span style="color:#16a34a;">Validar endpoint `/recordings` por camera, data, periodo e ordenacao.</span>
- [x] <span style="color:#16a34a;">Validar que `fileExists` reflete arquivo real no disco.</span>
- [x] <span style="color:#16a34a;">Exibir aviso claro quando registro existe no banco mas arquivo nao existe.</span>
- [x] <span style="color:#16a34a;">Melhorar player para troca direta/compatibilidade com status visivel.</span>
- [x] <span style="color:#16a34a;">Implementar timeline com gaps reais de gravacao.</span>
- [x] <span style="color:#16a34a;">Implementar busca por horario exato.</span>
- [x] <span style="color:#16a34a;">Implementar selecao de segmento pela timeline.</span>
- [ ] Implementar playback sincronizado multi-camera.
- [x] <span style="color:#16a34a;">Implementar controle de velocidade por camera.</span>
- [x] <span style="color:#16a34a;">Implementar audio no playback quando existir stream de audio.</span>
- [x] <span style="color:#16a34a;">Implementar snapshot do frame atual.</span>
- [x] <span style="color:#16a34a;">Implementar download da gravacao original.</span>
- [x] <span style="color:#16a34a;">Implementar diagnostico de codec por gravacao.</span>
- [x] <span style="color:#16a34a;">Implementar indicador de gravacao em transcodificacao compatvel.</span>

### Clips E Exportacao

- [x] <span style="color:#16a34a;">Exportar clip por intervalo real de segundos.</span>
- [x] <span style="color:#16a34a;">Permitir exportar clip de uma camera.</span>
- [ ] Permitir exportar pacote multi-camera sincronizado.
- [x] <span style="color:#16a34a;">Permitir nome e descricao do clip.</span>
- [x] <span style="color:#16a34a;">Salvar hash do arquivo exportado.</span>
- [x] <span style="color:#16a34a;">Salvar tamanho, duracao e origem do clip exportado.</span>
- [x] <span style="color:#16a34a;">Proteger clips vinculados a investigacao contra limpeza automatica.</span>
- [x] <span style="color:#16a34a;">Permitir download de clip exportado.</span>
- [x] <span style="color:#16a34a;">Registrar exportacao em audit log.</span>

### Investigation / Case Lifecycle

- [x] <span style="color:#16a34a;">Criar estados de caso: aberto, em revisao, aguardando aprovacao, fechado e arquivado.</span>
- [x] <span style="color:#16a34a;">Implementar criacao e edicao completa de investigation.</span>
- [x] <span style="color:#16a34a;">Adicionar camera, evento, gravacao, clip, snapshot e bookmark ao caso.</span>
- [x] <span style="color:#16a34a;">Implementar bookmarks reais com timestamp e camera.</span>
- [x] <span style="color:#16a34a;">Implementar notas com usuario e horario.</span>
- [x] <span style="color:#16a34a;">Implementar trilha de atividade do caso.</span>
- [x] <span style="color:#16a34a;">Implementar responsavel e participantes.</span>
- [x] <span style="color:#16a34a;">Implementar prioridade e classificacao.</span>
- [x] <span style="color:#16a34a;">Implementar busca por caso.</span>
- [x] <span style="color:#16a34a;">Implementar filtros por estado no lifecycle e selecao de investigation.</span>
- [x] <span style="color:#16a34a;">Implementar relatorio do caso em PDF ou HTML exportavel.</span>

### Evidencia E Cadeia De Custodia

- [x] <span style="color:#16a34a;">Vincular evidencia a caso.</span>
- [x] <span style="color:#16a34a;">Gerar hash HMAC/assinatura de evidencia.</span>
- [x] <span style="color:#16a34a;">Verificar integridade de evidencia.</span>
- [x] <span style="color:#16a34a;">Registrar toda visualizacao, download e exportacao.</span>
- [x] <span style="color:#16a34a;">Adicionar campo de motivo para exportacao/download sensivel.</span>
- [x] <span style="color:#16a34a;">Implementar legal hold por caso/evidencia.</span>
- [x] <span style="color:#16a34a;">Exibir cadeia de custodia de forma compreensivel no front.</span>

### Criterios De Aceite

- [x] <span style="color:#16a34a;">Operador escolhe camera e data e consegue assistir gravacao real.</span>
- [x] <span style="color:#16a34a;">Gaps de gravacao aparecem corretamente.</span>
- [x] <span style="color:#16a34a;">Clip exportado toca fora do sistema.</span>
- [x] <span style="color:#16a34a;">Clip pode ser anexado a investigation.</span>
- [x] <span style="color:#16a34a;">Bookmark salva timestamp correto e volta ao trecho correto.</span>
- [x] <span style="color:#16a34a;">Caso fechado fica auditado e rastreavel.</span>
- [x] <span style="color:#16a34a;">Evidencia exportada pode ser verificada.</span>

## Fase 3 - PTZ Profissional E Controle De Dispositivos

Meta: deixar PTZ no nivel esperado de VMS profissional, com presets, tours, diagnostico ONVIF e controles consistentes.

### ONVIF E Compatibilidade

- [ ] Mapear capabilities ONVIF por camera.
- [ ] Persistir suporte a pan, tilt, zoom, focus, iris e presets.
- [x] <span style="color:#16a34a;">Detectar automaticamente profile token correto (tentativas em cadeia).</span>
- [x] <span style="color:#16a34a;">Detectar endpoint ONVIF correto por camera (tentativas em cadeia).</span>
- [x] <span style="color:#16a34a;">Implementar tentativa com caminhos comuns de ONVIF.</span>
- [x] <span style="color:#16a34a;">Implementar logs sanitizados de comando PTZ.</span>
- [x] <span style="color:#16a34a;">Exibir erro real quando comando nao e aceito por endpoint PTZ.</span>
- [x] <span style="color:#16a34a;">Criar diagnostico PTZ por camera.</span>
- [ ] Separar credencial RTSP de credencial ONVIF quando necessario.

### Controles

- [x] <span style="color:#16a34a;">Implementar movimento continuo com start/stop confiavel.</span>
- [x] <span style="color:#16a34a;">Implementar step move para pequenos ajustes.</span>
- [x] <span style="color:#16a34a;">Implementar controle de velocidade.</span>
- [ ] Implementar zoom optico quando suportado.
- [x] <span style="color:#16a34a;">Manter zoom digital separado e claro no UI.</span>
- [ ] Implementar foco perto/longe quando suportado.
- [ ] Implementar iris quando suportado.
- [x] <span style="color:#16a34a;">Implementar home position.</span>
- [ ] Implementar presets criar, atualizar, renomear, chamar e excluir.
- [ ] Implementar tours/guard tours.
- [ ] Implementar patrulha programada por horario.

### UX

- [ ] Unificar controles PTZ em `/cameras/:id` e `/ptz`.
- [x] <span style="color:#16a34a;">Remover duplicacoes confusas.</span>
- [x] <span style="color:#16a34a;">Exibir estado de comando em tempo real.</span>
- [x] <span style="color:#16a34a;">Desabilitar controles nao suportados pela camera.</span>
- [x] <span style="color:#16a34a;">Adicionar botao de reconectar/retestar PTZ.</span>
- [x] <span style="color:#16a34a;">Exibir ultima resposta ONVIF de forma amigavel.</span>
- [ ] Garantir layout aderente ao mockup.

### Criterios De Aceite

- [ ] Camera com PTZ move em todas as direcoes suportadas.
- [ ] Stop sempre interrompe movimento.
- [ ] Preset criado pode ser chamado depois.
- [x] <span style="color:#16a34a;">Camera sem PTZ nao exibe controle enganoso.</span>
- [x] <span style="color:#16a34a;">Erro de senha/porta ONVIF aparece explicitamente.</span>

## Fase 4 - Saude Operacional, Gravacao E Confiabilidade

Meta: garantir que o sistema grave, monitore, recupere e prove saude operacional com confianca.

### Gravacao

- [x] <span style="color:#16a34a;">Confirmar gravacao continua por camera habilitada.</span>
- [x] <span style="color:#16a34a;">Implementar modos: continua, movimento, agenda e manual.</span>
- [ ] Implementar pre-event e post-event buffer.
- [ ] Implementar politicas por camera, grupo e site.
- [x] <span style="color:#16a34a;">Implementar alteracao de FPS/resolucao/bitrate aplicada sem reiniciar manualmente.</span>
- [x] <span style="color:#16a34a;">Implementar confirmacao por logs FFmpeg dos parametros aplicados.</span>
- [x] <span style="color:#16a34a;">Implementar deteccao de arquivo corrompido.</span>
- [ ] Implementar reparo ou marcacao de segmento ruim.
- [x] <span style="color:#16a34a;">Implementar relatorio de gaps.</span>
- [ ] Implementar protecao de gravacao marcada como evidencia.

### Storage

- [x] <span style="color:#16a34a;">Criar politica de retencao por camera.</span>
- [x] <span style="color:#16a34a;">Criar limpeza por politica, nao apenas global.</span>
- [x] <span style="color:#16a34a;">Implementar limite minimo de espaco livre.</span>
- [x] <span style="color:#16a34a;">Implementar alerta de storage quase cheio.</span>
- [x] <span style="color:#16a34a;">Implementar suporte planejado a NAS.</span>
- [ ] Implementar archive tier para evidencias antigas.
- [x] <span style="color:#16a34a;">Exibir uso por camera, dia e tipo de dado.</span>
- [ ] Exibir previsao de dias restantes.

### Health-Check

- [x] <span style="color:#16a34a;">Monitorar RTSP reachability.</span>
- [x] <span style="color:#16a34a;">Monitorar ONVIF reachability.</span>
- [x] <span style="color:#16a34a;">Monitorar stream live.</span>
- [x] <span style="color:#16a34a;">Monitorar gravacao em andamento.</span>
- [x] <span style="color:#16a34a;">Monitorar ultimo segmento criado.</span>
- [x] <span style="color:#16a34a;">Monitorar tamanho esperado de arquivo.</span>
- [x] <span style="color:#16a34a;">Monitorar FPS detectado versus configurado.</span>
- [x] <span style="color:#16a34a;">Monitorar audio detectado.</span>
- [x] <span style="color:#16a34a;">Monitorar latencia de live.</span>
- [x] <span style="color:#16a34a;">Implementar auto-reconnect com retry/backoff basico no fluxo de live.</span>
- [x] <span style="color:#16a34a;">Criar eventos reais de camera offline, sem sinal, sem gravacao e codec incompatvel.</span>

### Criterios De Aceite

- [x] <span style="color:#16a34a;">Se a camera cair, o sistema muda status e registra evento.</span>
- [x] <span style="color:#16a34a;">Se voltar, reconecta sem acao manual.</span>
- [x] <span style="color:#16a34a;">Se gravacao parar, alerta real e diagnostico aparecem.</span>
- [ ] Storage mostra dados reais e previsao util.
- [x] <span style="color:#16a34a;">Playback encontra arquivos criados pelo worker.</span>

## Fase 5 - Seguranca Enterprise E Governanca

Meta: tornar a plataforma segura para uso real em ambiente corporativo.

### Identidade E Acesso

- [ ] Revisar roles atuais.
- [ ] Implementar RBAC granular por acao e recurso.
- [ ] Implementar permissao por camera, grupo, area e site.
- [ ] Criar editor de roles real.
- [ ] Implementar MFA.
- [ ] Planejar SSO OIDC.
- [ ] Planejar SAML.
- [ ] Planejar LDAP/AD.
- [ ] Implementar politica de senha.
- [ ] Implementar bloqueio por tentativas de login.
- [ ] Implementar expiracao e renovacao segura de sessao.

### Segredos E Dados Sensiveis

- [ ] Criptografar senhas de camera com chave forte fora do repositorio.
- [x] <span style="color:#16a34a;">Remover segredos hardcoded do Docker Compose.</span>
- [x] <span style="color:#16a34a;">Garantir `.env` fora do Git.</span>
- [x] <span style="color:#16a34a;">Criar `.env.example` sem segredo real.</span>
- [ ] Auditar logs para nao expor senha ou token.
- [ ] Rotacionar chaves JWT e camera secret.
- [ ] Implementar backup seguro de configuracao.

### Auditoria

- [x] <span style="color:#16a34a;">Auditar login/logout.</span>
- [x] <span style="color:#16a34a;">Auditar criacao/edicao/exclusao de camera.</span>
- [x] <span style="color:#16a34a;">Auditar comandos PTZ.</span>
- [x] <span style="color:#16a34a;">Auditar playback sensivel.</span>
- [x] <span style="color:#16a34a;">Auditar download/exportacao.</span>
- [ ] Auditar alteracao de regra de alarme.
- [x] <span style="color:#16a34a;">Auditar alteracao de usuario.</span>
- [x] <span style="color:#16a34a;">Tornar auditoria pesquisavel por usuario, acao, alvo e data.</span>
- [x] <span style="color:#16a34a;">Implementar exportacao de auditoria.</span>

### Criterios De Aceite

- [ ] Usuario sem permissao nao acessa camera.
- [ ] Operador nao consegue acao administrativa.
- [ ] Segredos nao aparecem em Git, logs ou respostas da API.
- [ ] Toda acao sensivel gera audit log rastreavel.

## Fase 6 - UX Final, Mockup 100% E Operacao Diaria

Meta: entregar uma experiencia visual e operacional fiel ao mockup, sem adaptacoes grosseiras, com textos PT-BR e fluxos completos.

### Mockup E Consistencia

- [ ] Revalidar comparacao pagina por pagina com o mockup.
- [ ] Corrigir `/ptz` para aderir ao mockup sem quebrar funcao real.
- [ ] Corrigir `/playback` para aderir ao mockup sem perder player real.
- [ ] Corrigir `/reports` ou remover se ainda for mock sem valor.
- [ ] Corrigir `/cameras/:id`.
- [ ] Corrigir `/map`.
- [ ] Corrigir `/audit`.
- [ ] Corrigir `/investigation`.
- [ ] Corrigir `/cameras`.
- [ ] Corrigir `/dashboard`.
- [ ] Garantir layout responsivo desktop/mobile.
- [ ] Garantir que nenhum texto estoure container.
- [ ] Garantir que todos os textos visiveis ao usuario estejam em PT-BR.
- [ ] Garantir que nomes tecnicos necessarios nao sejam traduzidos indevidamente.

### Operacao De Cameras

- [x] <span style="color:#16a34a;">Wizard de camera com deteccao em tempo real.</span>
- [x] <span style="color:#16a34a;">Edicao completa de camera.</span>
- [x] <span style="color:#16a34a;">Exclusao com confirmacao clara.</span>
- [ ] Reconnect/retest no detalhe da camera.
- [ ] Diagnostico RTSP/ONVIF/PTZ no front.
- [x] <span style="color:#16a34a;">Campos de protocolo, codec, resolucao, FPS e bitrate com limites detectados.</span>
- [x] <span style="color:#16a34a;">Mensagem explicita quando valor for acima do maximo.</span>
- [ ] Mostrar audio detectado e audio habilitado separadamente.

### Estados De Interface

- [ ] Estado carregando padronizado.
- [ ] Estado vazio padronizado.
- [ ] Estado de erro com acao recomendada.
- [ ] Estado offline por camera.
- [ ] Estado sem permissao.
- [ ] Estado sem dados reais.
- [ ] Estado de operacao em andamento.
- [ ] Toasts claros e nao excessivos.

### Criterios De Aceite

- [ ] Cada pagina critica esta visualmente aderente ao mockup.
- [ ] Nenhuma pagina operacional depende de fake data.
- [ ] Operador entende o problema quando algo falha.
- [ ] Fluxos principais podem ser usados sem console/devtools.

## Fase 7 - DevOps, Qualidade, Backup E Observabilidade

Meta: deixar o sistema seguro para evoluir sem perder codigo, dados ou confianca operacional.

### Git E CI/CD

- [ ] Confirmar remoto GitHub configurado.
- [ ] Garantir `.gitignore` cobrindo `.env`, storage, dumps, logs e segredos.
- [ ] Criar fluxo de branches.
- [ ] Criar commits pequenos por pacote.
- [ ] Criar pipeline CI para lint/build/test.
- [ ] Criar checagem de Docker build.
- [ ] Criar processo de release.
- [ ] Criar rollback documentado.

### Testes

- [ ] Testes unitarios para services criticos.
- [ ] Testes de integracao para auth.
- [ ] Testes de integracao para cameras.
- [ ] Testes de integracao para alarmes.
- [ ] Testes de integracao para recordings.
- [ ] Testes E2E para login.
- [ ] Testes E2E para live.
- [ ] Testes E2E para playback.
- [ ] Testes E2E para PTZ com mock ONVIF quando camera real indisponivel.
- [ ] Testes E2E para investigation/export.

### Observabilidade

- [ ] Logs estruturados na API.
- [ ] Logs estruturados no camera worker.
- [ ] Correlation ID por requisicao.
- [ ] Metricas de API.
- [ ] Metricas de stream.
- [x] <span style="color:#16a34a;">Metricas de gravacao.</span>
- [ ] Metricas de filas.
- [ ] Dashboard de saude operacional.
- [ ] Alertas internos para falha de worker/API/DB/Redis.

### Backup E Restore

- [ ] Backup do PostgreSQL.
- [ ] Backup de configuracoes.
- [ ] Politica para gravacoes.
- [ ] Restore testado em ambiente limpo.
- [ ] Documentar RPO/RTO inicial.
- [ ] Criar script de verificacao de backup.

### Criterios De Aceite

- [ ] Novo deploy pode ser reproduzido por Docker Compose.
- [ ] Falha de build bloqueia merge.
- [ ] Backup restaura banco em ambiente limpo.
- [ ] Logs permitem diagnosticar live, gravacao, PTZ e alarmes.

## Fase 8 - Analytics De Video Real Com IA

Meta: implementar IA real depois que a base de camera, gravacao, alarmes, playback e investigacao estiver confiavel.

### Arquitetura IA

- [ ] Definir contrato entre NestJS e FastAPI.
- [ ] Definir eventos enviados para IA.
- [ ] Definir resultados retornados pela IA.
- [ ] Criar tabela de analytics metadata.
- [ ] Criar tabela de detections.
- [ ] Criar fila para jobs de inferencia.
- [ ] Criar controle de ativacao por camera.
- [ ] Criar limite de recursos por camera.
- [ ] Criar health-check do servico IA.
- [ ] Criar logs e metricas da IA.

### Deteccoes

- [ ] Movimento real com zonas.
- [ ] Pessoa.
- [ ] Veiculo.
- [ ] Placa/LPR.
- [ ] Intrusao em area.
- [ ] Cruzamento de linha.
- [ ] Permanencia/loitering.
- [ ] Objeto deixado/removido.
- [ ] Contagem de pessoas/veiculos.
- [ ] Classificacao de confianca por evento.

### Integracao Com VMS

- [ ] Converter deteccoes em eventos reais.
- [ ] Permitir regras de alarme baseadas em IA.
- [ ] Exibir deteccoes na timeline de playback.
- [ ] Permitir busca por pessoa, veiculo, placa e periodo.
- [ ] Anexar deteccoes a investigation.
- [ ] Exportar clip a partir de deteccao.
- [ ] Mostrar bounding boxes quando aplicavel.
- [ ] Permitir ajuste de sensibilidade por camera.
- [ ] Permitir zonas de inclusao/exclusao.

### Qualidade E Operacao IA

- [ ] Medir falso positivo por tipo de deteccao.
- [ ] Permitir feedback do operador.
- [ ] Implementar cooldown por deteccao.
- [ ] Implementar threshold por camera.
- [ ] Implementar modo teste antes de ativar alarme real.
- [ ] Documentar modelos usados e requisitos de hardware.
- [ ] Planejar GPU opcional.

### Criterios De Aceite

- [ ] Deteccao gera evento real com metadados.
- [ ] Evento de IA pode gerar alarme por regra.
- [ ] Playback mostra marcadores de IA no horario correto.
- [ ] Busca por evento de IA retorna resultados reais.
- [ ] Operador pode desativar ou ajustar IA por camera.

## Marcos De Entrega Recomendados

- [ ] Marco 1: alarmes reais + notificacoes basicas.
- [ ] Marco 2: playback/investigation forense pronto para operacao.
- [ ] Marco 3: PTZ profissional e diagnostico por camera.
- [ ] Marco 4: gravacao, storage e health-check confiaveis.
- [ ] Marco 5: seguranca enterprise e auditoria completa.
- [ ] Marco 6: UX 100% aderente ao mockup e PT-BR final.
- [ ] Marco 7: CI/CD, backup, testes e observabilidade.
- [ ] Marco 8: IA real integrada ao VMS.

## Indicadores De Progresso

- [x] <span style="color:#16a34a;">Percentual por fase atualizado semanalmente.</span>
- [ ] Bugs criticos abertos listados por fase.
- [ ] Funcionalidades mock/parciais revisadas ate zerar em telas criticas.
- [ ] Regressao de live/playback/PTZ testada antes de cada deploy.
- [ ] Toda entrega grande acompanhada de evidencia de teste.

## Definicao De "Sistema Completo"

- [ ] Todas as telas operacionais usam dados reais.
- [ ] Cameras podem ser adicionadas, editadas, diagnosticadas, reproduzidas e removidas.
- [ ] Live funciona com fallback de protocolo.
- [ ] Gravacao funciona e playback toca arquivos reais.
- [ ] Alarmes sao gerados por regras reais.
- [ ] Investigation preserva cadeia de custodia.
- [ ] PTZ opera recursos suportados pela camera.
- [x] <span style="color:#16a34a;">Storage e health-check denunciam falhas antes do operador descobrir manualmente.</span>
- [ ] Usuarios e permissoes protegem acesso por funcao.
- [ ] Logs, auditoria, backup e testes sustentam operacao continua.
- [ ] IA gera eventos reais e pesquisaveis quando chegar a Fase 8.
