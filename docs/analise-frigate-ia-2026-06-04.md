# Analise da IA do Frigate para evolucao do DRAC

Data: 2026-06-04

Escopo: analise local do codigo em `concorrentes/frigate`, sem implementar mudancas no DRAC. O objetivo e registrar como o Frigate organiza deteccao, modelos, eventos, busca, enriquecimentos e UX para servir de base a uma pagina central de IA no DRAC.

## Conclusao executiva

O Frigate nao tem uma pagina unica chamada "IA". A inteligencia esta distribuida em:

- pipeline backend de deteccao/tracking/eventos;
- configuracoes globais e por camera;
- paginas de Review, Explore, Settings, Classification, Faces, Chat e Debug;
- enriquecimentos opcionais como face, LPR, semantic search, GenAI, classificacao customizada e audio.

Para o DRAC, a melhor decisao de produto nao e copiar essa fragmentacao. O ideal e usar a maturidade tecnica do Frigate como referencia e criar uma pagina central chamada, por exemplo, **Inteligencia**, com abas internas para status, cameras, modelos, classes, zonas, eventos, busca, debug e desempenho.

## Arquivos principais analisados

Backend:

- `concorrentes/frigate/frigate/config/config.py`
- `concorrentes/frigate/frigate/config/camera/camera.py`
- `concorrentes/frigate/frigate/config/camera/detect.py`
- `concorrentes/frigate/frigate/config/camera/objects.py`
- `concorrentes/frigate/frigate/config/camera/review.py`
- `concorrentes/frigate/frigate/config/camera/zone.py`
- `concorrentes/frigate/frigate/config/classification.py`
- `concorrentes/frigate/frigate/detectors/detector_config.py`
- `concorrentes/frigate/frigate/detectors/detection_api.py`
- `concorrentes/frigate/frigate/detectors/detector_types.py`
- `concorrentes/frigate/frigate/detectors/plugins/openvino.py`
- `concorrentes/frigate/frigate/detectors/plugins/onnx.py`
- `concorrentes/frigate/frigate/detectors/plugins/cpu_tfl.py`
- `concorrentes/frigate/frigate/detectors/plugins/edgetpu_tfl.py`
- `concorrentes/frigate/frigate/detectors/plugins/tensorrt.py`
- `concorrentes/frigate/frigate/detectors/plugins/hailo8l.py`
- `concorrentes/frigate/frigate/detectors/plugins/rknn.py`
- `concorrentes/frigate/frigate/object_detection/base.py`
- `concorrentes/frigate/frigate/video/detect.py`
- `concorrentes/frigate/frigate/track/norfair_tracker.py`
- `concorrentes/frigate/frigate/track/tracked_object.py`
- `concorrentes/frigate/frigate/track/object_processing.py`
- `concorrentes/frigate/frigate/camera/state.py`
- `concorrentes/frigate/frigate/review/review.py`
- `concorrentes/frigate/frigate/review/maintainer.py`
- `concorrentes/frigate/frigate/api/event.py`
- `concorrentes/frigate/frigate/api/review.py`
- `concorrentes/frigate/frigate/api/motion_search.py`
- `concorrentes/frigate/frigate/api/classification.py`
- `concorrentes/frigate/frigate/embeddings/maintainer.py`
- `concorrentes/frigate/frigate/data_processing/real_time/api.py`
- `concorrentes/frigate/frigate/data_processing/post/api.py`
- `concorrentes/frigate/frigate/genai/manager.py`
- `concorrentes/frigate/frigate/api/chat.py`

Frontend:

