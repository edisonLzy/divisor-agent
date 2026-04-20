export function getPort(): number {
  return Number(process.env.PORT) || 3000;
}

export function getMinimaxApiKey(): string | undefined {
  return process.env.MINIMAX_API_KEY;
}
