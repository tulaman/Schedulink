import { normalizeJid } from '../src/whatsapp/index';

describe('JID Normalization', () => {
  it('should normalize phone numbers to JID format', () => {
    expect(normalizeJid('905551234567')).toBe('905551234567@s.whatsapp.net');
    expect(normalizeJid('1234567890')).toBe('1234567890@s.whatsapp.net');
    expect(normalizeJid('12345678901')).toBe('12345678901@s.whatsapp.net');
  });

  it('should return existing JID format unchanged', () => {
    expect(normalizeJid('905551234567@s.whatsapp.net')).toBe('905551234567@s.whatsapp.net');
    expect(normalizeJid('905551234567@g.us')).toBe('905551234567@g.us');
    expect(normalizeJid('123456789012@s.whatsapp.net')).toBe('123456789012@s.whatsapp.net');
  });

  it('should clean phone numbers before normalizing', () => {
    expect(normalizeJid('+90 555 123 45 67')).toBe('905551234567@s.whatsapp.net');
    expect(normalizeJid('(555) 123-4567')).toBe('5551234567@s.whatsapp.net');
    expect(normalizeJid('+1-555-123-4567')).toBe('15551234567@s.whatsapp.net');
    expect(normalizeJid('0555 123 45 67')).toBe('05551234567@s.whatsapp.net');
  });

  it('should throw error for invalid phone numbers', () => {
    expect(() => normalizeJid('123')).toThrow('Invalid phone number: must be at least 10 digits');
    expect(() => normalizeJid('12345')).toThrow('Invalid phone number: must be at least 10 digits');
    expect(() => normalizeJid('123456789')).toThrow('Invalid phone number: must be at least 10 digits');
  });

  it('should throw error for invalid JID input', () => {
    expect(() => normalizeJid('')).toThrow('Invalid JID: JID must be a non-empty string');
    expect(() => normalizeJid(null as any)).toThrow('Invalid JID: JID must be a non-empty string');
    expect(() => normalizeJid(undefined as any)).toThrow('Invalid JID: JID must be a non-empty string');
  });

  it('should handle special characters and spaces', () => {
    expect(normalizeJid('(905) 551-234-567')).toBe('905551234567@s.whatsapp.net');
    expect(normalizeJid('+90.555.123.45.67')).toBe('905551234567@s.whatsapp.net');
    expect(normalizeJid('90 555 123 45 67')).toBe('905551234567@s.whatsapp.net');
  });

  it('should maintain consistency for the same number in different formats', () => {
    const phoneNumber = '905551234567';
    const phoneWithSpaces = '90 555 123 45 67';
    const phoneWithCountryCode = '+90 555 123 45 67';
    const phoneWithDashes = '90-555-123-45-67';
    const expectedJid = '905551234567@s.whatsapp.net';

    expect(normalizeJid(phoneNumber)).toBe(expectedJid);
    expect(normalizeJid(phoneWithSpaces)).toBe(expectedJid);
    expect(normalizeJid(phoneWithCountryCode)).toBe(expectedJid);
    expect(normalizeJid(phoneWithDashes)).toBe(expectedJid);
  });
}); 