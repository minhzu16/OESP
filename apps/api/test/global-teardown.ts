export default async function globalTeardown(): Promise<void> {
  const container = (globalThis as any).__PG_CONTAINER__;
  if (container) await container.stop();
}
