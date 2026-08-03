type ProjectLabelInput = {
  name: string;
  code?: string | null;
};

export function shortenProjectName(name: string, maxLength = 34) {
  const normalized = name.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function formatProjectLabel(project: ProjectLabelInput, maxNameLength = 34) {
  const name = shortenProjectName(project.name, maxNameLength);
  const code = project.code?.trim();
  return code ? `${code} · ${name}` : name;
}
