import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@divisor-agent/server/router';

export const trpc = createTRPCReact<AppRouter>();

const SERVER_BASE_URL = (import.meta.env.VITE_SERVER_BASE_URL as string | undefined) ?? 'http://localhost:3000';

export function TrpcProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({
          enabled: (opts) =>
            Boolean(import.meta.env.DEV || (opts.direction === 'down' && opts.result instanceof Error)),
        }),
        httpBatchLink({
          url: `${SERVER_BASE_URL}/trpc`,
          transformer: superjson,
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
