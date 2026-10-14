import { SuggestModal } from 'obsidian';
import type { App } from 'obsidian';
import type { SpaceSummary } from '../confluence/space-list';

export class SpacePickerModal extends SuggestModal<SpaceSummary> {
  public constructor(
    app: App,
    private readonly spaces: ReadonlyArray<SpaceSummary>,
    private readonly onChoose: (space: SpaceSummary) => void
  ) {
    super(app);
    this.setPlaceholder('Type a space key or name');
  }

  public override getSuggestions(query: string): Array<SpaceSummary> {
    const needle: string = query.trim().toLowerCase();
    if (!needle) {
      return [...this.spaces];
    }
    return this.spaces.filter((space: SpaceSummary): boolean =>
      space.key.toLowerCase().includes(needle) || space.name.toLowerCase().includes(needle)
    );
  }

  public override renderSuggestion(space: SpaceSummary, el: HTMLElement): void {
    el.createEl('div', { text: space.name });
    el.createEl('small', { text: space.key });
  }

  public override onChooseSuggestion(space: SpaceSummary): void {
    this.onChoose(space);
  }
}
