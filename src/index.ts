import { createBot } from './telegram/bot.js';
import { initWhatsApp } from './whatsapp/index.js';
import fs from 'fs/promises';
import dbService from './database/service.js';
import { TimeoutManager } from './timeout/manager.js';

async function main() {
  // Initialize database
  try {
    await dbService.initDatabase();
    
    // Restore incomplete conversations on startup
    const incompleteConversations = await dbService.getAllIncompleteConversations();
    if (incompleteConversations.length > 0) {
      console.log(`🔄 Restored ${incompleteConversations.length} incomplete conversations: ${incompleteConversations.join(', ')}`);
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }

  let qrChatId: number | undefined;
  try {
    const chatIdStr = await fs.readFile('telegram_chat_id', 'utf-8');
    qrChatId = parseInt(chatIdStr, 10);
  } catch (e) {
    // ignore
  }

  const bot = createBot();

  initWhatsApp(async qr => {
    // persist QR so we can send it later on demand
    await fs.writeFile('last_qr.png', qr);
    if (qrChatId) {
      try {
        await bot.telegram.sendPhoto(qrChatId, { source: qr });
      } catch (err) {
        console.warn('Failed to send QR to saved Telegram chat ID – will require manual /qr.');
        // remove invalid chat id so we do not keep crashing on next restart
        await fs.rm('telegram_chat_id', { force: true });
      }
    } else {
      console.log('Scan this QR to login:', qr.toString());
    }
  });
  
  bot.launch();
  console.log('Schedulink container started.');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    TimeoutManager.clearAllTimeouts();
    await dbService.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    TimeoutManager.clearAllTimeouts();
    await dbService.disconnect();
    process.exit(0);
  });
}

main();
