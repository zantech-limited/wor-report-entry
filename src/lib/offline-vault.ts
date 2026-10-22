"use client";
import { openDB } from "idb";
import type { FieldJob } from "./field-model";
export type LocalDraft = {
  id: string;
  job: FieldJob;
  revision: number;
  operationId: string;
  submit: boolean;
  updatedAt: string;
  conflict?: string;
};
const store = () =>
  openDB("zantech-field-v1", 1, {
    upgrade(db) {
      db.createObjectStore("values");
    },
  });
const encode = (bytes: Uint8Array) => {
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(text);
};
const decode = (text: string) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
async function derive(pin: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt),
      iterations: 210000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function seal(key: CryptoKey, data: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return { iv: encode(iv), value: encode(new Uint8Array(bytes)) };
}
async function unseal<T>(key: CryptoKey, data: { iv: string; value: string }) {
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: decode(data.iv) },
        key,
        decode(data.value),
      ),
    ),
  ) as T;
}
export async function unlockVault(context: string, pin: string) {
  if (pin.length < 6)
    throw new Error("Use a device passphrase of at least six characters.");
  if (!crypto.subtle)
    throw new Error("Offline storage requires HTTPS or localhost.");
  const db = await store(),
    meta = (await db.get("values", context + ":vault")) as
      { salt: string; check: { iv: string; value: string } } | undefined;
  const salt = meta
      ? decode(meta.salt)
      : crypto.getRandomValues(new Uint8Array(16)),
    key = await derive(pin, salt);
  if (meta) {
    try {
      if ((await unseal(key, meta.check)) !== context) throw new Error();
    } catch {
      throw new Error("That device passphrase could not unlock the drafts.");
    }
  } else
    await db.put(
      "values",
      { salt: encode(salt), check: await seal(key, context) },
      context + ":vault",
    );
  if (navigator.storage?.persist) void navigator.storage.persist();
  return key;
}
let tail: Promise<unknown> = Promise.resolve();
export function vaultPut(
  context: string,
  key: CryptoKey,
  id: string,
  value: unknown,
) {
  const operation = tail
    .catch(() => {})
    .then(async () => {
      const db = await store();
      await db.put("values", await seal(key, value), context + ":" + id);
    });
  tail = operation;
  return operation;
}
export async function vaultGet<T>(context: string, key: CryptoKey, id: string) {
  await tail.catch(() => {});
  const db = await store(),
    row = await db.get("values", context + ":" + id);
  return row ? unseal<T>(key, row) : undefined;
}
export async function vaultDrafts(context: string, key: CryptoKey) {
  await tail.catch(() => {});
  const db = await store(),
    keys = await db.getAllKeys("values");
  return Promise.all(
    keys
      .filter(
        (id) => typeof id === "string" && id.startsWith(context + ":draft:"),
      )
      .map(async (id) => unseal<LocalDraft>(key, await db.get("values", id))),
  );
}
export async function vaultDelete(context: string, id: string) {
  await tail.catch(() => {});
  const db = await store();
  await db.delete("values", context + ":" + id);
}
export function acknowledgeDraft(
  context: string,
  key: CryptoKey,
  id: string,
  operationId: string,
  revision: number,
) {
  const task = tail
    .catch(() => {})
    .then(async () => {
      const db = await store(),
        stored = await db.get("values", context + ":draft:" + id);
      if (!stored) return undefined;
      const draft = await unseal<LocalDraft>(key, stored);
      if (draft.operationId === operationId) {
        await db.delete("values", context + ":draft:" + id);
        return undefined;
      }
      const advanced = {
        ...draft,
        revision: Math.max(draft.revision, revision),
      };
      await db.put(
        "values",
        await seal(key, advanced),
        context + ":draft:" + id,
      );
      return advanced;
    });
  tail = task;
  return task;
}
export async function downloadRecovery(
  context: string,
  key?: CryptoKey,
  current?: LocalDraft,
) {
  await tail.catch(() => {});
  const db = await store(),
    keys = await db.getAllKeys("values"),
    values = [];
  for (const id of keys)
    if (typeof id === "string" && id.startsWith(context + ":"))
      values.push([id, await db.get("values", id)]);
  if (key && current) {
    const id = context + ":draft:" + current.id,
      index = values.findIndex((item) => item[0] === id),
      saved = [id, await seal(key, current)];
    if (index >= 0) values[index] = saved;
    else values.push(saved);
  }
  const blob = new Blob(
      [
        JSON.stringify({
          format: "zantech-encrypted-device-recovery",
          context,
          values,
        }),
      ],
      { type: "application/json" },
    ),
    url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "zantech-encrypted-device-recovery.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importRecovery(
  context: string,
  key: CryptoKey,
  file: File,
  passphrase: string,
) {
  if (file.size > 50 * 1024 * 1024)
    throw new Error("Recovery file is too large.");
  const value = JSON.parse(await file.text());
  if (
    value.format !== "zantech-encrypted-device-recovery" ||
    value.context !== context ||
    !Array.isArray(value.values) ||
    value.values.length > 10000
  )
    throw new Error("Choose this account's device recovery file.");
  const metadata = value.values.find(
    (item: unknown[]) => Array.isArray(item) && item[0] === context + ":vault",
  )?.[1];
  if (!metadata || !passphrase)
    throw new Error("Enter the recovery file’s device passphrase.");
  const sourceKey = await derive(passphrase, decode(metadata.salt));
  if ((await unseal(sourceKey, metadata.check)) !== context)
    throw new Error("That passphrase cannot unlock this recovery.");
  const restored: LocalDraft[] = [];
  for (const item of value.values) {
    if (
      !Array.isArray(item) ||
      typeof item[0] !== "string" ||
      !item[0].startsWith(context + ":draft:")
    )
      continue;
    const draft = await unseal<LocalDraft>(sourceKey, item[1]);
    if (!draft.id || !draft.job || !draft.operationId)
      throw new Error("Invalid recovery draft.");
    restored.push(draft);
  }
  for (const draft of restored) {
    const existing = await vaultGet<LocalDraft>(
      context,
      key,
      "draft:" + draft.id,
    );
    if (existing)
      await vaultPut(
        context,
        key,
        "archive:" + draft.id + ":" + crypto.randomUUID(),
        existing,
      );
    await vaultPut(context, key, "draft:" + draft.id, draft);
  }
  return restored.length;
}