- `concorrentes/frigate/web/src/App.tsx`
- `concorrentes/frigate/web/src/pages/Events.tsx`
- `concorrentes/frigate/web/src/pages/Explore.tsx`
- `concorrentes/frigate/web/src/pages/ClassificationModel.tsx`
- `concorrentes/frigate/web/src/pages/Settings.tsx`
- `concorrentes/frigate/web/src/views/settings/DetectorsAndModelSettingsView.tsx`
- `concorrentes/frigate/web/src/views/settings/ObjectSettingsView.tsx`
- `concorrentes/frigate/web/src/views/settings/MasksAndZonesView.tsx`
- `concorrentes/frigate/web/src/views/settings/EnrichmentsSettingsView.tsx`
- `concorrentes/frigate/web/src/views/settings/FrigatePlusSettingsView.tsx`
- `concorrentes/frigate/web/src/views/settings/RegionGridSettingsView.tsx`
- `concorrentes/frigate/web/src/views/settings/MotionTunerView.tsx`
- `concorrentes/frigate/web/src/views/settings/TriggerView.tsx`
- `concorrentes/frigate/web/src/views/explore/ExploreView.tsx`
- `concorrentes/frigate/web/src/components/overlay/ObjectTrackOverlay.tsx`
- `concorrentes/frigate/web/src/components/overlay/DebugDrawingLayer.tsx`
- `concorrentes/frigate/web/src/views/classification/ModelSelectionView.tsx`
- `concorrentes/frigate/web/src/views/classification/ModelTrainingView.tsx`

Documentacao do Frigate consultada localmente:

- `concorrentes/frigate/docs/docs/configuration/object_detectors.md`
- `concorrentes/frigate/docs/docs/configuration/objects.md`
- `concorrentes/frigate/docs/docs/configuration/object_filters.md`
- `concorrentes/frigate/docs/docs/configuration/zones.md`
- `concorrentes/frigate/docs/docs/configuration/masks.md`
- `concorrentes/frigate/docs/docs/configuration/review.md`
- `concorrentes/frigate/docs/docs/configuration/semantic_search.md`
- `concorrentes/frigate/docs/docs/configuration/face_recognition.md`
- `concorrentes/frigate/docs/docs/configuration/license_plate_recognition.md`
- `concorrentes/frigate/docs/docs/frigate/video_pipeline.md`

## Como o Frigate organiza IA

### Rotas e paginas visiveis

No `App.tsx`, as rotas principais relacionadas direta ou indiretamente a IA sao:

- `/review`: triagem operacional de alertas, detections e motion.
- `/explore`: busca e exploracao por objetos/eventos, com filtros e semantic search quando habilitado.
- `/settings`: configuracoes de detector, modelo, objetos, zonas, mascaras, enriquecimentos e triggers.
- `/faces`: biblioteca de faces.
- `/classification`: classificacao customizada de objetos/estados.
- `/chat`: consulta conversacional com ferramentas de busca e eventos quando GenAI esta configurado.
- `/replay`: apoio tecnico/debug/replay.

Nao existe uma rota unica `/ai`. O Frigate trata IA como tecido do produto.

### Configuracao de modelo e detector

O Frigate separa:

- `detectors`: runtime/hardware de inferencia;
- `model`: modelo de deteccao e seu formato;
- `objects`: classes rastreadas e filtros;
- `detect`: resolucao/FPS/parametros de tracking por camera;
- `review`: o que vira alerta/detection operacional;
- `zones` e `masks`: regras espaciais.

Arquivos centrais:

- `detectors/detector_config.py`
- `config/config.py`
- `config/camera/detect.py`
- `config/camera/objects.py`

Tipos de modelo reconhecidos em `ModelTypeEnum`:

- `ssd`
- `yolox`
- `yolonas`
- `yolo-generic`
- `rfdetr`
- `dfine`

Runtimes/detectores plugaveis:

- `cpu`: TensorFlow Lite em CPU.
- `edgetpu`: Google Coral.
- `openvino`: CPU/GPU/NPU Intel e tambem AMD/CPU em alguns caminhos.
- `onnx`: ONNX Runtime com backends como CPU/GPU/OpenVINO/ROCm/TensorRT.
- `tensorrt`: NVIDIA/Jetson.
- `hailo8l`: acelerador Hailo.
- `rknn`: NPU Rockchip.
- outros plugins: MemryX, Synaptics, AXEngine, DeGirum, ZMQ IPC.

Padrao relevante: configuracao nova do Frigate usa OpenVINO CPU com modelo leve:

```yaml
detectors:
  ov:
    type: openvino
    device: CPU

model:
  path: /openvino-model/ssdlite_mobilenet_v2.xml
  labelmap_path: /openvino-model/coco_91cl_bkgr.txt
  width: 300
  height: 300
  input_tensor: nhwc
  input_pixel_format: bgr
```

