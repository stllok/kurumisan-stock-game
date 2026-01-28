import { describe, it, expect } from 'bun:test';

describe('Example Test Suite', () => {
  it('should pass a simple assertion', () => {
    const value = 1 + 1;
    expect(value).toBe(2);
  });

  it('should handle async operations', async () => {
    const result = await Promise.resolve('async result');
    expect(result).toBe('async result');
  });

  it('should check object properties', () => {
    const user = {
      name: 'Test User',
      age: 30,
    };
    expect(user.name).toBe('Test User');
    expect(user.age).toBeGreaterThanOrEqual(18);
  });
});
