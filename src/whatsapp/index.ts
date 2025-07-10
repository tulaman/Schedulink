import { makeWASocket, useMultiFileAuthState, WASocket } from 'baileys';
import QRCode from 'qrcode';
import { EventEmitter } from 'events';
import { continueConversationWithBarber, getConversationContext } from '../agents/barberAgent';
import { sendTelegramNotification } from '../telegram/multiuser-bot';
import { TimeoutManager } from '../timeout/manager';
import dbService from '../database/service';

export interface IncomingWaMessage {
  jid: string;
  text: string;
}

// Utility function to normalize JID format
export function normalizeJid(jid: string): string {
  if (!jid || typeof jid !== 'string') {
    throw new Error('Invalid JID: JID must be a non-empty string');
  }
  
  // If already formatted, return as is
  if (jid.includes('@')) {
    return jid;
  }
  
  // Remove any non-digit characters and ensure it's a valid phone number
  const phoneNumber = jid.replace(/[^\d]/g, '');
  if (phoneNumber.length < 10) {
    throw new Error('Invalid phone number: must be at least 10 digits');
  }
  
  return `${phoneNumber}@s.whatsapp.net`;
}

const waEventBus = new EventEmitter();

export function onWaMessage(handler: (msg: IncomingWaMessage) => void) {
  waEventBus.on('message', handler);
}

/**
 * Find all users who have active (incomplete) conversations with a specific barber
 * @param barberJid Normalized barber JID
 * @returns Array of user IDs with active conversations
 */
async function findUsersWithActiveConversation(barberJid: string): Promise<string[]> {
  try {
    // Query database for all users who have incomplete conversations with this barber
    const activeConversations = await dbService.getUsersWithActiveConversationForBarber(barberJid);
    return activeConversations;
  } catch (error) {
    console.error(`❌ Failed to find users with active conversations for ${barberJid}:`, error);
    return [];
  }
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
        
        const rawJid = msg.key.remoteJid as string;
        const normalizedJid = normalizeJid(rawJid);
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          '';
        
        if (text) {
          // Emit the message for other handlers
          waEventBus.emit('message', { jid: normalizedJid, text } as IncomingWaMessage);
          
          // Find all users who have active conversations with this barber
          // This is needed because we don't know which user the barber is replying to
          try {
            // Get all active conversations for this barber across all users
            const activeUsers = await findUsersWithActiveConversation(normalizedJid);
            
            if (activeUsers.length === 0) {
              console.log(`ℹ️ No active conversations found for barber ${normalizedJid}`);
              return;
            }
            
            // Process message for each user with active conversation
            // In most cases, this will be just one user
            for (const userId of activeUsers) {
              console.log(`📨 Processing message from barber ${normalizedJid} for user ${userId}: "${text}"`);
              
              // Clear timeout since barber replied
              TimeoutManager.clearTimeout(normalizedJid, userId);
              
              const response = await continueConversationWithBarber(normalizedJid, text, userId);
              console.log(`🤖 Agent response for user ${userId}: "${response}"`);
              
              // Send the agent's response with human-like behavior
              await sendHumanLike(normalizedJid, response);
              console.log(`✅ Human-like response sent to barber ${normalizedJid}`);
              
              // Start new timeout if conversation is not completed
              if (!response.includes('[CONFIRMED:')) {
                await TimeoutManager.startTimeout(normalizedJid, userId);
              }
              
              // Send update to Telegram
              try {
                // Check if appointment was confirmed in this response
                const isConfirmed = response.includes('[CONFIRMED:');
                
                if (!isConfirmed) {
                  // Get conversation context for this user
                  const conversationContext = await getConversationContext(normalizedJid, userId);
                  const barberName = conversationContext?.barberName || 'Барбер';
                  const updateMessage = `💬 Обновление разговора с ${barberName}:\n\n📨 Барбер: "${text}"\n🤖 Ответ: "${response}"`;
                  await sendTelegramNotification(updateMessage, userId);
                }
              } catch (error) {
                console.error('Failed to send Telegram conversation update:', error);
              }
            }
            
          } catch (error) {
            console.error(`❌ Error handling message from ${normalizedJid}:`, error);
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
  
  // Normalize JID using our utility function
  const normalizedJid = normalizeJid(jid);
  
  // Validate that the normalized JID has a proper format
  if (!normalizedJid.match(/^.+@(s\.whatsapp\.net|g\.us)$/)) {
    throw new Error('Invalid JID format: must end with @s.whatsapp.net or @g.us');
  }
  
  return sock.sendMessage(normalizedJid, { text });
}

/**
 * Send message with human-like behavior: typing indicator + random delay
 * @param jid WhatsApp JID
 * @param text Message text
 * @param baseDelay Base delay in milliseconds (default: 1000-3000ms)
 */
export async function sendHumanLike(jid: string, text: string, baseDelay?: number): Promise<void> {
  if (!sock) throw new Error('WhatsApp not initialised');
  
  const normalizedJid = normalizeJid(jid);
  
  // Validate JID format
  if (!normalizedJid.match(/^.+@(s\.whatsapp\.net|g\.us)$/)) {
    throw new Error('Invalid JID format: must end with @s.whatsapp.net or @g.us');
  }
  
  // Calculate human-like delay based on message length
  const minDelay = baseDelay || 1000; // 1 second minimum
  const maxDelay = Math.max(minDelay + (text.length * 50), 3000); // Up to 3 seconds base + typing time
  const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
  
  try {
    // Send typing indicator (composing state)
    await sock.sendPresenceUpdate('composing', normalizedJid);
    console.log(`⌨️ Typing indicator sent to ${normalizedJid}`);
    
    // Wait for human-like delay
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    
    // Send the actual message
    await sock.sendMessage(normalizedJid, { text });
    
    // Stop typing indicator
    await sock.sendPresenceUpdate('available', normalizedJid);
    
    console.log(`✅ Human-like message sent to ${normalizedJid} after ${randomDelay}ms delay: "${text}"`);
  } catch (error) {
    console.error(`❌ Failed to send human-like message to ${normalizedJid}:`, error);
    // Fallback to regular message sending
    await sock.sendMessage(normalizedJid, { text });
  }
}
