import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@divisor-agent/server/router';

export const trpc = createTRPCReact<AppRouter>();
