import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import type { AppLogger } from './app-logger.service';

describe('HttpExceptionFilter production redaction', () => {
  it('returns a generic 5xx envelope and logs no error detail or stack', () => {
    const logError = jest.fn();
    const appLogger = {
      logError,
      logRequest: jest.fn(),
    } as unknown as AppLogger;
    const filter = new HttpExceptionFilter(appLogger, 'production');
    const response = {
      status: jest.fn(),
      json: jest.fn(),
    };
    response.status.mockReturnValue(response);
    const request = {
      requestId: 'request-safe-id',
      method: 'GET',
      path: '/health',
      _startTime: Date.now(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    };

    filter.catch(
      new InternalServerErrorException('Sensitive diagnostic sentinel: abc123'),
      host as never,
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred. Please try again later.',
        request_id: 'request-safe-id',
      },
    });
    const loggedError = JSON.stringify(logError.mock.calls);
    expect(loggedError).not.toContain('Sensitive diagnostic sentinel');
    expect(loggedError).not.toContain('abc123');
    expect(loggedError).toContain('details redacted');
    expect(loggedError).not.toContain('stack');
  });

  it('redacts sensitive diagnostics embedded in a client error message', () => {
    const appLogger = {
      logError: jest.fn(),
      logRequest: jest.fn(),
    } as unknown as AppLogger;
    const filter = new HttpExceptionFilter(appLogger, 'production');
    const response = { status: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          requestId: 'request-safe-id',
          method: 'POST',
          path: '/teams',
        }),
        getResponse: () => response,
      }),
    };

    filter.catch(
      new BadRequestException(
        'Invalid config DATABASE_URL=postgresql://user:secret@db/private\nError: connect failed\n    at Pool.connect (C:\\app\\db.js:1:2)',
      ),
      host as never,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'BAD_REQUEST',
        message: 'Request could not be completed.',
        request_id: 'request-safe-id',
      },
    });
  });

  it('preserves ordinary client validation messages', () => {
    const appLogger = {
      logError: jest.fn(),
      logRequest: jest.fn(),
    } as unknown as AppLogger;
    const filter = new HttpExceptionFilter(appLogger, 'production');
    const response = { status: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          requestId: 'request-safe-id',
          method: 'POST',
          path: '/teams',
        }),
        getResponse: () => response,
      }),
    };

    filter.catch(
      new BadRequestException('Team name must not be empty.'),
      host as never,
    );

    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'BAD_REQUEST',
        message: 'Team name must not be empty.',
        request_id: 'request-safe-id',
      },
    });
  });

  it('redacts standalone email and JWT-like values from client error messages', () => {
    const appLogger = {
      logError: jest.fn(),
      logRequest: jest.fn(),
    } as unknown as AppLogger;
    const filter = new HttpExceptionFilter(appLogger, 'production');
    const response = { status: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          requestId: 'request-safe-id',
          method: 'POST',
          path: '/teams/invitations',
        }),
        getResponse: () => response,
      }),
    };

    filter.catch(
      new BadRequestException(
        'Invalid recipient alice@example.invalid; credential abcdefgh.ijklmnop.qrstuvwx',
      ),
      host as never,
    );

    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'BAD_REQUEST',
        message: 'Request could not be completed.',
        request_id: 'request-safe-id',
      },
    });
  });
});
