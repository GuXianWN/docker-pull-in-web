export const normalizeImageName = (rawName: string): string => {
  const trimmed = rawName.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes("/")) return trimmed;
  return `library/${trimmed}`;
};

export const getRepoTagName = (rawName: string): string => {
  const trimmed = rawName.trim();
  if (!trimmed) return trimmed;
  return trimmed;
};

export const getSafeFileBaseName = (rawName: string): string => {
  const trimmed = rawName.trim();
  if (!trimmed) return trimmed;
  return trimmed.replaceAll("/", "_");
};