Licao para o DRAC: ter um perfil inicial conservador e automatico, depois permitir perfis avancados por hardware.

### Pipeline de deteccao

Arquivo principal: `video/detect.py`.

Fluxo observado:

1. A camera envia frames para uma fila.
2. O processo por camera le frame YUV de memoria compartilhada.
3. Motion detector encontra regioes de interesse.
4. Regioes sao calculadas para objetos existentes, motion boxes, startup scan e grid.
5. O detector roda em regioes, nao necessariamente no frame inteiro.
6. As deteccoes sao convertidas para bbox no espaco do `detect.width` x `detect.height`.
7. Filtros por objeto sao aplicados.
8. Detecoes redundantes sao reduzidas.
9. Tracker atualiza objetos.
10. A fila publica objetos rastreados, motion boxes e regioes.

Essa arquitetura reduz CPU porque o modelo trabalha nas regioes relevantes.

Licoes para o DRAC:

- Manter `analyticsSubtype` separado foi correto.
- O proximo salto deve ser regioes por movimento/grid para evitar inferencia full-frame desnecessaria.
- O status da IA deve expor: frame source, detect FPS, inference FPS, regioes processadas, motion boxes, objetos ativos, fila e drops.

### Tracking e objetos estacionarios

Arquivo principal: `track/norfair_tracker.py`.

O Frigate usa Norfair com trackers por tipo:

- configuracao especial para `car`;
- configuracao especial para `license_plate`;
- configuracao especial para `person` em PTZ/autotracking;
- tracker default para demais objetos.

Pontos importantes:

- detecoes sao agrupadas por label;
- objetos de classes diferentes nao disputam o mesmo tracker;
- `min_initialized` evita criar track com uma deteccao unica;
- `max_disappeared` define tolerancia de desaparecimento;
- ha logica dedicada para objetos estacionarios;
- `motionless_count`, `position_changes` e `stationary_classifier` evitam gravar/eventar objeto parado de forma ruim;
- `estimate_velocity` e `path_data` sao preservados.

Licao para o DRAC: nao misturar pessoa, carro, moto e bicicleta no mesmo tracking sem parametros por classe. Para objetos rapidos, o DRAC deve ter TTL mais curto e tracking por classe.

### Falso positivo e score

Arquivo principal: `track/tracked_object.py`.

O Frigate nao decide apenas pelo score de um frame. Ele guarda historico e usa mediana:

- `score_history`;
- `computed_score = median(score_history)`;
- `threshold` por objeto em `objects.filters[label].threshold`;
- `min_score` para deteccoes individuais;
- uma vez verdadeiro positivo, tende a nao voltar a falso positivo facilmente.

Licao para o DRAC: separar score instantaneo de score consolidado. Para overlay ao vivo podemos usar bbox recente, mas para evento/notificacao devemos exigir score consolidado.

### Eventos, Review e severidade

Arquivos:

- `track/object_processing.py`
- `config/camera/review.py`
- `review/maintainer.py`
- `api/event.py`
- `api/review.py`

O Frigate separa:

- evento bruto de objeto rastreado;
- review segment para triagem;
- severidade `alert` ou `detection`;
- status de revisado por usuario;
- filtros por camera, label, zona, score, placa, atributos e periodo.

Padrao default:

- alertas: `person`, `car`;
- detections: labels opcionais ou todos;
- cutoff diferente para alerts e detections.

Licao para o DRAC: nao usar a mesma entidade para overlay, evento, alerta e auditoria. O overlay e instantaneo; evento e consolidado; alerta e regra operacional.

### Zonas, mascaras e coordenadas

Arquivos:

- `config/camera/zone.py`
- `views/settings/MasksAndZonesView.tsx`
- `components/settings/PolygonCanvas.tsx`
- `components/settings/ZoneEditPane.tsx`
- `components/settings/ObjectMaskEditPane.tsx`

Padroes:

- coordenadas salvas como relativas `0-1`;
- suporte a coordenadas antigas absolutas com migracao;
- zona pode ter objetos especificos;
- zona tem `inertia`;
- zona pode ter `loitering_time`;
- zona pode ter `speed_threshold` e `distances`;
- mascaras sao separadas entre motion mask e object filter mask.

