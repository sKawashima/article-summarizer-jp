import Configstore from 'configstore';
import inquirer from 'inquirer';

class ConfigManager {
  private store: Configstore;

  constructor() {
    this.store = new Configstore('article-summarizer-jp', {});
  }

  hasApiKey(): boolean {
    return !!this.store.get('anthropicApiKey');
  }

  getApiKey(): string {
    const apiKey = this.store.get('anthropicApiKey');
    if (!apiKey) {
      throw new Error('API key not configured. Run with --config flag first.');
    }
    return apiKey;
  }

  async configure(): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Anthropic APIキーを入力してください:',
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return 'APIキーは必須です';
          }
          if (!input.startsWith('sk-')) {
            return 'APIキーは "sk-" で始まる必要があります';
          }
          return true;
        }
      }
    ]);

    this.store.set('anthropicApiKey', answers.apiKey);
  }
}

export const config = new ConfigManager();