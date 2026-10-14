import type ConfluenceSyncPlugin from '../main';

export function registerCommands(plugin: ConfluenceSyncPlugin): void {
  plugin.addCommand({
    id: 'sync-this-space',
    name: 'Sync this space',
    callback: (): void => {
      void plugin.syncActiveSpace({ dryRun: false, force: false });
    }
  });

  plugin.addCommand({
    id: 'preview-this-space',
    name: 'Preview changes for this space',
    callback: (): void => {
      void plugin.syncActiveSpace({ dryRun: true, force: false });
    }
  });

  plugin.addCommand({
    id: 'resync-this-space',
    name: 'Resync this space (re-render every note)',
    callback: (): void => {
      void plugin.syncActiveSpace({ dryRun: false, force: true });
    }
  });

  plugin.addCommand({
    id: 'sync-all-spaces',
    name: 'Sync all spaces',
    callback: (): void => {
      void plugin.syncAllSpaces({ dryRun: false, force: false });
    }
  });

  plugin.addCommand({
    id: 'add-space-here',
    name: 'Add Confluence space here',
    callback: (): void => {
      void plugin.addSpaceHere(plugin.activeFolder());
    }
  });

  plugin.addCommand({
    id: 'cancel-sync',
    name: 'Cancel the running sync',
    checkCallback: (checking: boolean): boolean => {
      if (!plugin.runner.isRunning) {
        return false;
      }
      if (!checking) {
        plugin.runner.cancel();
      }
      return true;
    }
  });

  plugin.addCommand({
    id: 'show-last-report',
    name: 'Show last sync report',
    checkCallback: (checking: boolean): boolean => {
      if (!plugin.runner.lastReport) {
        return false;
      }
      if (!checking) {
        plugin.showReport(plugin.runner.lastReport);
      }
      return true;
    }
  });
}