Licao para o DRAC: zonas e mascaras precisam morar dentro da futura pagina de IA, mas com UX visual simples. Coordenadas relativas devem ser padrao.

### Debug visual

Arquivos:

- `camera/state.py`
- `views/settings/ObjectSettingsView.tsx`
- `components/overlay/DebugDrawingLayer.tsx`
- `components/overlay/ObjectTrackOverlay.tsx`

O Frigate tem debug para:

- bbox;
- timestamp;
- zonas;
- mask;
- motion boxes;
- regions;
- paths;
- lista de objetos ativos;
- score, ratio e area;
- audio detections quando habilitado.

Ponto forte: o debug usa a mesma referencia de `detect.width` e `detect.height`, reduzindo erro de escala.

Licao para o DRAC: criar um painel "Debug da IA" por camera com imagem analisada, bbox, track id, confidence, fonte do frame, escala, canvas e idade do snapshot.

### Explore, busca e semantic search

Arquivos:

- `pages/Explore.tsx`
- `views/explore/ExploreView.tsx`
- `api/event.py`
- `embeddings/maintainer.py`
- `views/settings/EnrichmentsSettingsView.tsx`
- `views/settings/TriggerView.tsx`

O Frigate oferece:

- busca por label, sub_label, atributos, placa, zona, score, velocidade e periodo;
- busca por similaridade quando semantic search esta ativo;
- reindexacao;
- triggers semanticos por camera;
- atualizacao por websocket.

Licao para o DRAC: para superar Frigate sem começar pesado, criar primeiro busca operacional por classe/camera/tempo/zona/status. Semantic search fica em fase posterior.

### Enriquecimentos

Arquivos:

- `config/classification.py`
- `embeddings/maintainer.py`
- `data_processing/real_time/*`
- `data_processing/post/*`
- `views/settings/EnrichmentsSettingsView.tsx`

O Frigate trata como enriquecimentos:

- face recognition;
- license plate recognition;
- bird classification;
- custom classification;
- semantic search;
- GenAI descriptions;
- audio transcription.

Arquitetura:

- processadores em tempo real recebem frame/objeto;
- post-processors trabalham ao fim do evento, em gravações ou snapshots;
- um maintainer central decide quais processadores iniciar com base na config.

Licao para o DRAC: criar `ai-service` modular por capacidades. Nao misturar YOLO, LPR, face e GenAI no mesmo bloco de codigo ou na mesma tela sem separacao.

### Classification customizada

Arquivos:

- `pages/ClassificationModel.tsx`
- `views/classification/ModelSelectionView.tsx`
- `views/classification/ModelTrainingView.tsx`
- `api/classification.py`

O Frigate permite:

- modelos customizados de objeto;
- modelos customizados de estado;
- dataset por categoria;
- selecao de exemplos;
- treinamento;
- status de treinamento via websocket.

Licao para o DRAC: nao precisa entrar agora, mas a pagina de IA deve reservar arquitetura para "classificadores" futuros.

### Chat e GenAI

Arquivos:

- `genai/manager.py`
- `api/chat.py`
- `genai/prompts.py`
- `data_processing/post/object_descriptions.py`
- `data_processing/post/review_descriptions.py`

O Frigate separa GenAI por roles:

- chat;
- descriptions;
- embeddings.

O manager cria clientes sob demanda. O chat pode usar ferramentas para buscar eventos e objetos.

Licao para o DRAC: se um dia tivermos assistente, ele deve consultar APIs de eventos, cameras, timeline e auditoria, nao acessar banco diretamente.

## Pontos fortes do Frigate que devemos copiar

