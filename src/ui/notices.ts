import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import { ConfluenceApiError } from '../confluence/api/api-error';
import { CancelledError } from '../confluence/api/cancellation';
import { MissingCredentialsError } from '../settings/credentials';
import { errorMessage } from '../shared/error-message';
import { openPluginSettings } from './open-settings';

const SHORT_MS: number = 6000;
const LONG_MS: number = 15000;

export function notify(message: string, durationMs: number = SHORT_MS): void {
  new Notice(message, durationMs);
}

/** Credential problems get a link straight into the settings; everything else is shown as it is. */
export function notifyError(app: App, err: unknown, pluginId: string): void {
  if (err instanceof CancelledError) {
    notify('Confluence sync cancelled.');
    return;
  }
  if (err instanceof MissingCredentialsError) {
    notifyWithSettingsLink(app, err.message, pluginId);
    return;
  }
  if (err instanceof ConfluenceApiError && err.isAuth()) {
    notifyWithSettingsLink(app, 'Confluence rejected the credentials. Check the site, email and API token.', pluginId);
    return;
  }
  notify(`Confluence sync failed: ${errorMessage(err)}`, LONG_MS);
}

function notifyWithSettingsLink(app: App, message: string, pluginId: string): void {
  const fragment: DocumentFragment = document.createDocumentFragment();
  fragment.appendText(message);
  const link: HTMLElement = fragment.createEl('a', { text: 'Open settings', cls: 'confluence-sync-notice-link' });
  link.addEventListener('click', (): void => {
    openPluginSettings(app, pluginId);
  });
  new Notice(fragment, LONG_MS);
}
