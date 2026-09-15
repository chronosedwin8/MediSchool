const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', uuml: 'ü', ntilde: 'ñ',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Uuml: 'Ü', Ntilde: 'Ñ',
};

/** Strips HTML tags/entities (Phidias rich text fields). */
export function plainText(html: unknown): string {
  if (html === null || html === undefined) return '';
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (ENTITIES[n] !== undefined ? ENTITIES[n] : m))
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSearch(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleCase(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** Masks all but the last digits of a document/phone for gate screens & logs. */
export function maskDigits(v: string | null | undefined, visible = 3): string {
  const s = String(v ?? '');
  if (s.length <= visible) return s;
  return '•'.repeat(s.length - visible) + s.slice(-visible);
}

/** Short human code for passes: 6 chars, no ambiguous letters. */
export function shortCode(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(random() * alphabet.length)];
  return out;
}
