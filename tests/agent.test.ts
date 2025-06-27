import { generateGreeting } from '../src/agents/turkishNegotiator';

// Mock global fetch
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    choices: [
      {
        message: { content: 'Merhaba Ahmet Bey, saç kesimi için uygun bir zamanınız var mı?' }
      }
    ]
  })
});

global.fetch = mockFetch as any;

it('includes name in prompt', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const name = 'Ahmet';
  await generateGreeting(name);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
  const userMessage = body.messages.find((m: any) => m.role === 'user').content;
  expect(userMessage).toMatch(name);
}); 