import { AsyncLocalStorage } from "node:async_hooks";
const projection = new AsyncLocalStorage<boolean>();
export const isFieldProjection = () => projection.getStore() === true;
export function withFieldProjection<T>(work: () => Promise<T>) {
  return projection.run(true, work);
}
