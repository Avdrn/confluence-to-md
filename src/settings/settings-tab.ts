import { PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import type { App } from 'obsidian';
import { readCredentials } from './credentials';
import type { Credentials } from './credentials';
import { ConfluenceClient } from '../confluence/api/confluence-client';
import { obsidianRequest } from '../confluence/api/obsidian-request';
import { RequestQueue } from '../confluence/api/request-queue';
import { CancellationToken } from '../confluence/api/cancellation';
import { notify, notifyError } from '../ui/notices';
import type { ConfluenceUser } from '../confluence/types/confluence-api.type';
import type ConfluenceSyncPlugin from '../main';
import type { UnpushedEditsPolicy } from '../sync/sync-options';

const API_TOKEN_URL: string = 'https://id.atlassian.com/manage-profile/security/api-tokens';

export class ConfluenceSyncSettingTab extends PluginSettingTab {
  public constructor(app: App, private readonly plugin: ConfluenceSyncPlugin) {
    super(app, plugin);
  }

  public override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName('Connection').setHeading();

    new Setting(containerEl)
      .setName('Atlassian site')
      .setDesc('For example https://yourcompany.atlassian.net')
      .addText((text): void => {
        text.setPlaceholder('https://yourcompany.atlassian.net')
          .setValue(this.plugin.settings.siteUrl)
          .onChange(async (value: string): Promise<void> => {
            this.plugin.settings.siteUrl = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Account email')
      .setDesc('The Atlassian account the API token belongs to.')
      .addText((text): void => {
        text.setPlaceholder('you@company.com')
          .setValue(this.plugin.settings.email)
          .onChange(async (value: string): Promise<void> => {
            this.plugin.settings.email = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('API token')
      .setDesc(this.tokenDescription())
      .addComponent((el: HTMLElement): SecretComponent => new SecretComponent(this.app, el)
        .setValue(this.plugin.settings.tokenSecretName)
        .onChange(async (value: string | null): Promise<void> => {
          this.plugin.settings.tokenSecretName = value ?? '';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Test connection')
      .setDesc('Checks the site, email and token by asking Confluence who you are.')
      .addButton((button): void => {
        button.setButtonText('Test').onClick(async (): Promise<void> => {
          await this.testConnection();
        });
      });

    new Setting(containerEl).setName('Sync').setHeading();

    new Setting(containerEl)
      .setName('Download attachments')
      .setDesc('Images and files go to an _attachments folder inside the space folder.')
      .addToggle((toggle): void => {
        toggle.setValue(this.plugin.settings.downloadAttachments)
          .onChange(async (value: boolean): Promise<void> => {
            this.plugin.settings.downloadAttachments = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Show report after sync')
      .setDesc('Open the report window when a sync finishes. Failures and overwritten local edits always open it.')
      .addToggle((toggle): void => {
        toggle.setValue(this.plugin.settings.showReportAfterSync)
          .onChange(async (value: boolean): Promise<void> => {
            this.plugin.settings.showReportAfterSync = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Notes you changed in Obsidian')
      .setDesc('What a sync does with a note whose text you changed and have not sent to Confluence.')
      .addDropdown((dropdown): void => {
        dropdown
          .addOptions({ ask: 'Ask every time', keep: 'Keep my changes', overwrite: 'Replace them with the Confluence version' })
          .setValue(this.plugin.settings.unpushedEditsOnSync)
          .onChange(async (value: string): Promise<void> => {
            this.plugin.settings.unpushedEditsOnSync = asUnpushedPolicy(value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Ask before trashing more than')
      .setDesc('Notes deleted in Confluence are trashed the way your "Deleted files" setting says. Above this number the sync asks first.')
      .addSlider((slider): void => {
        slider.setLimits(0, 50, 1)
          .setValue(this.plugin.settings.confirmTrashAbove)
          .setDynamicTooltip()
          .onChange(async (value: number): Promise<void> => {
            this.plugin.settings.confirmTrashAbove = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setName('Sending changes to Confluence').setHeading();

    new Setting(containerEl)
      .setName('Allow sending changes to Confluence')
      .setDesc('Adds "Send my changes to Confluence" to the cloud menu of every synced note. Each send opens a review first; nothing is sent without it.')
      .addToggle((toggle): void => {
        toggle.setValue(this.plugin.settings.enablePush)
          .onChange(async (value: boolean): Promise<void> => {
            this.plugin.settings.enablePush = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Note for the page history')
      .setDesc('Written into the Confluence page history with every send. The review lets you change it each time.')
      .addText((text): void => {
        text.setPlaceholder('Updated from Obsidian')
          .setValue(this.plugin.settings.pushVersionMessage)
          .onChange(async (value: string): Promise<void> => {
            this.plugin.settings.pushVersionMessage = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setName('Connection limits').setHeading();

    new Setting(containerEl)
      .setName('Parallel requests')
      .setDesc('How many Confluence requests run at once. Lower it if Confluence answers with rate limits.')
      .addSlider((slider): void => {
        slider.setLimits(1, 8, 1)
          .setValue(this.plugin.settings.concurrency)
          .setDynamicTooltip()
          .onChange(async (value: number): Promise<void> => {
            this.plugin.settings.concurrency = value;
            await this.plugin.saveSettings();
          });
      });
  }

  private tokenDescription(): DocumentFragment {
    const fragment: DocumentFragment = document.createDocumentFragment();
    fragment.appendText('Stored in Obsidian\'s secret storage, never in the plugin settings file. Create one at ');
    fragment.createEl('a', { text: 'id.atlassian.com', href: API_TOKEN_URL });
    fragment.appendText('.');
    return fragment;
  }

  private async testConnection(): Promise<void> {
    try {
      const credentials: Credentials = readCredentials(this.app, this.plugin.settings);
      const client: ConfluenceClient = new ConfluenceClient(
        credentials.siteUrl,
        credentials.authorization,
        obsidianRequest,
        new RequestQueue(1, new CancellationToken())
      );
      const user: ConfluenceUser = await client.getJson<ConfluenceUser>('/wiki/rest/api/user/current');
      notify(`Connected to ${credentials.siteUrl} as ${user.displayName}.`);
    } catch (err) {
      notifyError(this.app, err, this.plugin.manifest.id);
    }
  }
}

function asUnpushedPolicy(value: string): UnpushedEditsPolicy {
  if (value === 'keep' || value === 'overwrite') {
    return value;
  }
  return 'ask';
}
