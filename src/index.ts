import { createBot } from './telegram/bot.js';
import { initWhatsApp, onWaMessage } from './whatsapp/index.js';
import fs from 'fs/promises';
import { createActor } from 'xstate';
import { conversationMachine } from './agents/conversationMachine.js';

async function main() {
  let qrChatId: number | undefined;
  try {
    const chatIdStr = await fs.readFile('telegram_chat_id', 'utf-8');
    qrChatId = parseInt(chatIdStr, 10);
  } catch (e) {
    // ignore
  }

  // create an actor instance per barber JID (single barber for MVP)
  const convActor = createActor(conversationMachine).start();

  const bot = createBot(convActor);

  // wire incoming WA messages into FSM
  onWaMessage(msg => {
    convActor.send({ type: 'BARBER_REPLY', text: msg.text });
  });

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
}

main();
