import { expect, test } from "bun:test";
import { drafts, draftStorage } from "../../src/components/workspace/drafts";
import type { Document } from "../../src/bindings";

test("slow draft storage coalesces superseded snapshots before a commit", async () => {
  const original = draftStorage.put;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: string[] = [];
  draftStorage.put = async (doc) => {
    writes.push(doc.title);
    if (doc.title === "first") await gate;
  };
  const doc = {
    id: "coalescing-test",
    title: "first",
    segments: [],
  } as unknown as Document;
  try {
    drafts.write(doc);
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 100; i++) drafts.write({ ...doc, title: `edit-${i}` });
    const committed = drafts.run(doc.id, async () => {
      writes.push("commit");
    });
    release();
    await committed;
    expect(writes).toEqual(["first", "edit-99", "commit"]);
    expect(drafts.read(doc.id)?.title).toBe("edit-99");
  } finally {
    release();
    draftStorage.put = original;
  }
});
