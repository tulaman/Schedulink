import { createMachine, assign } from 'xstate';
import { createCalEvent } from '../calendar/google.js';

export interface ConversationContext {
  /** Recognised appointment time as HH:MM string, if any */
  time?: string;
  /** Recognised slot range */
  slot?: { start: string; end: string };
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
              guard: 'isSlotRange',
              actions: ['saveSlotRange', 'bookSlot'],
              target: 'done'
            },
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
      }),
      saveSlotRange: assign(({ event }) => {
        const ev = event as ConversationEvent;
        return ev.type === 'BARBER_REPLY' ? { slot: parseSlotRange(ev.text) ?? undefined } : {};
      }),
      bookSlot: async ({ context }) => {
        if (!context.slot) return;
        try {
          const today = new Date();
          const startTime = new Date(today);
          const endTime = new Date(today);
          
          // Set the time components from the slot
          const [startHour, startMinute] = context.slot.start.split(':').map(Number);
          const [endHour, endMinute] = context.slot.end.split(':').map(Number);
          
          startTime.setHours(startHour, startMinute, 0, 0);
          endTime.setHours(endHour, endMinute, 0, 0);
          
          await createCalEvent({
            start: startTime,
            end: endTime,
            summary: 'Saç kesimi randevusu'
          });
        } catch (err) {
          console.error('Failed to create calendar event', err);
        }
      }
    },
    guards: {
      isTime: ({ event }) => {
        if ((event as ConversationEvent).type === 'BARBER_REPLY') {
          const ev = event as any;
          return parseTime(ev.text) !== null;
        }
        return false;
      },
      isSlotRange: ({ event }) => {
        if ((event as ConversationEvent).type === 'BARBER_REPLY') {
          return parseSlotRange((event as any).text) !== null;
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

/**
 * Parses a slot range "HH:MM-HH:MM" or "HH:MM – HH:MM" from given text.
 * Returns {start,end} strings or null if not found.
 */
export function parseSlotRange(text: string): { start: string; end: string } | null {
  const regex = /\b([01]?\d|2[0-3]):([0-5]\d)\s*[\-–]\s*([01]?\d|2[0-3]):([0-5]\d)\b/;
  const m = regex.exec(text);
  if (!m) return null;
  const start = `${m[1].padStart(2, '0')}:${m[2]}`;
  const end = `${m[3].padStart(2, '0')}:${m[4]}`;
  return { start, end };
} 