import type { AppRouter } from "@divisor-agent/server/router";
import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import superjson from "superjson";

const DEFAULT_SERVER_URL = "http://localhost:3000/trpc";

function getServerUrl() {
  const configuredUrl = import.meta.env?.VITE_SERVER_URL;

  if (typeof configuredUrl === "string" && configuredUrl.trim().length > 0) {
    return configuredUrl;
  }

  return DEFAULT_SERVER_URL;
}

export const trpcClient: TRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: getServerUrl(),
      transformer: superjson,
    }),
  ],
});
