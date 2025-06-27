import makeWASocket, { useMultiFileAuthState, WASocket } from 'baileys';

let sock: WASocket | null = null;

export async function initWhatsApp(onQR: (qrImage: Buffer) => Promise<void>) {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
  sock = makeWASocket({ auth: state });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async ({ qr }: { qr?: string }) => {
    if (qr) {
      const img = Buffer.from(qr);
      await onQR(img);
    }
  });
  return sock;
}

export function sendWaMessage(jid: string, text: string) {
  if (!sock) throw new Error('WhatsApp not initialised');
  return sock.sendMessage(jid, { text });
}