1. Separacao clara entre detector, modelo, objetos, zonas, eventos e review.
2. Tracking por classe, evitando misturar pessoa/carro/moto/bicicleta.
3. Debug visual rico com bbox, regioes, motion, zones e paths.
4. Coordenadas relativas em zonas/mascaras.
5. Event/review separados do overlay ao vivo.
6. `score_history` e mediana para reduzir falso positivo.
7. Config global com override por camera.
8. Detect FPS nao precisa igualar FPS da camera.
9. Aviso quando detect FPS e alto demais.
10. Modelos e runtimes plugaveis.
11. Enriquecimentos opcionais, ativados por capacidade.
12. Busca por objetos com filtros fortes.
13. Semantic triggers como camada avancada, nao base obrigatoria.
14. Frigate+ como ideia de modelos gerenciados/treinados.

## Pontos que nao devemos copiar diretamente

1. IA espalhada demais na UX. Para usuario final, isso vira labirinto.
2. Muita configuracao exposta para operador comum.
3. Dependencia de YAML/config editor como experiencia primaria.
4. Paginas avancadas demais para instalacoes simples.
5. Varios recursos de IA no mesmo produto podem confundir suporte se ativados sem perfis.

## Proposta para o DRAC: pagina Inteligencia

Rota sugerida:

```text
/inteligencia
```

Nome visivel:

```text
Inteligencia
```

Permissao:

```text
aiManage / aiView
```

### Estrutura da pagina

Abas recomendadas:

1. **Visao geral**
   - status global da IA;
   - modelo ativo;
   - runtime ativo;
   - cameras com IA ligada;
   - objetos detectados hoje;
   - alertas/detections recentes;
   - CPU/RAM/fila/drops/latencia.

2. **Cameras**
   - lista de cameras;
   - IA ligada/desligada;
   - fonte analytics;
   - codec/resolucao/FPS recebido pela IA;
   - capture FPS;
   - inference FPS;
   - frame age medio;
   - classes ativas;
   - status do overlay.

3. **Modelo e hardware**
   - perfil atual: leve, equilibrado, agressivo, custom;
   - modelo;
   - runtime: OpenVINO CPU/GPU/NPU, ONNX, TensorRT futuro;
   - input size;
   - precision;
   - threads/workers;
   - validacao de compatibilidade.

4. **Classes e filtros**
   - person, bicycle, car, motorcycle etc.;
   - threshold por classe;
   - min area/min height;
   - filtro por ratio;
   - mostrar diferenca entre overlay e evento.

5. **Zonas e mascaras**
   - editor visual por camera;
   - zonas de interesse;
   - areas ignoradas;
   - filtros por classe dentro da zona;
   - coordenadas relativas.

6. **Eventos e review**
   - eventos recentes de IA;
   - severidade: info/detection/alert;
   - revisado/nao revisado;
   - filtros por classe/camera/periodo/zona;
   - eventos separados de overlay ao vivo.

7. **Debug**
   - frame analisado;
   - bbox;
   - track id;
   - confidence;
   - source URL sanitizada;
   - frameWidth/frameHeight;
   - video/canvas/display size;
   - snapshotAge;
   - lost/TTL;
   - logs recentes.

8. **Avancado**
   - exportar diagnostico;
   - reiniciar IA;
   - limpar estado de tracks;
   - baixar amostra de frames;
   - validar modelo;
   - modo teste por camera.

## Proposta de arquitetura DRAC inspirada no Frigate

### Backend/API

Criar ou evoluir endpoints:

```text
GET    /ai/status
GET    /ai/cameras
GET    /ai/cameras/:cameraId/status
PATCH  /ai/cameras/:cameraId/settings
GET    /ai/models
POST   /ai/models/validate
GET    /ai/events
GET    /ai/events/summary
GET    /ai/debug/:cameraId/latest-frame
GET    /ai/debug/:cameraId/latest-detections
POST   /ai/debug/:cameraId/reset-tracks
GET    /ai/health
```

Separar entidades:

- `AiModelProfile`
- `AiCameraSettings`
- `AiDetectionSnapshot`
- `AiTrackState`
- `AiEvent`
- `AiReviewItem`
- `AiZone`
- `AiMask`
- `AiRuntimeMetric`

### AI service

Modulos sugeridos:

- `capture`: RTSP direto da camera, latest-frame-only.
- `preprocess`: resize/letterbox/normalizacao.
- `detector`: YOLO/OpenVINO/ONNX etc.
- `tracker`: por classe.
- `overlay_state`: estado instantaneo e TTL curto.
- `event_builder`: consolida eventos com score historico.
- `debug_frame`: gera imagem com bbox/regioes/track id.
- `metrics`: FPS, latencia, drops, frame age.

