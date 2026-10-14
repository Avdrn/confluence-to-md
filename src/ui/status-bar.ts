/** The status bar item: progress while a sync runs, a summary when it is done. */
export class SyncStatusBar {
  public constructor(private readonly element: HTMLElement, onClick: () => void) {
    element.addClass('confluence-sync-status');
    element.addEventListener('click', onClick);
    this.clear();
  }

  public showProgress(text: string): void {
    this.element.setText(`Confluence: ${text}`);
    this.element.setAttribute('aria-label', 'Click to cancel the Confluence sync');
  }

  public showIdle(label: string, tooltip: string): void {
    this.element.setText(`Confluence: ${label}`);
    this.element.setAttribute('aria-label', `${tooltip}. Click for the report.`);
  }

  public clear(): void {
    this.element.setText('');
    this.element.removeAttribute('aria-label');
  }
}
