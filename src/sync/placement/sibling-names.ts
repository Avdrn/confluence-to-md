/**
 * Unique names within one folder, compared case-insensitively because most
 * file systems are. Notes and folders share the set, so a note "Policies" and
 * a folder "Policies" never coexist unless they are the same folder note.
 *
 * Names are claimed in title order, so the " (2)" suffix lands on the same
 * item on every sync.
 */
export class SiblingNames {
  private readonly used: Set<string> = new Set<string>();

  public constructor(reserved: Iterable<string> = []) {
    for (const name of reserved) {
      this.used.add(name.toLowerCase());
    }
  }

  /** The name itself, or the first free `name (n)`. The extension is kept at the end. */
  public claim(name: string, extension: string = ''): string {
    if (this.take(`${name}${extension}`)) {
      return `${name}${extension}`;
    }
    let counter: number = 2;
    while (!this.take(`${name} (${counter})${extension}`)) {
      counter++;
    }
    return `${name} (${counter})${extension}`;
  }

  private take(candidate: string): boolean {
    const key: string = candidate.toLowerCase();
    if (this.used.has(key)) {
      return false;
    }
    this.used.add(key);
    return true;
  }
}
