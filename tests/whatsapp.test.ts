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

it('forwards /wa to WhatsApp', async () => {
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
  expect(sendMock).toHaveBeenCalledWith('123', 'hey');
  expect(reply).toHaveBeenCalledWith('sent');
});
