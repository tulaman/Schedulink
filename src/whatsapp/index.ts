import { makeWASocket, useMultiFileAuthState, WASocket } from 'baileys';
import QRCode from 'qrcode';
import { EventEmitter } from 'events';
import { continueConversationWithBarber, getConversationContext } from '../agents/barberAgent';

export interface IncomingWaMessage {
  jid: string;
  text: string;
}

const waEventBus = new EventEmitter();

export function onWaMessage(handler: (msg: IncomingWaMessage) => void) {
  waEventBus.on('message', handler);
}

let sock: WASocket | null = null;

export async function initWhatsApp(onQR: (qrImage: Buffer) => Promise<void>) {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');

  async function startSock() {
    sock = makeWASocket({ auth: state });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async upsert => {
      const messages = (upsert as any).messages as any[];
      for (const msg of messages) {
        if (msg.key.fromMe) continue; // ignore our own messages
        
        const jid = msg.key.remoteJid as string;
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          '';
        
        if (text) {
          // Emit the message for other handlers
          waEventBus.emit('message', { jid, text } as IncomingWaMessage);
          
          // Check if we have an active conversation with this barber
          const conversationContext = getConversationContext(jid);
          if (conversationContext && !conversationContext.isCompleted) {
            try {
              console.log(`📨 Received message from barber ${jid}: "${text}"`);
              const response = await continueConversationWithBarber(jid, text);
              console.log(`🤖 Agent response: "${response}"`);
              
              // Send the agent's response
              await sendWaMessage(jid, response);
              console.log(`✅ Response sent to barber ${jid}`);
              
              // Send update to Telegram
              try {
                const fs = await import('fs/promises');
                const telegramChatId = await fs.readFile('telegram_chat_id', 'utf-8');
                if (telegramChatId) {
                  // Import telegraf and send update (this would need to be handled better in production)
                  console.log(`📱 Would send Telegram update to ${telegramChatId}: Conversation update`);
                }
              } catch (e) {
                // Telegram chat ID not available, skip notification
              }
              
            } catch (error) {
              console.error(`❌ Error handling message from ${jid}:`, error);
            }
          }
        }
      }
    });

    sock.ev.on('connection.update', async update => {
      const { connection, lastDisconnect, qr } = update as any;
      if (qr) {
        // generate PNG image buffer from QR string
        const img = await QRCode.toBuffer(qr, { type: 'png' });
        await onQR(img);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error?.output?.statusCode) ?? 0;
        // 401 (logged out) means we need to clear creds & re-register
        if (statusCode === 401 || statusCode === 440) {
          console.warn('WhatsApp logged out, deleting auth & waiting for /qr');
          await saveCreds(); // persist whatever state for debug
        } else {
          console.warn('WhatsApp connection closed, reconnecting...', statusCode);
          await startSock();
        }
      } else if (connection === 'open') {
        console.log('✅ WhatsApp connected');
      }
    });
  }

  await startSock();
  return sock;
}

export function sendWaMessage(jid: string, text: string) {
  if (!sock) throw new Error('WhatsApp not initialised');
  return sock.sendMessage(jid, { text });
}
