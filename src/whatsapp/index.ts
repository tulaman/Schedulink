import { makeWASocket, useMultiFileAuthState, WASocket } from 'baileys';
import QRCode from 'qrcode';

let sock: WASocket | null = null;

export async function initWhatsApp(onQR: (qrImage: Buffer) => Promise<void>) {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');

  async function startSock() {
    sock = makeWASocket({ auth: state });
    sock.ev.on('creds.update', saveCreds);

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
