declare global {
  namespace Express {
    interface Response {
      success: <T>(data: T) => void;
    }
    interface Request {
      user?: unknown;
    }
  }
}
export {};
