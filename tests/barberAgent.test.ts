import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { startConversationWithBarber, continueConversationWithBarber } from '../src/agents/barberAgent';

// Mock OpenAI Agents SDK
jest.mock('@openai/agents', () => ({
  Agent: jest.fn().mockImplementation(() => ({})),
  run: jest.fn(),
  tool: jest.fn().mockImplementation((config: any) => config),
}));

// Mock calendar
jest.mock('../src/calendar/google', () => ({
  createCalEvent: jest.fn().mockResolvedValue({}),
}));

const { run } = require('@openai/agents');

describe('BarberAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should start conversation with barber', async () => {
    const mockResponse = 'Merhaba! Saç kesimi randevusu almak istiyorum. Bugün veya yarın müsait saatleriniz var mı?';
    (run as jest.MockedFunction<typeof run>).mockResolvedValue({
      finalOutput: mockResponse,
      history: []
    });

    const result = await startConversationWithBarber('test@whatsapp.net', 'Ahmet', 'Mehmet Berber');

    expect(result).toBe(mockResponse);
    expect(run).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringContaining('Mehmet Berber ismindeki berbere Ahmet adına saç kesimi randevusu almak')
    );
  });

  it('should continue conversation with barber response', async () => {
    // First start a conversation
    const initialResponse = 'Merhaba! Randevu istiyorum.';
    (run as jest.MockedFunction<typeof run>).mockResolvedValueOnce({
      finalOutput: initialResponse,
      history: []
    });

    await startConversationWithBarber('test@whatsapp.net', 'Ahmet');

    // Then continue with barber response
    const continueResponse = 'Tabii, saat 15:00 uygun mu?';
    (run as jest.MockedFunction<typeof run>).mockResolvedValueOnce({
      finalOutput: continueResponse,
      history: []
    });

    const result = await continueConversationWithBarber('test@whatsapp.net', '15:00 uygun');

    expect(result).toBe(continueResponse);
    expect(run).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringContaining('Berber şöyle cevap verdi: "15:00 uygun"')
    );
  });

  it('should throw error for non-existent conversation', async () => {
    await expect(
      continueConversationWithBarber('nonexistent@whatsapp.net', 'test message')
    ).rejects.toThrow('Conversation not found');
  });
}); 