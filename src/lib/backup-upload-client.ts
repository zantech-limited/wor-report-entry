import { workOrderId } from "./work-order-id";
import { BACKUP_CHUNK_BYTES, BACKUP_MAX_BYTES } from "./backup-upload-limits";
export async function uploadBackupFile(
  file: File,
  send: (
    form: FormData,
  ) => Promise<{ count?: number; received?: number; message?: string }>,
  progress?: (message: string) => void,
) {
  if (!file.size || file.size > BACKUP_MAX_BYTES)
    throw new Error("Choose a JSON backup smaller than 100 MB.");
  const id = workOrderId(),
    total = Math.ceil(file.size / BACKUP_CHUNK_BYTES);
  for (let index = 0; index < total; index++) {
    progress?.(`Uploading backup ${index + 1} of ${total}…`);
    const form = new FormData();
    form.set("mode", "chunk");
    form.set("uploadId", id);
    form.set("index", String(index));
    form.set("size", String(file.size));
    form.set(
      "file",
      file.slice(index * BACKUP_CHUNK_BYTES, (index + 1) * BACKUP_CHUNK_BYTES),
      "backup-part",
    );
    await send(form);
  }
  progress?.("Checking and restoring backup…");
  const form = new FormData();
  form.set("mode", "finish");
  form.set("uploadId", id);
  return send(form);
}
