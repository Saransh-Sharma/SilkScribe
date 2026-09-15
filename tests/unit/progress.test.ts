import { expect, test } from "bun:test";
import {
  applyProgress,
  type ProgressEvent,
} from "../../src/components/workspace/progress";
import type { DocumentSummary } from "../../src/bindings";
const doc = {
  id: "one",
  attempt_id: "attempt-b",
  stage: "notes",
  revision: 3,
  progress: 0.4,
} as DocumentSummary;
const event: ProgressEvent = {
  version: 2,
  id: "one",
  attempt_id: "attempt-b",
  stage: "notes",
  revision: 3,
  progress: 0.7,
};
test("progress cannot overwrite a newer attempt, stage, revision or terminal state", () => {
  for (const stale of [
    { ...event, stage: "transcribing" as const },
    { ...event, revision: 2 },
    { ...event, version: 1 },
    { ...event, attempt_id: "attempt-a" },
    { ...event, attempt_id: "" },
    { ...event, progress: NaN },
  ]) {
    expect(applyProgress([doc], stale)[0]).toBe(doc);
  }
  const complete = { ...doc, stage: "complete" as const };
  expect(applyProgress([complete], { ...event, stage: "complete" })[0]).toBe(
    complete,
  );
  expect(applyProgress([doc], event)[0].progress).toBe(0.7);
  expect(applyProgress([doc], { ...event, progress: 0.1 })[0].progress).toBe(
    0.4,
  );
});
