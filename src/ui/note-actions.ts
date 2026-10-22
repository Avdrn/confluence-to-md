/**
 * The cloud icon in the header of every synced note, with its menu, and the
 * same entries in the file menu. Views come and go, so the set of icons is
 * refreshed on every layout change rather than tracked view by view.
 */

import { MarkdownView, Menu, TFile, setIcon } from 'obsidian';
import type { App, WorkspaceLeaf } from 'obsidian';
import { PROPERTY, readManagedFrontMatter } from '../sync/front-matter/managed-front-matter';
import { REVIEWABLE_TYPES } from '../confluence/types/content-node.type';
import { hashBody } from '../sync/plan/body-hash';
import { bodyOf } from '../vault/note-body';
import type { ManagedFrontMatterFields } from '../sync/front-matter/managed-front-matter';
import type ConfluenceSyncPlugin from '../main';

export interface NoteActionHandlers {
  pull(file: TFile): void;
  push(file: TFile): void;
  compare(file: TFile): void;
  openInConfluence(file: TFile): void;
  pushEnabled(): boolean;
}

export class NoteActions {
  private readonly icons: Map<MarkdownView, HTMLElement> = new Map<MarkdownView, HTMLElement>();

  public constructor(private readonly plugin: ConfluenceSyncPlugin, private readonly handlers: NoteActionHandlers) {}

  public register(): void {
    const app: App = this.plugin.app;
    this.plugin.registerEvent(app.workspace.on('layout-change', (): void => {
      this.refresh();
    }));
    this.plugin.registerEvent(app.workspace.on('file-open', (): void => {
      this.refresh();
    }));
    this.plugin.registerEvent(app.metadataCache.on('changed', (): void => {
      this.refresh();
    }));
    this.plugin.registerEvent(app.workspace.on('file-menu', (menu: Menu, file): void => {
      if (file instanceof TFile && this.fieldsOf(file)) {
        this.addItems(menu, file);
      }
    }));
    app.workspace.onLayoutReady((): void => {
      this.refresh();
    });
    this.plugin.register((): void => {
      for (const icon of this.icons.values()) {
        icon.remove();
      }
      this.icons.clear();
    });
  }

  /** Every open Markdown view of a synced page gets the icon; every other view loses it. */
  public refresh(): void {
    const seen: Set<MarkdownView> = new Set<MarkdownView>();
    for (const leaf of this.plugin.app.workspace.getLeavesOfType('markdown')) {
      const view: WorkspaceLeaf['view'] = leaf.view;
      if (leaf.isDeferred || !(view instanceof MarkdownView)) {
        continue;
      }
      seen.add(view);
      const file: TFile | null = view.file;
      const fields: ManagedFrontMatterFields | null = this.fieldsOf(file);
      if (file && fields) {
        this.show(view, file, fields);
      } else {
        this.hide(view);
      }
    }
    for (const view of [...this.icons.keys()]) {
      if (!seen.has(view)) {
        this.hide(view);
      }
    }
  }

  /** Synced page and database notes: not the marker note, not a whiteboard or embed stub. */
  private fieldsOf(file: TFile | null): ManagedFrontMatterFields | null {
    if (!file) {
      return null;
    }
    const fields: ManagedFrontMatterFields | null = readManagedFrontMatter(this.plugin.app.metadataCache.getFileCache(file)?.frontmatter);
    if (!fields || !REVIEWABLE_TYPES.has(fields.type)) {
      return null;
    }
    return fields;
  }

  private show(view: MarkdownView, file: TFile, fields: ManagedFrontMatterFields): void {
    let icon: HTMLElement | undefined = this.icons.get(view);
    if (!icon) {
      icon = view.addAction('cloud', 'Confluence', (evt: MouseEvent): void => {
        const current: TFile | null = view.file;
        if (current) {
          this.showMenu(evt, current);
        }
      });
      this.icons.set(view, icon);
    }
    const element: HTMLElement = icon;
    const flagged: boolean = Boolean((this.plugin.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined)?.[PROPERTY.unpushed]);
    this.paint(element, flagged, fields);
    if (!flagged && fields.hash) {
      void bodyOf(this.plugin.app, file).then((body: string): void => {
        if (view.file?.path === file.path) {
          this.paint(element, hashBody(body) !== fields.hash, fields);
        }
      });
    }
  }

  /** A changed database note cannot be sent, so its icon warns instead of offering an upload. */
  private paint(icon: HTMLElement, changed: boolean, fields: ManagedFrontMatterFields): void {
    if (changed && fields.type === 'database') {
      setIcon(icon, 'cloud-alert');
      icon.setAttribute('aria-label', 'Changed in Obsidian. A database cannot be sent to Confluence; get the Confluence version to reset the note');
      return;
    }
    if (changed) {
      setIcon(icon, 'cloud-upload');
      icon.setAttribute('aria-label', 'Changed in Obsidian, not sent to Confluence yet');
      return;
    }
    setIcon(icon, 'cloud');
    icon.setAttribute('aria-label', `In sync with Confluence (version ${fields.version})`);
  }

  private hide(view: MarkdownView): void {
    this.icons.get(view)?.remove();
    this.icons.delete(view);
  }

  private showMenu(evt: MouseEvent, file: TFile): void {
    const menu: Menu = new Menu();
    this.addItems(menu, file);
    menu.showAtMouseEvent(evt);
  }

  private addItems(menu: Menu, file: TFile): void {
    const fields: ManagedFrontMatterFields | null = this.fieldsOf(file);
    menu.addItem((item): void => {
      item.setTitle('Get the Confluence version').setIcon('cloud-download').onClick((): void => {
        this.handlers.pull(file);
      });
    });
    if (fields?.type === 'page' && this.handlers.pushEnabled()) {
      menu.addItem((item): void => {
        item.setTitle('Send my changes to Confluence').setIcon('cloud-upload').onClick((): void => {
          this.handlers.push(file);
        });
      });
    }
    menu.addItem((item): void => {
      item.setTitle('Compare with Confluence').setIcon('git-compare').onClick((): void => {
        this.handlers.compare(file);
      });
    });
    menu.addItem((item): void => {
      item.setTitle('Open in Confluence').setIcon('external-link').onClick((): void => {
        this.handlers.openInConfluence(file);
      });
    });
  }
}
