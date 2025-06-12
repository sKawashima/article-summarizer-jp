import blessed from 'blessed';
import { config } from './config.js';
import { fetchContent } from './fetcher.js';
import { summarizeContent } from './summarizer.js';
import { saveToMarkdown } from './markdown.js';

export async function startWatchMode() {
  if (!config.hasApiKey()) {
    console.log('APIキーが設定されていません。最初に設定を行ってください。');
    await config.configure();
  }

  // Create a simple blessed screen
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    dockBorders: false
  });

  // Main container
  const container = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%'
  });

  // Log area
  const logBox = blessed.log({
    parent: container,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%-3',
    border: {
      type: 'line'
    },
    label: ' 📄 ログ ',
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    tags: false
  });

  // Input area
  const inputBox = blessed.textbox({
    parent: container,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    border: {
      type: 'line'
    },
    label: ' 🔗 URL入力 (Enterで送信) ',
    inputOnFocus: true
  });

  const processingQueue: Map<string, Promise<void>> = new Map();
  const waitingQueue: string[] = [];
  const maxConcurrent = 5;

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    logBox.log(`[${timestamp}] ${message}`);
    screen.render();
  };

  const processNextFromQueue = () => {
    if (waitingQueue.length > 0 && processingQueue.size < maxConcurrent) {
      const nextUrl = waitingQueue.shift()!;
      const processPromise = processUrl(nextUrl);
      processingQueue.set(nextUrl, processPromise);
    }
  };

  const processUrl = async (url: string): Promise<void> => {
    try {
      addLog(`📄 処理開始: ${url}`);
      addLog('  📥 コンテンツを取得中...');
      const { title, content, extractedUrl, htmlContent } = await fetchContent(url, true);
      
      addLog('  🤖 要約・翻訳中...');
      const { summary, details, translatedTitle, tags, validImageUrl } = await summarizeContent(title, content, htmlContent, extractedUrl, true);
      
      addLog('  💾 マークダウンファイルに保存中...');
      const filename = await saveToMarkdown(translatedTitle, extractedUrl, summary, details, tags, validImageUrl);
      
      addLog(`✅ 完了: ${filename}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`❌ エラー (${url}): ${errorMessage}`);
    } finally {
      processingQueue.delete(url);
      processNextFromQueue();
      addLog(`⏳ 待機中... (処理中: ${processingQueue.size}/${maxConcurrent}, キュー: ${waitingQueue.length})`);
    }
  };

  // Handle input
  inputBox.on('submit', (input: string) => {
    const url = input.trim();
    inputBox.clearValue();
    
    if (!url) {
      inputBox.focus();
      return;
    }

    try {
      new URL(url);
    } catch {
      addLog('❌ 無効なURL形式です');
      inputBox.focus();
      return;
    }

    if (processingQueue.has(url) || waitingQueue.includes(url)) {
      addLog('⚠️ このURLは既にキューに登録されています');
      inputBox.focus();
      return;
    }

    if (processingQueue.size < maxConcurrent) {
      const processPromise = processUrl(url);
      processingQueue.set(url, processPromise);
      addLog(`🚀 処理開始 (${processingQueue.size}/${maxConcurrent})`);
    } else {
      waitingQueue.push(url);
      addLog(`📋 キューに追加 (待機: ${waitingQueue.length}件)`);
    }
    
    inputBox.focus();
  });

  // Handle exit
  screen.key(['C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  // Initial messages
  addLog('🔍 ウォッチモードを開始しました');
  addLog('URLを入力してEnterキーで送信してください（最大5件並行処理、キューイング対応）');
  addLog(`⏳ 待機中... (処理中: 0/${maxConcurrent}, キュー: 0)`);
  
  screen.render();
  inputBox.focus();
}