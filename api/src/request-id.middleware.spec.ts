import { RequestIdMiddleware } from './request-id.middleware.js';

describe('RequestIdMiddleware', () => {
  it('preserves a safe incoming X-Request-ID and echoes it', () => {
    const req = { get: jest.fn().mockReturnValue('edge-request-17') };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();

    new RequestIdMiddleware().use(req as never, res as never, next);

    expect(req.get).toHaveBeenCalledWith('X-Request-ID');
    expect((req as { requestId?: string }).requestId).toBe('edge-request-17');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'edge-request-17');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a safe ID when the incoming header is invalid', () => {
    const req = { get: jest.fn().mockReturnValue('bad\r\nid') };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();

    new RequestIdMiddleware().use(req as never, res as never, next);

    const generatedId = (req as { requestId: string }).requestId;
    expect(generatedId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', generatedId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, 'x'.repeat(129)])(
    'generates a fresh bounded ID when the incoming header is missing or overlong',
    (incomingId) => {
      const req = { get: jest.fn().mockReturnValue(incomingId) };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      new RequestIdMiddleware().use(req as never, res as never, next);

      const generatedId = (req as { requestId: string }).requestId;
      expect(generatedId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(generatedId).not.toBe(incomingId);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', generatedId);
      expect(next).toHaveBeenCalledTimes(1);
    },
  );
});
