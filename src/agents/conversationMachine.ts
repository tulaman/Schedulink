import { createMachine, assign } from 'xstate';

export interface ConversationContext {
  /** Recognised appointment time as HH:MM string, if any */
  time?: string;
}

export type ConversationEvent =
  | { type: 'GREETING_SENT' }
  | { type: 'BARBER_REPLY'; text: string };

/**
 * Very first version of the booking dialogue finite-state machine.
 * Flow: greet → askSlots → done
 *
 * greet      – bot sends personalised greeting via WhatsApp.
 * askSlots   – bot asks available times (“Hangi saatler müsait?”) and waits for reply.
 * done       – barber replied with a time that matches HH:MM regex; context.time is set.
 */
export const conversationMachine = createMachine(
  {
    /**
     * Use the XState v5 `types` block to give the machine strong typing instead
     * of generic parameters.
     */
    types: {} as {
      context: ConversationContext;
      events: ConversationEvent;
    },

    id: 'conversation',
    initial: 'greet',
    states: {
      greet: {
        entry: 'sendGreeting',
        on: {
          GREETING_SENT: 'askSlots'
        }
      },
      askSlots: {
        entry: 'askAvailableSlots',
        on: {
          BARBER_REPLY: [
            {
              guard: 'isTime',
              actions: 'saveTime',
              target: 'done'
            },
            { target: 'askSlots' }
          ]
        }
      },
      done: {
        type: 'final'
      }
    }
  },
  {
    actions: {
      sendGreeting: () => {
        /* side-effect handled by caller */
      },
      askAvailableSlots: () => {
        /* side-effect handled by caller, e.g. send "Hangi saatler müsait?" */
      },
      saveTime: assign(({ event }) => {
        const ev = event as ConversationEvent;
        return ev.type === 'BARBER_REPLY' ? { time: parseTime(ev.text) ?? undefined } : {};
      })
    },
    guards: {
      isTime: ({ event }) => {
        if ((event as ConversationEvent).type === 'BARBER_REPLY') {
          const ev = event as any;
          return parseTime(ev.text) !== null;
        }
        return false;
      }
    }
  }
);

/**
 * Very naive parser that recognises the first 24-hour time string (HH:MM) in the text.
 * Accepts both zero-padded and non-padded hours (e.g. "8:05" or "08:05").
 */
export function parseTime(text: string): string | null {
  const match = /\b([01]?\d|2[0-3]):[0-5]\d\b/.exec(text);
  return match ? match[0] : null;
} 