import { Telegraf } from 'telegraf';
import { createBot } from '../src/telegram/bot';
import { sendWaMessage } from '../src/whatsapp';

jest.mock('telegraf');
jest.mock('../src/whatsapp');

const TelegrafMock = Telegraf as jest.MockedClass<typeof Telegraf>;
const sendMock = sendWaMessage as jest.MockedFunction<typeof sendWaMessage>;

it('forwards /wa to WhatsApp', async () => {
  const reply = jest.fn();
    TelegrafMock.mockImplementation(() => {
      return {
        command(cmd: string, handler: any) {
          if (cmd === 'wa') {
            handler({
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
  await Promise.resolve();
  expect(sendMock).toHaveBeenCalledWith('123', 'hey');
  expect(reply).toHaveBeenCalledWith('sent');
});
