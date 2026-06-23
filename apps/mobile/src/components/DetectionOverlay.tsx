import { StyleSheet, Text, View } from 'react-native';
import type { LiveDetection } from '../types';
import { computeDetectionRect } from '../utils/detection-geometry';

interface DetectionOverlayProps {
  detections: LiveDetection[];
  containerWidth: number;
  containerHeight: number;
  fallbackWidth?: number | null;
  fallbackHeight?: number | null;
}

/**
 * Desenha as caixas de detecção de IA sobre o vídeo ao vivo. O vídeo usa
 * contentFit="contain", então as coordenadas (em pixels do frame) precisam ser
 * mapeadas para o retângulo realmente renderizado (com as bordas pretas do
 * letterbox), exatamente como o overlay do web faz.
 */
export function DetectionOverlay({
  detections,
  containerWidth,
  containerHeight,
  fallbackWidth,
  fallbackHeight,
}: DetectionOverlayProps) {
  if (containerWidth <= 0 || containerHeight <= 0 || !detections.length) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {detections.map((detection) => {
        const frameWidth = detection.frameWidth && detection.frameWidth > 0 ? detection.frameWidth : fallbackWidth || 1280;
        const frameHeight = detection.frameHeight && detection.frameHeight > 0 ? detection.frameHeight : fallbackHeight || 720;
        const { left, top, width, height } = computeDetectionRect(
          detection.bbox,
          frameWidth,
          frameHeight,
          containerWidth,
          containerHeight,
        );

        const isFace = detection.type?.startsWith('FACE');
        const color = isFace ? '#22c55e' : '#fb923c';
        const label =
          detection.confidence != null ? `${detection.label} ${Math.round(detection.confidence * 100)}%` : detection.label;

        return (
          <View key={detection.id} style={[styles.box, { left, top, width, height, borderColor: color }]}>
            <Text style={[styles.label, { backgroundColor: color }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', borderWidth: 2, borderRadius: 3 },
  label: {
    position: 'absolute',
    top: -15,
    left: -2,
    color: '#111827',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
    maxWidth: 150,
  },
});
