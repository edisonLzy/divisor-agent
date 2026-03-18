export function getPort(): number {
  return Number(process.env.PORT) || 3000;
}
