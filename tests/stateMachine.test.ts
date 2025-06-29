// xstate v5 – dynamic import of createActor inside test

import { conversationMachine } from '../src/agents/conversationMachine';
import { createActor } from 'xstate';

it('reaches done after barber replies with HH:MM', () => {
  const actor = createActor(conversationMachine).start();

  // simulate bot finished sending greeting and moved on
  actor.send({ type: 'GREETING_SENT' });

  // fake barber message
  actor.send({ type: 'BARBER_REPLY', text: '15:30' });

  expect(actor.getSnapshot().matches('done')).toBe(true);
}); 