### Frontend

Componentes sugeridos:

- `AiOverviewPage`
- `AiCameraTable`
- `AiCameraStatusDrawer`
- `AiModelProfileCard`
- `AiClassesEditor`
- `AiZoneMaskEditor`
- `AiEventsReviewList`
- `AiDebugFramePanel`
- `AiMetricsPanel`
- `AiDiagnosticsExportButton`

## Ondas de implementacao recomendadas

### Onda 1: base de status e UX

Objetivo: criar pagina `Inteligencia` sem mexer no modelo.

Entregas:

- rota protegida;
- visao geral;
- cards de status;
- lista de cameras com IA;
- consumo de endpoints atuais;
- diagnostico basico;
- nenhum ajuste no YOLO.

### Onda 2: settings por camera

Objetivo: controlar IA sem formulario de engenheiro.

Entregas:

- ligar/desligar IA por camera;
- escolher perfil: desativado, leve, equilibrado, agressivo;
- mostrar fonte analytics;
- mostrar codec/resolucao/FPS recebidos;
- salvar configuracao.

### Onda 3: classes e filtros

Objetivo: suportar pessoa/carro/moto/bicicleta de forma controlada.

Entregas:

- classes configuraveis;
- thresholds por classe;
- filtros min area/min height;
- separar overlay de evento;
- tracking por classe.

### Onda 4: debug visual

Objetivo: nunca mais diagnosticar overlay no escuro.

Entregas:

- frame analisado pelo backend;
- bbox/track/confidence desenhados;
- informacoes de escala;
- snapshotAge/frameAge;
- latencia e drops;
- exportar diagnostico.

### Onda 5: zonas e mascaras

Objetivo: regras visuais simples.

Entregas:

- editor por camera;
- zonas relativas;
- mascaras de objeto;
- filtros por classe/zona.

### Onda 6: eventos/review

Objetivo: transformar deteccoes em triagem operacional.

Entregas:

- evento consolidado;
- review com detection/alert;
- filtros por camera/classe/zona/periodo;
- status revisado;
- separacao clara de overlay e evento.

### Onda 7: modelos/runtimes avancados

Objetivo: preparar o DRAC para superar Frigate em UX.

Entregas:

- perfis OpenVINO CPU;
- validacao de modelo;
- futuro ONNX/TensorRT;
- sugestao automatica por hardware;
- import/export de perfil.

## Regras de produto para nao repetir problemas antigos

1. Overlay nao pode depender de evento de banco.
2. Evento nao pode depender de TTL visual.
3. Bbox deve sempre declarar seu espaco de coordenadas.
4. Frontend deve conhecer frameWidth/frameHeight do backend.
5. Canvas/overlay deve respeitar object-fit e padding/crop.
6. Track deve ser por classe.
7. Pessoa/carro/moto/bike nao devem disputar o mesmo ID.
8. Se objeto rapido sumir, overlay deve desaparecer rapido em vez de ficar fantasma.
9. Detect FPS deve ser configurado por perfil, nao por FPS da camera.
10. Usuario comum nao deve ver modelo, tensor, letterbox, NMS ou class id por padrao.

## Prioridade recomendada para o DRAC

Antes de melhorar modelos, criar a pagina e a estrutura. Sem UX e diagnostico, qualquer troca de YOLO/OpenVINO vira tentativa no escuro.

Ordem recomendada:

1. `Inteligencia` com status e cameras.
2. Debug visual por camera.
3. Classes/filtros por perfil.
4. Tracking por classe e overlay TTL curto.
5. Eventos/review separados.
6. Zonas/mascaras.
7. Modelos/runtimes avancados.

## Decisao sugerida

Quando a implementacao for autorizada, comecar pela **Onda 1** e **Onda 4** juntas:

- a pagina aparece para o usuario;
- o debug tecnico fica disponivel imediatamente;
- nao mexe ainda em YOLO, OpenVINO ou tracking;
- cria base para diagnosticar com seguranca antes de ajustes agressivos.

