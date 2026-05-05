import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@divisor-agent/server';

export const trpc = createTRPCReact<AppRouter>();
