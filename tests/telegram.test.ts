import { Telegraf } from 'telegraf';
import { createBot } from '../src/telegram/bot';

jest.mock('telegraf');

const TelegrafMock = Telegraf as jest.MockedClass<typeof Telegraf>;

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
