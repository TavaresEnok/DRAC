import { StyleSheet } from 'react-native';
import { BOTTOM_SAFE, TOP_SAFE } from '../config';
import { C } from './colors';

export const styles = StyleSheet.create({

  // ── Layout base ─────────────────────────────────────────
  screen:  { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingTop: TOP_SAFE + 18, paddingBottom: BOTTOM_SAFE + 118, backgroundColor: C.bg },
  page:    { gap: 18 },
  disabled:{ opacity: 0.36 },

  // ── Dashboard ────────────────────────────────────────────
  dashboardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  dashboardTitle:    { color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.6 },
  dashboardSubtitle: { color: C.textSub, fontSize: 14, marginTop: 4, fontWeight: '600' },
  dashboardStatRow:  { flexDirection: 'row', gap: 8, marginTop: 8 },
  dashboardStat:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dashboardStatDot:  { width: 7, height: 7, borderRadius: 4 },
  dashboardStatText: { fontSize: 12, fontWeight: '700', color: C.textSub },
  previewLimitHint:  { color: C.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4, fontWeight: '700' },

  groupBlock:  { gap: 12, marginTop: 4 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  groupTitle:  { color: C.text, fontSize: 14, fontWeight: '900' },
  groupCount:  { color: C.textSub, fontSize: 12, fontWeight: '800' },

  // Câmera card (Dashboard) ─────────────────────────────────
  cameraCard:           { height: 210, borderRadius: 22, overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 16, elevation: 4 },
  cameraPreview:        { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: C.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cameraPreviewImage:   { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover' },
  cameraPreviewFallback:{ position: 'absolute', width: '100%', height: '100%', backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  cameraPreviewShade:   { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.12)' },
  cameraPreviewText:    { color: C.accent, fontSize: 12, fontWeight: '900', letterSpacing: 2 },

  // Badge online/offline sobre o card
  liveBadge:           { position: 'absolute', left: 14, top: 14, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 1 },
  liveBadgeOnline:     { backgroundColor: 'rgba(17,24,39,0.52)', borderColor: 'rgba(255,255,255,0.20)' },
  liveBadgeOffline:    { backgroundColor: 'rgba(239,68,68,0.18)', borderColor: 'rgba(239,68,68,0.36)' },
  liveDot:             { width: 7, height: 7, borderRadius: 4 },
  liveDotOnline:       { backgroundColor: C.success },
  liveDotOffline:      { backgroundColor: C.danger },
  liveBadgeText:       { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  liveBadgeTextOnline: { color: '#dcfce7' },
  liveBadgeTextOffline:{ color: '#fecdd3' },

  // Overlay inferior do card de câmera
  cameraOverlayBody:      { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5, paddingHorizontal: 16, paddingTop: 48, paddingBottom: 14 },
  cameraOverlayTextBlock: { flex: 1, paddingRight: 10 },
  cameraCardTop:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cameraName:             { color: '#fff', fontWeight: '900', fontSize: 17, flexShrink: 1, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 },
  cameraMeta:             { color: 'rgba(255,255,255,0.80)', fontSize: 12, marginTop: 2, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 },
  cardPlayButton:         { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', shadowColor: C.accent, shadowOpacity: 0.38, shadowRadius: 12, elevation: 6 },

  // ── Video Player (Live) ──────────────────────────────────
  videoPoster:       { position: 'absolute', width: '100%', aspectRatio: 16 / 9, resizeMode: 'cover', opacity: 0.72 },
  video:             { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  videoEmpty:        { alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: C.videoBg, aspectRatio: 16 / 9 },
  videoEmptyTitle:   { color: '#f8fafc', fontSize: 14, fontWeight: '900' },
  videoEmptyText:    { color: '#d1d5db', fontSize: 12, marginTop: 4, textAlign: 'center' },
  videoProtocol:     { color: '#fff', fontSize: 10, fontWeight: '900', backgroundColor: C.accent, borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },

  // ── LiveScreen ───────────────────────────────────────────
  cameraStage:          { gap: 14 },
  cameraDetailHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 2 },
  headerIconButton:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cameraDetailTitle:    { color: C.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  cameraDetailSubtitle: { color: C.accent, fontSize: 10, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.1, marginTop: 3 },

  // Player edge-to-edge (sem borda arredondada, sem borda lateral)
  singleVideoCard:       { backgroundColor: '#000', overflow: 'hidden', marginHorizontal: -16 },
  singleVideoTopOverlay: { position: 'absolute', left: 12, right: 12, top: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveNowText:           { color: '#d1fae5', fontSize: 11, fontWeight: '900', letterSpacing: 1.2, backgroundColor: 'rgba(0,0,0,0.64)', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },

  // Botões flutuantes sobre o vídeo (direita)
  liveVideoSideActions:      { position: 'absolute', right: 14, top: '30%', gap: 12, zIndex: 12 },
  liveVideoRoundAction:      { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(17,24,39,0.52)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  liveVideoRoundActionActive:{ backgroundColor: C.accent, borderColor: C.accent },

  // Controles inferiores sobre o vídeo
  liveVideoBottomControls: { position: 'absolute', left: 16, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 18, zIndex: 12 },
  liveSpeedText:           { color: '#fff', fontSize: 13, fontWeight: '900' },

  // PTZ overlay sobre o vídeo
  ptzVideoOverlay:         { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.50)', alignItems: 'center', justifyContent: 'center' },
  ptzOverlayClose:         { position: 'absolute', right: 14, top: 14, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.50)', alignItems: 'center', justifyContent: 'center' },
  ptzOverlayCloseText:     { color: '#fff', fontSize: 13, fontWeight: '900' },
  ptzOverlayTitle:         { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 18 },
  ptzOverlayFeedback:      { color: '#fff', fontSize: 10, fontWeight: '900', marginBottom: 10, backgroundColor: C.accentDark, borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  ptzOverlayDpad:          { width: 168, height: 168, borderRadius: 84, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  ptzOverlayButton:        { position: 'absolute', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  ptzOverlayButtonActive:  { backgroundColor: 'rgba(255,255,255,0.28)', transform: [{ scale: 0.92 }] },
  ptzOverlayButtonText:    { color: '#fff', fontSize: 30, fontWeight: '800' },
  ptzOverlayButtonTextActive:{ color: '#fff' },
  ptzOverlayUp:            { top: 8, left: 62 },
  ptzOverlayDown:          { bottom: 8, left: 62 },
  ptzOverlayLeft:          { left: 8, top: 62 },
  ptzOverlayRight:         { right: 8, top: 62 },
  ptzOverlayNub:           { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', alignItems: 'center', justifyContent: 'center' },
  ptzOverlayNubInner:      { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.55)' },

  // Quick actions (abaixo do player)
  quickActionsGrid:      { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  quickActionButton:     { flex: 1, alignItems: 'center', gap: 7 },
  quickActionIcon:       { width: 56, height: 56, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  quickActionIconActive: { backgroundColor: C.accent, borderColor: C.accent },
  quickActionLabel:      { color: C.textSub, fontSize: 12, fontWeight: '700' },
  quickActionSoon:       { color: C.textMuted, fontSize: 9, fontWeight: '800', marginTop: -4 },

  // ── Mosaico / Grid ────────────────────────────────────────
  mosaicHeader:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 4 },
  mosaicTitle:     { color: C.text, fontSize: 25, fontWeight: '900' },
  mosaicSubtitle:  { color: C.textSub, fontSize: 13, fontWeight: '600', marginTop: 3, lineHeight: 18 },

  areaCreatorCard:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 22, padding: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  areaCreatorInput:      { flex: 1, minHeight: 44, color: C.text, fontSize: 13, fontWeight: '700', paddingHorizontal: 10 },
  areaCreatorButton:     { height: 44, borderRadius: 16, paddingHorizontal: 14, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  areaCreatorButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },

  groupFilterRow:          { gap: 8, paddingRight: 4, paddingBottom: 2 },
  groupFilterChip:         { borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  groupFilterChipActive:   { backgroundColor: C.accent, borderColor: C.accent },
  groupFilterText:         { color: C.textSub, fontSize: 12, fontWeight: '800' },
  groupFilterTextActive:   { color: '#fff' },

  areaEditorCard:     { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderFocus, borderRadius: 24, padding: 14, gap: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  areaEditorHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  areaEditorTitle:    { color: C.text, fontSize: 16, fontWeight: '900' },
  areaEditorSubtitle: { color: C.textSub, fontSize: 12, fontWeight: '700', marginTop: 2 },
  areaDeleteButton:   { borderWidth: 1, borderColor: C.dangerBorder, backgroundColor: C.dangerBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  areaDeleteText:     { color: C.dangerText, fontSize: 11, fontWeight: '900' },

  cameraSelectionGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cameraSelectionCard:         { width: '48.4%', borderRadius: 18, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, padding: 8, gap: 8 },
  cameraSelectionCardActive:   { borderColor: C.accent, backgroundColor: C.accentBg },
  cameraSelectionThumb:        { height: 76, borderRadius: 14, backgroundColor: C.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cameraSelectionImage:        { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover' },
  cameraSelectionCheck:        { position: 'absolute', right: 7, top: 7, minWidth: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  cameraSelectionCheckActive:  { backgroundColor: C.accent },
  cameraSelectionCheckText:    { color: C.textSub, fontSize: 11, fontWeight: '900' },
  cameraSelectionCheckTextActive:{ color: '#fff' },
  cameraSelectionName:         { color: C.text, fontSize: 12, fontWeight: '800' },

  mosaicSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  mosaicSectionTitle:  { color: C.text, fontSize: 15, fontWeight: '900' },
  mosaicSectionCount:  { color: C.textSub, fontSize: 12, fontWeight: '800' },

  mosaicGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mosaicTile:         { width: '48.55%', aspectRatio: 1, backgroundColor: C.surface, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  mosaicImage:        { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.88 },
  mosaicFallback:     { position: 'absolute', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceAlt },
  mosaicFallbackText: { color: C.accent, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  mosaicShade:        { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.16)' },
  mosaicStatus:       { position: 'absolute', right: 10, top: 10, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' },
  mosaicStatusOnline: { backgroundColor: C.success },
  mosaicStatusOffline:{ backgroundColor: C.danger },
  mosaicFooter:       { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 24, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.56)' },
  mosaicCameraName:   { color: '#fff', fontSize: 12, fontWeight: '800' },

  // ── PlaybackScreen ────────────────────────────────────────

  // Cabeçalho da tela
  recordingsTitle:    { color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.4 },
  recordingsSubtitle: { color: C.textSub, fontSize: 14, lineHeight: 20, marginTop: 4 },

  // Seletor de câmera (chips horizontais compactos)
  cameraSelectorRow:        { gap: 8, paddingBottom: 2 },
  cameraSelectorChip:       { borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
  cameraSelectorChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  cameraSelectorDot:        { width: 7, height: 7, borderRadius: 4 },
  cameraSelectorText:       { color: C.textSub, fontSize: 13, fontWeight: '800' },
  cameraSelectorTextActive: { color: '#fff' },

  // Timeline ruler
  replayTimelineRuler:  { height: 100, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 16, overflow: 'hidden', justifyContent: 'center' },
  replayTimelineLabels: { position: 'absolute', left: 14, right: 14, top: 10, flexDirection: 'row', justifyContent: 'space-between' },
  replayTimelineLabel:  { color: C.textMuted, fontSize: 10, fontWeight: '800' },
  replayTicks:          { position: 'absolute', left: 14, right: 14, top: 30, flexDirection: 'row', justifyContent: 'space-between', opacity: 0.30 },
  replayTick:           { width: 1, height: 7, backgroundColor: C.textSub },
  replayTickMajor:      { height: 14 },
  replayTrack:          { position: 'absolute', left: 16, right: 16, top: 52, height: 12, borderRadius: 999, overflow: 'hidden', backgroundColor: C.tlBg, flexDirection: 'row' },
  replayTrackSegmentBlue:  { backgroundColor: C.tlBlue },
  replayTrackSegmentOrange:{ backgroundColor: C.tlOrange },
  replayTrackGap:       { width: 6, backgroundColor: 'transparent' },
  replayPlayhead:       { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, backgroundColor: C.tlHead, alignItems: 'center', shadowColor: C.tlHead, shadowOpacity: 0.55, shadowRadius: 6, elevation: 4 },
  replayPlayheadCap:    { width: 10, height: 10, backgroundColor: C.tlHead, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },

  // Filtros
  replayFilterRow:       { flexDirection: 'row', gap: 8 },
  replayFilterChip:      { borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  replayFilterChipActive:{ backgroundColor: C.accent, borderColor: C.accent },
  replayFilterText:      { color: C.textSub, fontSize: 12, fontWeight: '800' },
  replayFilterTextActive:{ color: '#fff', fontSize: 12, fontWeight: '800' },

  // Header da grade de eventos
  replayGridHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  replayGridDate:   { color: C.textSub, fontSize: 14, fontWeight: '800' },
  replayGridCount:  { color: C.textMuted, fontSize: 12, fontWeight: '800' },

  // Grade de eventos (3 colunas) – referência exemplo 2
  replayEventGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  replayEventCard:     { width: '31.8%', gap: 5 },
  replayEventThumb:    { aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: C.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  replayEventIcon:     { position: 'absolute', left: 6, bottom: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(17,24,39,0.80)', alignItems: 'center', justifyContent: 'center' },
  replayEventPlay:     { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(37,99,235,0.85)', alignItems: 'center', justifyContent: 'center' },
  replayEventFooter:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  replayEventTime:     { color: C.textSub, fontSize: 12, fontWeight: '800' },
  replayEventDownload: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  replayEventMeta:     { color: C.textMuted, fontSize: 10, fontWeight: '700' },

  // Timeline vertical de eventos – referência exemplo 1
  eventTimeline:     { paddingLeft: 8, gap: 0 },
  eventTimelineItem: { flexDirection: 'row', minHeight: 80 },
  // coluna de hora
  eventTimelineTime: { width: 52, paddingTop: 2, alignItems: 'flex-end', paddingRight: 12 },
  eventTimelineTimeText: { color: C.textMuted, fontSize: 13, fontWeight: '700' },
  // coluna da linha + dot
  eventTimelineLineCol: { width: 16, alignItems: 'center' },
  eventTimelineLine:    { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: C.border },
  eventTimelineLineFirst: { top: 10 },
  eventTimelineLineLast:  { bottom: 'auto', height: 10 },
  eventTimelineDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: C.border, marginTop: 4, zIndex: 1 },
  eventTimelineDotActive:{ backgroundColor: C.accent, shadowColor: C.accent, shadowOpacity: 0.35, shadowRadius: 6, elevation: 3 },
  // coluna de conteúdo
  eventTimelineContent: { flex: 1, paddingLeft: 12, paddingBottom: 20 },
  eventTimelineHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  eventTimelineInfo:    { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  eventTimelineTitle:   { color: C.textSub, fontSize: 14, fontWeight: '700' },
  eventTimelineTitleActive: { color: C.text, fontWeight: '800', fontSize: 15 },
  // thumbnail na timeline
  eventTimelineThumb:   { width: 110, aspectRatio: 16 / 9, borderRadius: 8, overflow: 'hidden', backgroundColor: C.border, flexShrink: 0 },
  eventTimelineThumbImg:{ position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover' },
  eventTimelineThumbOverlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.22)' },
  eventTimelinePlayBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.64)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  eventTimelinePlayBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  eventTimelineDuration:{ position: 'absolute', right: 6, bottom: 5, backgroundColor: 'rgba(0,0,0,0.64)', borderRadius: 5, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 3 },
  eventTimelineDurationText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // Player de playback
  playbackPlayerCard:  { backgroundColor: C.surface, borderRadius: 28, borderWidth: 1, borderColor: C.border, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 18, elevation: 5 },
  playbackHeader:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  playbackTitle:       { color: C.text, fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },
  cloudReplayStage:    { borderRadius: 20, overflow: 'hidden', backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  playbackVideo:       { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  cloudReplayTopBar:   { position: 'absolute', left: 12, right: 12, top: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cloudReplayBadge:    { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1, backgroundColor: C.accent, borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  cloudReplayTime:     { color: '#fff', fontSize: 10, fontWeight: '900', backgroundColor: 'rgba(0,0,0,0.56)', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  closePlaybackButton: { borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  closePlaybackText:   { color: C.text, fontSize: 11, fontWeight: '900' },

  // Botões de ação
  rowButtons:        { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  smallButton:       { borderRadius: 999, backgroundColor: C.accent, paddingHorizontal: 16, paddingVertical: 10 },
  smallButtonText:   { color: '#fff', fontWeight: '900', fontSize: 12 },
  smallButtonDark:   { borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 10 },
  smallButtonDarkText:{ color: C.text, fontWeight: '900', fontSize: 12 },

  // Imagens de preview de gravação
  recordingPreviewImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.70 },
  recordingPreviewShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.22)' },

  // Estado vazio
  emptyCard:  { borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, borderRadius: 24, padding: 28, alignItems: 'center' },
  emptyTitle: { color: C.text, fontSize: 16, fontWeight: '900' },
  emptyText:  { color: C.textSub, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  // ── ProfileScreen ─────────────────────────────────────────
  profileScreenTitle: { color: C.text, fontSize: 25, fontWeight: '900', marginBottom: 6 },
  profileSimpleCard:  { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderRadius: 28, borderWidth: 1, borderColor: C.border, padding: 18, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  profileSimpleAvatar:{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  profileSimpleName:  { color: C.text, fontSize: 16, fontWeight: '800' },
  profileSimplePlan:  { color: C.accent, fontSize: 12, fontWeight: '700', marginTop: 3 },
  settingsList:       { gap: 10 },
  settingsRow:        { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16 },
  settingsRowDisabled:{ opacity: 0.52 },
  settingsRowText:    { color: C.text, fontSize: 14, fontWeight: '700' },
  settingsSoonText:   { color: C.textMuted, fontSize: 11, fontWeight: '700', marginTop: 4 },
  logoutButton:       { width: '100%', height: 54, borderRadius: 18, backgroundColor: C.dangerBg, borderWidth: 1, borderColor: C.dangerBorder, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  logoutText:         { color: C.dangerText, fontSize: 14, fontWeight: '900' },
});
