import type ConfluenceSyncPlugin from '../main';

export function registerRibbon(plugin: ConfluenceSyncPlugin): void {
  plugin.addRibbonIcon('refresh-cw', 'Sync Confluence space', (): void => {
    void plugin.syncActiveSpaceOrAll();
  });
}
