// Mock @openai/agents module to avoid ES module import issues
jest.mock('@openai/agents', () => ({
  Agent: jest.fn().mockImplementation(() => ({
    // Mock agent methods if needed
  })),
  run: jest.fn().mockResolvedValue('mocked response')
}));

// Mock @openai/agents-core module
jest.mock('@openai/agents-core', () => ({
  setDefaultModelProvider: jest.fn()
})); 