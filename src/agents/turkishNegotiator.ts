// Legacy function - now integrated into barberAgent.ts
// This file is kept for backward compatibility and testing

export async function generateGreeting(name: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const systemPrompt =
    'You are a native Turkish speaker acting as a friendly personal assistant. You will write short, warm messages to schedule appointments with a barber on behalf of the user.';

  // We keep the user prompt very explicit so it is easy to test in Jest.
  const userPrompt = `Aşağıdaki ismi kullanarak berbere samimi bir selamla ve saç kesimi randevusu iste:\n\nİsim: ${name}`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 60
    })
  });

  if (!resp.ok) {
    throw new Error(`OpenAI error: ${resp.status} ${await resp.text()}`);
  }

  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0].message.content.trim();
} 