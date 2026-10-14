import type { App } from 'obsidian';

/** The settings dialog is not part of the public API, so it is reached by its known shape. */
interface SettingsDialog {
  open(): void;
  openTabById(id: string): void;
}

interface AppWithSettings {
  setting?: SettingsDialog;
}

export function openPluginSettings(app: App, pluginId: string): void {
  const dialog: SettingsDialog | undefined = (app as unknown as AppWithSettings).setting;
  if (!dialog) {
    return;
  }
  dialog.open();
  dialog.openTabById(pluginId);
}
