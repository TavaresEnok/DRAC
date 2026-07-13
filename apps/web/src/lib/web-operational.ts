export function localDayRange(date: string) {
  const from = new Date(`${date}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  to.setMilliseconds(to.getMilliseconds() - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function relativeLuminance(hex: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground: string, background: string) {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  if (fg == null || bg == null) return 0;
  const light = Math.max(fg, bg);
  const dark = Math.min(fg, bg);
  return (light + 0.05) / (dark + 0.05);
}
