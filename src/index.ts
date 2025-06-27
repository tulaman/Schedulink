import { createBot, qrChatId } from './telegram/bot.js';
import { initWhatsApp } from './whatsapp/index.js';

const bot = createBot();
initWhatsApp(async qr => {
  if (qrChatId) {
    await bot.telegram.sendPhoto(qrChatId, { source: qr });
  } else {
    console.log('Scan this QR to login:', qr.toString());
  }
});
bot.launch();
console.log('Schedulink container started.');
