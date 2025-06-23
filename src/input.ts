import inquirer from 'inquirer';

export async function getUrlFromUser(): Promise<string> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: '要約したい記事のURLを入力してください:',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'URLは必須です';
        }
        try {
          new URL(input);
          return true;
        } catch {
          return '有効なURLを入力してください';
        }
      },
    },
  ]);

  return answers.url;
}
