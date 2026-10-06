import arabic from "../src/i18n/locales/ar/translation.json" with { type: "json" };
import { test, expect } from "@playwright/test";
const fixture = "/playwright/workspace-fixture.html";
test("workspace shows creation paths and a unified searchable library", async ({
  page,
}) => {
  await page.goto(fixture);
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search transcripts" })
    .fill("revised screens");
  await expect(
    page.getByText("Product design review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Research interview — Elena", { exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No matches" })).toBeVisible();
});
test("transcript edits persist, speaker names can change, notes become stale", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByText("Product design review", { exact: true }).click();
  await page
    .getByRole("button", { name: "Edit transcript", exact: true })
    .click();
  const segment = page.getByRole("textbox", { name: "Transcript at 0:02" });
  await segment.fill("Let’s simplify the recording controls.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Speakers", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Speaker name" })
    .first()
    .fill("Priya Shah");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(
    page.getByText("You’ve edited the transcript.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByText("Product design review", { exact: true }).click();
  await page
    .getByRole("button", { name: "Edit transcript", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Transcript at 0:02" }),
  ).toHaveValue("Let’s simplify the recording controls.");
  await expect(
    page.getByRole("button", { name: "Speaker", exact: true }).first(),
  ).toContainText("Priya Shah");
});
test("delete requires a concrete confirmation and removes the transcript", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByText("Product design review", { exact: true }).click();
  await page
    .getByRole("button", { name: "Delete transcript", exact: true })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Delete transcript", exact: true })
    .click();
  await expect(
    page.getByText("Product design review", { exact: true }),
  ).toBeHidden();
});
test("empty state and narrow RTL layout remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto(fixture + "?empty=1&dir=rtl&theme=dark");
  await expect(
    page.getByRole("heading", { name: "Nothing here yet" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: "artifacts/workspace-narrow.png",
    fullPage: true,
  });
});
test("workspace visual baseline", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto(fixture);
  await expect(
    page.getByText("Product design review", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/workspace-home.png",
    fullPage: true,
  });
  await page.getByText("Product design review", { exact: true }).click();
  await page.screenshot({
    path: "artifacts/workspace-transcript.png",
    fullPage: true,
  });
});

test("Back waits for an in-flight save and a newer queued edit", async ({
  page,
}) => {
  await page.goto(fixture + "?delaySave=1");
  await page.getByText("Product design review", { exact: true }).click();
  await page
    .getByRole("button", { name: "Edit transcript", exact: true })
    .click();
  const segment = page.getByRole("textbox", { name: "Transcript at 0:02" });
  await segment.fill("First edit");
  // The debounce has elapsed and the fixture keeps the first request in flight.
  await page.waitForTimeout(700);
  await segment.fill("The latest edit must survive navigation.");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.getByText("Product design review", { exact: true }).click();
  await expect(
    page.getByText("The latest edit must survive navigation.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("workspace-draft-one")),
  ).toBeNull();
});
test("new notes require review and can be discarded without losing edits", async ({
  page,
}) => {
  await page.goto(fixture + "?candidate=1");
  await page.getByText("Product design review", { exact: true }).click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(page.getByText("A fresh summary to review.")).toBeVisible();
  const current = page.getByRole("textbox", { name: "Summary", exact: true });
  await current.fill("My carefully edited summary.");
  await page.getByRole("button", { name: "Keep current", exact: true }).click();
  await expect(page.getByText("A fresh summary to review.")).toBeHidden();
  await expect(current).toHaveValue("My carefully edited summary.");
});
test("reviewed notes can replace the current version", async ({ page }) => {
  await page.goto(fixture + "?candidate=1");
  await page.getByText("Product design review", { exact: true }).click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page
    .getByRole("button", { name: "Replace notes", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Summary", exact: true }),
  ).toHaveValue("A fresh summary to review.");
  await expect(
    page.getByRole("heading", { name: "New notes", exact: true }),
  ).toBeHidden();
});
test("evidence review keeps the notes tab and surrounding transcript context", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByText("Product design review", { exact: true }).click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "0:02", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Notes", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("complementary", { name: "From the transcript" }),
  ).toContainText("Let’s make the first recording easier to start.");
});

test("note evidence retains the generation-time excerpt after a transcript correction", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByText("Product design review", { exact: true }).click();
  await page
    .getByRole("button", { name: "Edit transcript", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Transcript at 0:02", exact: true })
    .first()
    .fill("The corrected transcript says something different.");
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "0:02", exact: true }).click();
  const evidence = page.getByRole("complementary", {
    name: "From the transcript",
  });
  await expect(evidence).toContainText(
    "Let’s make the first recording easier to start.",
  );
  await evidence.locator("summary").click();
  await expect(evidence).toContainText(
    "The corrected transcript says something different.",
  );
});

test("Arabic layout uses translated text and RTL tab navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 840 });
  await page.goto(fixture + "?lang=ar&dir=rtl&theme=dark");
  await expect(
    page.getByRole("heading", { name: arabic.workspace.home, exact: true }),
  ).toBeVisible();
  await page.getByText("Product design review", { exact: true }).click();
  const tab = page.getByRole("tab", {
    name: arabic.workspace.transcript,
    exact: true,
  });
  await tab.focus();
  await tab.press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: arabic.workspace.notes, exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: "artifacts/workspace-arabic.png",
    fullPage: true,
  });
});
test("sidebar navigation also waits for pending transcript saves", async ({
  page,
}) => {
  await page.goto(fixture + "?delaySave=1");
  await page.getByText("Product design review", { exact: true }).click();
  await page
    .getByRole("button", { name: "Edit transcript", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Transcript at 0:02" })
    .fill("Saved before leaving through the sidebar.");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Library", exact: true }),
  ).toBeVisible();
  await page.getByText("Product design review", { exact: true }).click();
  await expect(
    page.getByText("Saved before leaving through the sidebar.", {
      exact: true,
    }),
  ).toBeVisible();
});
test("export sheet exposes content selection without opening a destination", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByText("Product design review", { exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("option", { name: "MD", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("checkbox", { name: "Transcript", exact: true })
    .uncheck();
  await dialog.getByRole("checkbox", { name: "Notes", exact: true }).uncheck();
  await expect(
    dialog.getByRole("button", { name: "Choose where to save…" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("speaker merge undo preserves subsequent transcript edits", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByText("Product design review", { exact: true }).click();
  await page.getByRole("tab", { name: "Speakers", exact: true }).click();
  await page
    .getByRole("button", { name: "Merge into…", exact: true })
    .first()
    .click();
  await page.getByRole("option", { name: "Sam", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Merge", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Speaker name" })).toHaveCount(
    1,
  );
  await page.getByRole("tab", { name: "Transcript", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit transcript", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Transcript at 0:02" })
    .fill("Keep this correction after undo.");
  await page.getByRole("tab", { name: "Speakers", exact: true }).click();
  await page.getByRole("button", { name: "Undo merge", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Speaker name" })).toHaveCount(
    2,
  );
  await page.getByRole("tab", { name: "Transcript", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Transcript at 0:02" }),
  ).toHaveValue("Keep this correction after undo.");
});

test("meeting and import setup survive reload with independent defaults", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.evaluate(() =>
    localStorage.setItem(
      "workspace-pending-files",
      JSON.stringify(["/fixtures/pending.wav"]),
    ),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Record meeting", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Monday planning");
  await page
    .getByRole("button", { name: "Fast transcript", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Engine", exact: true }),
  ).toContainText("Same as dictation");
  await page
    .getByRole("button", { name: "Import audio", exact: true })
    .first()
    .click();
  await expect(page.getByText("pending.wav", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Engine", exact: true }),
  ).toContainText("Qwen3");
  await page.reload();
  await page
    .getByRole("button", { name: "Record meeting", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Monday planning");
  await expect(
    page.getByRole("button", { name: "Engine", exact: true }),
  ).toContainText("Same as dictation");
  await page
    .getByRole("button", { name: "Import audio", exact: true })
    .first()
    .click();
  await expect(page.getByText("pending.wav", { exact: false })).toBeVisible();
});

test("partial import keeps unsuccessful files selected after reload", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.evaluate(() =>
    localStorage.setItem(
      "workspace-pending-files",
      JSON.stringify(["/fixtures/copied.wav", "/fixtures/retry.wav"]),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "Import audio", exact: true }).click();
  await page.getByRole("button", { name: "Transcribe", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Library", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Import audio", exact: true }).click();
  await expect(page.getByText("retry.wav", { exact: false })).toBeVisible();
  await expect(page.getByText("copied.wav", { exact: false })).toBeHidden();
});

test("managed draft recovery restores an edit before autosave committed", async ({
  page,
}) => {
  await page.goto(fixture + "?delaySave=1");
  await page.getByText("Product design review", { exact: true }).click();
  await page
    .getByRole("button", { name: "Edit transcript", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Transcript at 0:02" })
    .fill("Recovered from the managed draft store.");
  await page.waitForFunction(() =>
    localStorage
      .getItem("fixture-db-draft-one")
      ?.includes("Recovered from the managed draft store."),
  );
  await page.reload();
  await page.getByText("Product design review", { exact: true }).click();
  await expect(
    page.getByText("Recovered from the managed draft store.", { exact: true }),
  ).toBeVisible();
});

test("unfinished imports are discoverable without browser setup state", async ({
  page,
}) => {
  await page.goto(fixture + "?unfinishedBatch=1");
  await expect(
    page.getByRole("heading", { name: "Unfinished imports" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume import" }).click();
  await expect(page.getByText("recovered.wav", { exact: false })).toBeVisible();
});

test("bulk speaker corrections and explicit notes review are available", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByText("Product design review", { exact: true }).click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "I’ve checked these notes against the transcript",
    })
    .check();
  await expect(
    page.getByRole("checkbox", {
      name: "I’ve checked these notes against the transcript",
    }),
  ).toBeChecked();
  await page.getByRole("tab", { name: "Transcript", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit transcript", exact: true })
    .click();
  await page.getByRole("button", { name: "Select all on this page" }).click();
  await page
    .getByRole("button", { name: "Assign speaker", exact: true })
    .click();
  await page.getByRole("option", { name: "Sam", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Speaker", exact: true }).first(),
  ).toContainText("Sam");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "I’ve checked these notes against the transcript",
    }),
  ).not.toBeChecked();
});

test("denied capture permissions block recording but do not block imports", async ({
  page,
}) => {
  await page.goto(fixture + "?deniedCapture=1");
  await page.evaluate(() =>
    localStorage.setItem(
      "workspace-pending-files",
      JSON.stringify(["/fixtures/import.wav"]),
    ),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Record meeting", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Allow microphone", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Import audio", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Transcribe", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Allow microphone", exact: true }),
  ).toBeHidden();
});

test("applying one generated notes section keeps the other notes", async ({
  page,
}) => {
  await page.goto(fixture + "?candidate=1");
  await page.getByText("Product design review", { exact: true }).click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Replace this section only: Summary",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Summary", exact: true }),
  ).toHaveValue("A fresh summary to review.");
  await expect(
    page.getByRole("textbox", { name: "Action item", exact: true }),
  ).toHaveValue("Bring revised screens to the next review.");
});

test("export preview switches between original text and saved edits", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByText("Product design review", { exact: true }).click();
  await page
    .getByRole("button", { name: "Edit transcript", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Transcript at 0:02" })
    .fill("Edited for export.");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("option", { name: "JSON", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog.locator("pre")).toContainText(
    '"text": "Edited for export."',
  );
  await dialog.getByRole("checkbox", { name: "Export original text" }).check();
  await expect(dialog.locator("pre")).not.toContainText(
    '"text": "Edited for export."',
  );
  await expect(dialog.locator("pre")).toContainText(
    '"text": "Let’s make the first recording easier to start."',
  );
});

for (const format of ["wav", "mp3", "m4a", "flac", "ogg"]) {
  test(`playback loads and plays the ${format} audio fixture`, async ({
    page,
  }) => {
    await page.goto(fixture + `?audio=${format}`);
    await page.getByText("Product design review", { exact: true }).click();
    await page.waitForFunction(() => {
      const audio = document.querySelector("audio");
      return (
        audio &&
        Number.isFinite(audio.duration) &&
        audio.duration > 0 &&
        !audio.error
      );
    });
    await page.locator("audio").evaluate(async (audio: HTMLAudioElement) => {
      await audio.play();
    });
    await page.waitForFunction(
      () => (document.querySelector("audio")?.currentTime ?? 0) > 0.1,
    );
    await page
      .locator("audio")
      .evaluate((audio: HTMLAudioElement) => audio.pause());
  });
}

test("four-hour transcript renders bounded pages and records editing latency", async ({
  page,
}, testInfo) => {
  await page.goto(fixture + "?long=1");
  await page.getByText("Product design review", { exact: true }).click();
  await expect(page.locator(".ws-segment")).toHaveCount(100);
  await page
    .getByRole("button", { name: "Edit transcript", exact: true })
    .click();
  const measurements = await page
    .locator(".ws-segment textarea")
    .first()
    .evaluate(async (input: HTMLTextAreaElement) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      const samples: number[] = [];
      for (let index = 0; index < 12; index++) {
        const start = performance.now();
        setter.call(input, `Performance edit ${index}`);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        samples.push(performance.now() - start);
      }
      return {
        fixture_hours: 4,
        turns: 6000,
        samples_ms: samples,
        p95_ms: [...samples].sort((a, b) => a - b)[
          Math.ceil(samples.length * 0.95) - 1
        ],
        scope:
          "Synthetic transcript edit-to-two-animation-frames; excludes native inference and actual four-hour media playback.",
      };
    });
  await testInfo.attach("editing-performance.json", {
    body: JSON.stringify(measurements, null, 2),
    contentType: "application/json",
  });
  await expect(page.locator(".ws-segment textarea").first()).toHaveValue(
    "Performance edit 11",
  );
  expect(measurements.p95_ms).toBeLessThan(250);
});

test("model settings remain usable while runtime health fails", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(fixture + "?runtimeFailure=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  expect(errors).toEqual([]);
  await page
    .getByRole("button", { name: "Engines & language", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Engines" })).toBeVisible();
  await expect(
    page.getByText("Speech runtime: dependency check failed", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("This build does not include the local AI runtime yet.", {
      exact: false,
    }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
});

test("Home shows the dictation shortcut once dictation is ready", async ({
  page,
}) => {
  await page.goto(`${fixture}?dictation=ready`);
  const strip = page.getByRole("button", { name: /^Dictation/ });
  await expect(strip).toContainText("Ready");
  await expect(strip.locator("kbd")).toHaveText("Option + Space");
  await expect(page.getByText("Note to Sam", { exact: true })).toBeVisible();
});

test("Home asks to finish dictation setup when it isn't ready", async ({
  page,
}) => {
  await page.goto(`${fixture}?dictation=setup`);
  const strip = page.getByRole("button", { name: /^Dictation/ });
  await expect(strip).toContainText("Not set up yet");
  await expect(strip.locator("kbd")).toHaveCount(0);
});

test("Home offers on-device AI cleanup once", async ({ page }) => {
  await page.goto(`${fixture}?dictation=ready&cleanupSuggestion`);
  const card = page.getByRole("region", { name: "Clean up every dictation" });
  await expect(card).toContainText("Apple Intelligence");
  await card.getByRole("button", { name: "Not now" }).click();
  await expect(card).toBeHidden();
});

test("a cleaned-up dictation can show the text before cleanup", async ({
  page,
}) => {
  await page.goto(`${fixture}?dictation=ready`);
  await page.getByText("Note to Sam", { exact: true }).click();
  const show = page.getByRole("button", { name: "Show original" });
  await show.click();
  await expect(
    page.getByLabel("Text before AI cleanup"),
  ).toHaveText("can you send the revised screens before friday");
  await page.getByRole("button", { name: "Hide original" }).click();
  await expect(page.getByLabel("Text before AI cleanup")).toBeHidden();
});

test("Home surfaces recovery work and opens the filtered Library", async ({
  page,
}) => {
  await page.goto(fixture);
  const recovery = page.getByRole("region", {
    name: "Needs attention",
    exact: true,
  });
  await expect(
    recovery.getByText("Research interview — Elena", { exact: true }),
  ).toBeVisible();
  await recovery.getByRole("button", { name: "See all" }).click();
  await expect(
    page.getByRole("button", { name: "Needs attention", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("Research interview — Elena", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Product design review", { exact: true }),
  ).toBeHidden();
});

test("settings has six workflow groups with advanced controls kept in context", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const groups = page.locator(".ws-settings-tabs button");
  await expect(groups).toHaveCount(6);
  await expect(groups).toHaveText([
    "Dictation",
    "Audio",
    "Engines & language",
    "AI notes",
    "Appearance",
    "Storage & privacy",
  ]);
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(page.locator(".ws-settings-tabs button.is-active")).toHaveText(
    "Appearance",
  );
  await page
    .getByRole("button", { name: "Engines & language", exact: true })
    .click();
  await expect(
    page.getByText("More dictation engines", { exact: true }),
  ).toBeVisible();
});

for (const [section, label] of [
  ["summary", "Summary"],
  ["decisions", "Decisions"],
  ["actions", "Action items"],
] as const) {
  test(`regenerating only ${section} preserves the other notes`, async ({
    page,
  }) => {
    await page.goto(fixture + "?sectionGeneration");
    await page.getByText("Product design review", { exact: true }).click();
    await page.getByRole("tab", { name: "Notes", exact: true }).click();
    await page
      .getByRole("button", { name: `Regenerate: ${label}`, exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("fixture-retry") || "{}")
              .notesSection,
        ),
      )
      .toBe(section);
    await page.getByText("Product design review", { exact: true }).click();
    await page.getByRole("tab", { name: "Notes", exact: true }).click();
    const review = page.getByRole("region", {
      name: "New notes",
      exact: true,
    });
    await expect(review.getByRole("heading", { level: 3 })).toHaveCount(1);
    await expect(
      review.getByRole("heading", { name: label, exact: true }),
    ).toBeVisible();
    await expect(
      review.getByRole("button", {
        name: "Replace notes",
        exact: true,
      }),
    ).toHaveCount(0);
    await review
      .getByRole("button", {
        name: `Replace this section only: ${label}`,
        exact: true,
      })
      .click();
    const valueLabel = section === "actions" ? "Action item" : label;
    await expect(
      page.getByRole("textbox", { name: valueLabel, exact: true }).first(),
    ).toHaveValue("New section result");
    if (section !== "actions")
      await expect(
        page.getByRole("textbox", { name: "Action item", exact: true }),
      ).toHaveValue("Bring revised screens to the next review.");
    if (section !== "summary")
      await expect(
        page.getByRole("textbox", { name: "Summary", exact: true }),
      ).toHaveValue("The team discussed simplifying the first recording.");
  });
}
