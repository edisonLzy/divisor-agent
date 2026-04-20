import { createTRPCReact } from '@trpc/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@divisor-agent/server/router';

const DEFAULT_SERVER_BASE_URL = 'http://localhost:3000';

function getServerBaseUrl(): string {
  return import.meta.env.VITE_SERVER_BASE_URL ?? DEFAULT_SERVER_BASE_URL;
}

export const trpc = createTRPCReact<AppRouter>();

export function createTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getServerBaseUrl()}/trpc`,
        transformer: superjson,
      }),
    ],
  });
}
