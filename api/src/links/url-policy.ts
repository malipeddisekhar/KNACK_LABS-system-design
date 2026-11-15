const ABSOLUTE_HTTP_URL = /^https?:\/\//i;

function containsControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export function normalizeAllowedLongUrl(value: unknown): string | null {
  if (typeof value !== 'string' || containsControlCharacters(value)) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('\\') || !ABSOLUTE_HTTP_URL.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
