import { describe, expect, test } from "bun:test";
import { SaveQueue } from "../../src/components/workspace/saveQueue";
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
describe("save barrier", () => {
  test("waits for an in-flight save and edits queued during it", async () => {
    const first = deferred(),
      second = deferred();
    const commits: number[] = [];
    const queue = new SaveQueue<number>(async (value) => {
      commits.push(value);
      await (value === 1 ? first : second).promise;
    });
    queue.enqueue(1);
    const saving = queue.flush();
    queue.enqueue(2);
    let complete = false;
    const barrier = queue.flush().then(() => {
      complete = true;
    });
    first.resolve();
    await Promise.resolve();
    expect(complete).toBe(false);
    second.resolve();
    await barrier;
    await saving;
    expect(commits).toEqual([1, 2]);
    expect(queue.dirty).toBe(false);
  });
  test("retains the latest edit after failure and allows retry", async () => {
    const gate = deferred();
    let fail = true;
    const commits: number[] = [];
    const queue = new SaveQueue<number>(async (value) => {
      await gate.promise;
      if (fail) throw Error("offline");
      commits.push(value);
    });
    queue.enqueue(1);
    const result = queue.flush();
    queue.enqueue(2);
    gate.resolve();
    await expect(result).rejects.toThrow("offline");
    expect(queue.queued).toBe(2);
    fail = false;
    await queue.flush();
    expect(commits).toEqual([2]);
  });
});
