import type { Document } from "./api";
import { commands } from "@/bindings";
const key = (id: string) => `workspace-draft-${id}`;
const cache = new Map<string, Document | null>();
const pending = new Map<string, Promise<unknown>>();
async function result<T>(
  operation: Promise<
    { status: "ok"; data: T } | { status: "error"; error: string }
  >,
): Promise<T> {
  const value = await operation;
  if (value.status === "error") throw new Error(value.error);
  return value.data;
}
/** One mutation order for staging, committing and discarding each document. */
function run<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const next = (pending.get(id) ?? Promise.resolve())
    .catch(() => {})
    .then(operation);
  pending.set(id, next);
  void next
    .finally(() => {
      if (pending.get(id) === next) pending.delete(id);
    })
    .catch(() => {});
  return next;
}
export const draftStorage = {
  get: (id: string) => result(commands.workspaceGetDraft(id)),
  put: (doc: Document) => result(commands.workspaceSaveDraft(doc)),
  remove: (id: string) => result(commands.workspaceDiscardDraft(id)),
};
export const drafts = {
  run,
  read(id: string): Document | null {
    return cache.get(id) ?? null;
  },
  async load(id: string) {
    return run(id, async () => {
      let saved = await draftStorage.get(id);
      if (!saved) {
        // One-time migration of earlier browser drafts into managed SQLite.
        try {
          saved = JSON.parse(localStorage.getItem(key(id)) || "null");
        } catch {
          /* malformed legacy draft */
        }
        if (saved && saved.id === id && Array.isArray(saved.segments))
          await draftStorage.put(saved);
        else saved = null;
      }
      cache.set(id, saved);
      localStorage.removeItem(key(id));
    });
  },
  write(doc: Document) {
    const snapshot = structuredClone(doc);
    cache.set(doc.id, snapshot);
    // Slow storage must not accumulate a full transcript write for every
    // keystroke. A newer snapshot supersedes any write that has not started.
    // The shared mutation order still puts the latest staging before commit.
    void run(doc.id, async () => {
      if (cache.get(doc.id) === snapshot) await draftStorage.put(snapshot);
    }).catch(() => {});
  },
  remove(id: string) {
    cache.delete(id);
    localStorage.removeItem(key(id));
  },
  async discard(id: string) {
    await run(id, () => draftStorage.remove(id));
    drafts.remove(id);
  },
};
