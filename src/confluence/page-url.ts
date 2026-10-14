const ABSOLUTE_URL: RegExp = /^https?:\/\//i;

/** A `_links.webui` value, which Confluence returns relative to `/wiki`, as a full URL. */
export function webUrlOf(siteUrl: string, webui: string | undefined): string {
  if (!webui) {
    return '';
  }
  if (ABSOLUTE_URL.test(webui)) {
    return webui;
  }
  return `${siteUrl}/wiki${webui}`;
}

export function spaceUrlOf(siteUrl: string, spaceKey: string): string {
  return `${siteUrl}/wiki/spaces/${encodeURIComponent(spaceKey)}`;
}

/** Confluence resolves a space key and title to the page, for links we could not place. */
export function pageSearchUrl(siteUrl: string, spaceKey: string, title: string): string {
  return `${siteUrl}/wiki/spaces/${encodeURIComponent(spaceKey)}/pages?title=${encodeURIComponent(title)}`;
}
