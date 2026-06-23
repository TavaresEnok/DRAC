export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Converte uma bounding box em pixels do frame para a posição em tela, levando em
 * conta o letterbox do vídeo renderizado com contentFit="contain" dentro de um
 * container de tamanho conhecido. Função pura (sem React) para ser testável.
 */
export function computeDetectionRect(
  bbox: [number, number, number, number],
  frameWidth: number,
  frameHeight: number,
  containerWidth: number,
  containerHeight: number,
): Rect {
  const [x1, y1, x2, y2] = bbox;
  const scale = Math.min(containerWidth / frameWidth, containerHeight / frameHeight);
  const renderedWidth = frameWidth * scale;
  const renderedHeight = frameHeight * scale;
  const offsetX = (containerWidth - renderedWidth) / 2;
  const offsetY = (containerHeight - renderedHeight) / 2;
  return {
    left: offsetX + x1 * scale,
    top: offsetY + y1 * scale,
    width: Math.max(2, (x2 - x1) * scale),
    height: Math.max(2, (y2 - y1) * scale),
  };
}
