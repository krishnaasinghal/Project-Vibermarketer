import { AsyncLocalStorage } from "node:async_hooks";

const ownerAls = new AsyncLocalStorage<string>();

/** Run a request handler scoped to an authenticated workspace owner. */
export function runWithWorkspaceOwner<T>(
  ownerId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return ownerAls.run(ownerId, fn);
}

export function getWorkspaceOwnerId(): string | undefined {
  return ownerAls.getStore();
}
