import { resolve, normalize } from 'node:path';

export function ensureFileUnderRoot(root: string, filePath: string): string {
  const resolvedRoot = resolve(root);
  const normalizedPath = normalize(filePath);
  const resolvedFile = normalizedPath.startsWith(resolvedRoot)
    ? resolve(normalizedPath)
    : resolve(resolvedRoot, normalizedPath);
  if (!resolvedFile.startsWith(resolvedRoot)) {
    throw new Error('Arquivo fora da raiz de gravações.');
  }
  return resolvedFile;
}
