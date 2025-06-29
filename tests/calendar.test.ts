import { createCalEvent } from '../src/calendar/google';

// Mock googleapis package
jest.mock('googleapis', () => {
  const eventsInsertMock = jest.fn().mockResolvedValue({ data: { id: 'abc123' } });
  const calendarMock = jest.fn().mockReturnValue({ events: { insert: eventsInsertMock } });
  return {
    google: {
      auth: {
        OAuth2: jest.fn().mockImplementation(() => ({
          setCredentials: jest.fn()
        }))
      },
      calendar: calendarMock
    }
  };
}, { virtual: true });

it('calls Google Calendar API with correct params', async () => {
  process.env.GOOGLE_CLIENT_ID = 'id';
  process.env.GOOGLE_CLIENT_SECRET = 'secret';
  process.env.GOOGLE_REDIRECT = 'http://localhost';
  process.env.GOOGLE_REFRESH_TOKEN = 'rt';

  const start = new Date('2025-01-01T10:00:00Z');
  const end = new Date('2025-01-01T11:00:00Z');

  const eventId = await createCalEvent({ start, end, summary: 'Test' });

  expect(eventId).toBe('abc123');

  // Ensure insert was called with correct body
  const { google } = jest.requireMock('googleapis');
  const calendarFn = google.calendar as jest.Mock;
  const calledArgs = calendarFn.mock.calls[0][0];
  expect(calledArgs.version).toBe('v3');
}); 