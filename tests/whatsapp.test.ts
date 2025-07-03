import { Telegraf } from 'telegraf';
import { createBot } from '../src/telegram/bot';
import { sendWaMessage } from '../src/whatsapp';
import fs from 'fs/promises';

jest.mock('telegraf');
jest.mock('../src/whatsapp');
jest.mock('fs/promises');

const TelegrafMock = Telegraf as jest.MockedClass<typeof Telegraf>;
const sendMock = sendWaMessage as jest.MockedFunction<typeof sendWaMessage>;

const fsMock = fs as jest.Mocked<typeof fs>;

describe('Telegram Bot WhatsApp Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards /wa to WhatsApp successfully', async () => {
    const reply = jest.fn();
    fsMock.writeFile.mockResolvedValue(undefined);
    sendMock.mockResolvedValue(undefined as any);
    
    let handlerPromise: Promise<any> = Promise.resolve();
    TelegrafMock.mockImplementation(() => {
      return {
        command(cmd: string, handler: any) {
          if (cmd === 'wa') {
            handlerPromise = handler({
              chat: { id: 1 },
              message: { text: '/wa 905551234567 hey' },
              reply
            } as any);
          }
          return this;
        }
      } as any;
    });
    
    process.env.TELEGRAM_BOT_TOKEN = 't';
    createBot();
    await handlerPromise;
    await Promise.resolve();
    
    expect(sendMock).toHaveBeenCalledWith('905551234567', 'hey');
    expect(reply).toHaveBeenCalledWith('sent');
  });

  it('handles /wa command with invalid JID', async () => {
    const reply = jest.fn();
    fsMock.writeFile.mockResolvedValue(undefined);
    sendMock.mockRejectedValue(new Error('Invalid JID format: must end with @s.whatsapp.net or @g.us'));
    
    let handlerPromise: Promise<any> = Promise.resolve();
    TelegrafMock.mockImplementation(() => {
      return {
        command(cmd: string, handler: any) {
          if (cmd === 'wa') {
            handlerPromise = handler({
              chat: { id: 1 },
              message: { text: '/wa invalid_jid hey' },
              reply
            } as any);
          }
          return this;
        }
      } as any;
    });
    
    process.env.TELEGRAM_BOT_TOKEN = 't';
    createBot();
    await handlerPromise;
    await Promise.resolve();
    
    expect(sendMock).toHaveBeenCalledWith('invalid_jid', 'hey');
    expect(reply).toHaveBeenCalledWith('❌ Error: Invalid JID format: must end with @s.whatsapp.net or @g.us');
  });

  it('shows usage message for incomplete /wa command', async () => {
    const reply = jest.fn();
    fsMock.writeFile.mockResolvedValue(undefined);
    
    let handlerPromise: Promise<any> = Promise.resolve();
    TelegrafMock.mockImplementation(() => {
      return {
        command(cmd: string, handler: any) {
          if (cmd === 'wa') {
            handlerPromise = handler({
              chat: { id: 1 },
              message: { text: '/wa' },
              reply
            } as any);
          }
          return this;
        }
      } as any;
    });
    
    process.env.TELEGRAM_BOT_TOKEN = 't';
    createBot();
    await handlerPromise;
    await Promise.resolve();
    
    expect(reply).toHaveBeenCalledWith('Usage: /wa <phone_number_or_jid> <text>\nExample: /wa 905551234567 Hello\nOr: /wa 905551234567@s.whatsapp.net Hello');
  });
});
