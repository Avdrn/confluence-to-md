/**
 * The few names from the Obsidian API that modules under test import at
 * runtime. The real package ships only type declarations, so vitest resolves
 * 'obsidian' here instead; nothing in here does anything.
 */

export class Component {
  public load(): void {}
  public unload(): void {}
  public registerEvent(): void {}
}
export class View extends Component {}
export class ItemView extends View {}
export class MarkdownView extends View {}
export class Modal {
  public open(): void {}
  public close(): void {}
}
export class SuggestModal extends Modal {}
export class Notice {
  public constructor(message: string | DocumentFragment, duration?: number) {
    void message;
    void duration;
  }
}
export class Menu {}
export class TAbstractFile {}
export class TFile extends TAbstractFile {}
export class TFolder extends TAbstractFile {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class SecretComponent {}
export class FileSystemAdapter {}
export const Platform: { isWin: boolean } = { isWin: false };
export function setIcon(): void {}
export function requestUrl(): never {
  throw new Error('requestUrl is not available in tests');
}
export const MarkdownRenderer: { render(): Promise<void> } = {
  render: async (): Promise<void> => {}
};
