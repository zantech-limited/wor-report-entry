"use client";

type DraftFlusher = () => Promise<void> | void;

const flushers = new Set<DraftFlusher>();
const flushLimitMs = 8000;

export function onDraftFlush(flusher: DraftFlusher) {
  flushers.add(flusher);
  return () => {
    flushers.delete(flusher);
  };
}

export async function flushDeviceDrafts() {
  await Promise.all(
    [...flushers].map((flusher) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, flushLimitMs);
      });
      return Promise.race([
        Promise.resolve()
          .then(() => flusher())
          .then(() => undefined)
          .catch(() => undefined),
        limit,
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      });
    }),
  );
}
