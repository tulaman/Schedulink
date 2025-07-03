import { Telegraf } from 'telegraf';
import { createBot, sendTelegramNotification } from '../src/telegram/bot';
import fs from 'fs/promises';

jest.mock('telegraf');
jest.mock('fs/promises');

const TelegrafMock = Telegraf as jest.MockedClass<typeof Telegraf>;
const fsMock = fs as jest.Mocked<typeof fs>;

describe('Telegram Bot Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('replies pong to /ping', () => {
    const reply = jest.fn();
    TelegrafMock.mockImplementation(() => {
      return {
        command(cmd: string, handler: any) {
          if (cmd === 'ping') {
            handler({ reply } as any);
          }
          return this;
        }
      } as any;
    });
    process.env.TELEGRAM_BOT_TOKEN = 'test';
    createBot();
    expect(reply).toHaveBeenCalledWith('pong');
  });

  describe('Telegram Notifications', () => {
    it('should send notification successfully when chat ID exists', async () => {
      const mockSendMessage = jest.fn().mockResolvedValue({});
      const mockTelegram = { sendMessage: mockSendMessage };
      
      TelegrafMock.mockImplementation(() => {
        return {
          command: jest.fn().mockReturnThis(),
          telegram: mockTelegram
        } as any;
      });

      // Mock file reading to return a valid chat ID
      fsMock.readFile.mockResolvedValue('123456789');

      process.env.TELEGRAM_BOT_TOKEN = 'test-token';
      createBot();

      const testMessage = '🎉 Запись подтверждена! Время: 15:00';
      await sendTelegramNotification(testMessage);

      expect(mockSendMessage).toHaveBeenCalledWith(123456789, testMessage);
    });

    it('should handle missing chat ID gracefully', async () => {
      const mockSendMessage = jest.fn();
      const mockTelegram = { sendMessage: mockSendMessage };
      
      TelegrafMock.mockImplementation(() => {
        return {
          command: jest.fn().mockReturnThis(),
          telegram: mockTelegram
        } as any;
      });

      // Mock file reading to fail (no chat ID saved)
      fsMock.readFile.mockRejectedValue(new Error('File not found'));

      process.env.TELEGRAM_BOT_TOKEN = 'test-token';
      createBot();

      const testMessage = '🎉 Запись подтверждена! Время: 15:00';
      await sendTelegramNotification(testMessage);

      // Should not attempt to send message when no chat ID
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should handle telegram API errors gracefully', async () => {
      const mockSendMessage = jest.fn().mockRejectedValue(new Error('Telegram API Error'));
      const mockTelegram = { sendMessage: mockSendMessage };
      
      TelegrafMock.mockImplementation(() => {
        return {
          command: jest.fn().mockReturnThis(),
          telegram: mockTelegram
        } as any;
      });

      fsMock.readFile.mockResolvedValue('123456789');

      process.env.TELEGRAM_BOT_TOKEN = 'test-token';
      createBot();

      const testMessage = '🎉 Запись подтверждена! Время: 15:00';
      
      // Should not throw error even if Telegram API fails
      await expect(sendTelegramNotification(testMessage)).resolves.not.toThrow();
      
      expect(mockSendMessage).toHaveBeenCalledWith(123456789, testMessage);
    });
  });
});
