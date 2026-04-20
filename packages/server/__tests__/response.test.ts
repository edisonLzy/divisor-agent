import { describe, it, expect, vi } from 'vitest';
import { createResponseMiddleware } from '../src/middlewares/response.js';
import type { Request, Response } from 'express';

describe('createResponseMiddleware', () => {
  it('should attach success method to response', () => {
    const middleware = createResponseMiddleware();
    const req = {} as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.success).toBeDefined();
    expect(next).toHaveBeenCalled();
  });

  it('should format success response correctly', () => {
    const middleware = createResponseMiddleware();
    const req = {} as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    middleware(req, res, next);

    res.success({ foo: 'bar' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      code: 0,
      data: { foo: 'bar' },
      timestamp: expect.any(String),
    });
  });
});
