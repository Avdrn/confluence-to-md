import type { App } from 'obsidian';
import { basicAuthorization } from '../confluence/api/confluence-client';
import type { ConfluenceSyncSettings } from './plugin-settings';

export class MissingCredentialsError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MissingCredentialsError';
  }
}

export interface Credentials {
  siteUrl: string;
  email: string;
  authorization: string;
}

/** The token lives in Obsidian's secret storage; the settings hold only its name. */
export function readCredentials(app: App, settings: ConfluenceSyncSettings): Credentials {
  const siteUrl: string = normalizeSiteUrl(settings.siteUrl);
  if (!siteUrl) {
    throw new MissingCredentialsError('Enter your Atlassian site URL in the Confluence Space Sync settings.');
  }
  const email: string = settings.email.trim();
  if (!email) {
    throw new MissingCredentialsError('Enter your Atlassian account email in the Confluence Space Sync settings.');
  }
  if (!settings.tokenSecretName) {
    throw new MissingCredentialsError('Choose the secret that holds your Atlassian API token in the Confluence Space Sync settings.');
  }
  const token: string | null = app.secretStorage.getSecret(settings.tokenSecretName);
  if (!token) {
    throw new MissingCredentialsError(
      `The secret "${settings.tokenSecretName}" is empty or missing. Add your Atlassian API token under Settings > Secrets.`
    );
  }
  return { siteUrl, email, authorization: basicAuthorization(email, token) };
}

/** `yourcompany.atlassian.net/wiki/` and friends become `https://yourcompany.atlassian.net`. */
export function normalizeSiteUrl(raw: string): string {
  let url: string = raw.trim().replace(/\/+$/, '');
  if (!url) {
    return '';
  }
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  url = url.replace(/\/wiki$/i, '');
  if (!/^https?:\/\/[^/]+\.[^/]+$/i.test(url)) {
    return '';
  }
  return url;
}
