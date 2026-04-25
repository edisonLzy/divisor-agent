# @divisor-agent/server

Express + TypeScript server for divisor-agent.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run type checks
pnpm type-check

# Run tests
pnpm test
```

## Project Structure

```
src/
├── app.ts                  # App factory, middleware setup
├── index.ts                # Entry point, server bootstrap
├── config/
│   └── env.ts              # Environment configuration
├── domain/
│   └── health/             # Health check domain
│       ├── health.controller.ts
│       ├── health.dto.ts
│       ├── health.routes.ts
│       └── health.service.ts
├── errors/
│   └── app-error.ts        # AppError class
├── middlewares/
│   ├── error.ts             # Global error handler
│   └── response.ts          # Response wrapper
├── shared/
│   └── logger.ts            # Pino logger & request logger middleware
└── types/
    ├── global.d.ts          # Global type declarations
    └── index.ts             # Shared type exports
```

## Tech Stack

- **Runtime**: Node.js (ESM)
- **Framework**: Express 5 + TypeScript
- **Logging**: Pino + pino-http + pino-pretty
- **Validation**: Zod
- **Security**: Helmet, CORS, compression
- **Testing**: Vitest

## API

### Health Check

```
GET /health
```

Returns server health status.

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

## Environment Variables

| Variable    | Default | Description                   |
| ----------- | ------- | ----------------------------- |
| `PORT`      | `3000`  | Server port                   |
| `NODE_ENV`  | -       | `production` or `development` |
| `LOG_LEVEL` | `info`  | Pino log level                |

Copy `.env.example` to `.env` to get started.

## Logging

- Development: Pretty-printed logs via `pino-pretty`
- Production: Structured JSON logs
- Request IDs are propagated via `x-request-id` header using `AsyncLocalStorage`
- Sensitive fields (auth headers, tokens, passwords) are automatically redacted
