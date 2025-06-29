// xstate v5 – dynamic import of createActor inside test

import { conversationMachine } from '../src/agents/conversationMachine';
import { createActor } from 'xstate';

// Mock calendar module so we do not hit real Google API in tests
jest.mock('../src/calendar/google.js', () => ({
  createCalEvent: jest.fn().mockResolvedValue('evt-123')
}), { virtual: true });

const { createCalEvent } = jest.requireMock('../src/calendar/google.js');

it('reaches done after barber replies with HH:MM', () => {
  const actor = createActor(conversationMachine).start();

  // simulate bot finished sending greeting and moved on
  actor.send({ type: 'GREETING_SENT' });

  // fake barber message
  actor.send({ type: 'BARBER_REPLY', text: '15:30' });

  expect(actor.getSnapshot().matches('done')).toBe(true);
});

it('creates calendar event for slot range and reaches done', async () => {
  const actor = createActor(conversationMachine).start();

  actor.send({ type: 'GREETING_SENT' });
  actor.send({ type: 'BARBER_REPLY', text: '15:30-16:00' });

  // allow async actions to complete
  await Promise.resolve();

  expect(actor.getSnapshot().matches('done')).toBe(true);
  const today = new Date();
  const expectedStart = new Date(today);
  const expectedEnd = new Date(today);
  expectedStart.setHours(15, 30, 0, 0);
  expectedEnd.setHours(16, 0, 0, 0);

  expect(createCalEvent).toHaveBeenCalledWith({
    start: expectedStart,
    end: expectedEnd,
    summary: 'Saç kesimi randevusu'
  });
}); 