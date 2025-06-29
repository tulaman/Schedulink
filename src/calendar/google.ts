import { google } from 'googleapis';
import 'dotenv/config';

export interface CalendarEventInput {
  start: Date | string; // ISO string or Date
  end: Date | string;
  summary: string;
}

function toISOString(input: Date | string): string {
  if (typeof input === 'string') return new Date(input).toISOString();
  return input.toISOString();
}

function getOAuthClient() {
  const {
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: clientSecret,
    GOOGLE_REDIRECT: redirectUri,
    GOOGLE_REFRESH_TOKEN: refreshToken
  } = process.env;

  if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
    throw new Error('Google Calendar credentials not set in environment');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

/**
 * Inserts an event in the authenticated user\'s primary calendar.
 * Returns the created Google Calendar event ID.
 */
export async function createCalEvent({ start, end, summary }: CalendarEventInput): Promise<string> {
  const auth = getOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary,
      start: { dateTime: toISOString(start) },
      end: { dateTime: toISOString(end) }
    }
  });

  return res.data.id as string;
} 