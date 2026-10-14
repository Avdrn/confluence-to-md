/**
 * A short, stable hash of a note body, recorded in front-matter so a later
 * sync can tell a hand edit from the text it wrote itself.
 *
 * cyrb53, because it is synchronous, needs no crypto module, and 53 bits are
 * plenty for "did this one note change".
 */
export function hashBody(body: string): string {
  const text: string = body.trim();
  let h1: number = 0xdeadbeef;
  let h2: number = 0x41c6ce57;
  for (let i: number = 0; i < text.length; i++) {
    const code: number = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
