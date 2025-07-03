import { Telegraf } from 'telegraf';
import { createBot } from '../src/telegram/bot';
import fs from 'fs/promises';

jest.mock('telegraf');
jest.mock('fs/promises');

// Mock the WhatsApp module properly
jest.mock('../src/whatsapp/index', () => ({
  sendWaMessage: jest.fn(),
  normalizeJid: jest.fn((jid: string) => {
    if (jid.includes('@')) return jid;
    if (jid.length < 10) throw new Error('Invalid phone number: must be at least 10 digits');
    return `${jid.replace(/[^\d]/g, '')}@s.whatsapp.net`;
  })
}));

const TelegrafMock = Telegraf as jest.MockedClass<typeof Telegraf>;
const fsMock = fs as jest.Mocked<typeof fs>;

// Import the mocked functions
const { sendWaMessage: mockSendWaMessage } = jest.requireMock('../src/whatsapp/index');

describe('Telegram Bot WhatsApp Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards /wa to WhatsApp successfully with phone number', async () => {
    const reply = jest.fn();
    fsMock.writeFile.mockResolvedValue(undefined);
    mockSendWaMessage.mockResolvedValue(undefined as any);
    
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
    
    expect(mockSendWaMessage).toHaveBeenCalledWith('905551234567@s.whatsapp.net', 'hey');
    expect(reply).toHaveBeenCalledWith('sent');
  });

  it('forwards /wa to WhatsApp successfully with full JID', async () => {
    const reply = jest.fn();
    fsMock.writeFile.mockResolvedValue(undefined);
    mockSendWaMessage.mockResolvedValue(undefined as any);
    
    let handlerPromise: Promise<any> = Promise.resolve();
    TelegrafMock.mockImplementation(() => {
      return {
        command(cmd: string, handler: any) {
          if (cmd === 'wa') {
            handlerPromise = handler({
              chat: { id: 1 },
              message: { text: '/wa 905551234567@s.whatsapp.net hey' },
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
    
    expect(mockSendWaMessage).toHaveBeenCalledWith('905551234567@s.whatsapp.net', 'hey');
    expect(reply).toHaveBeenCalledWith('sent');
  });

  it('handles /wa command with invalid JID', async () => {
    const reply = jest.fn();
    fsMock.writeFile.mockResolvedValue(undefined);
    
    let handlerPromise: Promise<any> = Promise.resolve();
    TelegrafMock.mockImplementation(() => {
      return {
        command(cmd: string, handler: any) {
          if (cmd === 'wa') {
            handlerPromise = handler({
              chat: { id: 1 },
              message: { text: '/wa 123 hey' },
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
    
    expect(reply).toHaveBeenCalledWith('❌ Error: Invalid phone number: must be at least 10 digits');
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
