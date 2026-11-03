import arabic from "../src/i18n/locales/ar/translation.json" with { type: "json" };
import { test, expect } from "@playwright/test";
const fixture = "/playwright/workspace-fixture.html";

/** Opens the meeting or import form's engine options, collapsed by default. */
const showEngineOptions = async (page: import("@playwright/test").Page) => {
  const details = page.locator("details.ws-processing-details");
  if (
    !(await details.evaluate((element) => (element as HTMLDetailsElement).open))
  )
    await details.locator("summary").click();
};
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
  await page.getByRole("tab", { name: "Transcript" }).click();
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
  await page.getByRole("tab", { name: "Transcript" }).click();
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
  await page.getByRole("tab", { name: "Transcript" }).click();
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
  await page.getByRole("tab", { name: "Transcript" }).click();
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
  await page.getByRole("tab", { name: "Transcript" }).click();
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
  await page.getByRole("tab", { name: "Transcript" }).click();
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
  await page.getByRole("tab", { name: "Transcript" }).click();
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
  await showEngineOptions(page);
  await expect(
    page.getByRole("button", { name: "Engine", exact: true }),
  ).toContainText("Same as dictation");
  await page
    .getByRole("button", { name: "Import audio", exact: true })
    .first()
    .click();
  await expect(page.getByText("pending.wav", { exact: false })).toBeVisible();
  await showEngineOptions(page);
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
  await showEngineOptions(page);
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
  await page.getByRole("tab", { name: "Transcript" }).click();
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
  await page.getByRole("tab", { name: "Transcript" }).click();
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
  await page.getByRole("tab", { name: "Transcript" }).click();
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
  await page.getByRole("tab", { name: "Transcript" }).click();
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
  await page.getByRole("tab", { name: "Engines", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Engines", exact: true }),
  ).toBeVisible();
  // A plain explanation, with the technical detail one click away.
  await expect(
    page.getByText("The local engines couldn’t start.", { exact: false }),
  ).toBeVisible();
  await page.getByText("Details", { exact: true }).first().click();
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
  await expect(
    page
      .getByRole("region", { name: "Recent dictation" })
      .getByText("Can you send the revised screens before Friday?"),
  ).toBeVisible();
});

test("a tap can make dictation hands-free", async ({ page }) => {
  await page.goto(`${fixture}?dictation=ready&tapToLock`);
  const strip = page.getByRole("button", { name: /^Dictation/ });
  await expect(strip).toContainText("Hold to talk, or tap for hands-free");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Dictation", exact: true }).click();
  const tap = page.getByRole("switch", { name: "Tap for hands-free" });
  await expect(tap).toBeChecked();
  await tap.focus();
  await page.keyboard.press("Space");
  await expect(tap).not.toBeChecked();
  // It only applies to holding the shortcut.
  await page.getByRole("switch", { name: "Hold to talk" }).focus();
  await page.keyboard.press("Space");
  await expect(tap).toHaveCount(0);
});

test("Home lists upcoming meetings from the calendar", async ({ page }) => {
  await page.goto(`${fixture}?calendar`);
  const upcoming = page.getByRole("region", { name: "Upcoming" });
  await expect(upcoming.getByRole("listitem")).toHaveCount(2);
  await expect(upcoming.getByRole("listitem").first()).toContainText(
    "NowTeam standup",
  );
  await upcoming
    .getByRole("listitem")
    .nth(1)
    .getByRole("button", { name: "Take notes" })
    .click();
  await expect(page.getByLabel("Title")).toHaveValue("Design review");
});

test("Home offers to connect the calendar once there are meetings", async ({
  page,
}) => {
  await page.goto(fixture);
  const card = page.getByRole("region", {
    name: "See your next meetings here",
  });
  await card.getByRole("button", { name: "Connect calendar" }).click();
  await expect(card).toBeHidden();
  await expect(
    page.getByRole("region", { name: "Upcoming" }).getByRole("listitem"),
  ).toHaveCount(2);
});

test("a new meeting is named after the calendar meeting going on", async ({
  page,
}) => {
  await page.goto(`${fixture}?calendar`);
  await page.getByRole("button", { name: "Record meeting" }).first().click();
  await expect(page.getByLabel("Title")).toHaveValue("Team standup");
});

test("Meetings & notes settings connect and disconnect the calendar", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("tab", { name: "Meetings & notes", exact: true })
    .click();
  await page.getByRole("button", { name: "Connect calendar" }).click();
  await expect(
    page.getByRole("switch", { name: "Remind me before meetings" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Disconnect calendar" }).click();
  await expect(
    page.getByRole("button", { name: "Connect calendar" }),
  ).toBeVisible();
});

test("asking across meetings answers with sources that open the moment", async ({
  page,
}) => {
  await page.goto(fixture);
  const box = page.getByLabel("Ask about your meetings");
  await expect(box).toBeVisible();
  await page.keyboard.press("Meta+k");
  await expect(box).toBeFocused();
  await box.fill("Who is bringing the screens?");
  await box.press("Enter");
  const panel = page.getByRole("region", { name: "Ask your meetings" });
  await expect(panel).toContainText(
    "Sam is bringing the revised screens to Friday’s review",
  );
  // The [p1] marker becomes a numbered citation.
  await expect(panel).not.toContainText("[p1]");
  await panel
    .getByRole("button", { name: /^Open Product design review/ })
    .click();
  await expect(page.getByRole("tab", { name: "Transcript" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("Command-K asks from inside a transcript", async ({ page }) => {
  await page.goto(fixture);
  await page.getByText("Product design review", { exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Product design review" }),
  ).toBeVisible();
  await page.keyboard.press("Meta+k");
  await expect(page.getByLabel("Ask about your meetings")).toBeFocused();
});

test("asking without a notes engine says how to get one", async ({ page }) => {
  await page.goto(`${fixture}?askNoEngine`);
  const box = page.getByLabel("Ask about your meetings");
  await box.fill("Who is bringing the screens?");
  await box.press("Enter");
  await expect(
    page.getByText("Answers come from the notes engine", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Get the notes engine" }).click();
  await expect(
    page.getByRole("tab", { name: "Meetings & notes" }),
  ).toHaveAttribute("aria-selected", "true");
});

test("asking says when nothing in the Library matches", async ({ page }) => {
  await page.goto(fixture);
  const box = page.getByLabel("Ask about your meetings");
  await box.fill("What is the budget?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(
    page.getByText("Nothing in your Library mentions that."),
  ).toBeVisible();
});

test("Home asks to finish dictation setup when it isn't ready", async ({
  page,
}) => {
  await page.goto(`${fixture}?dictation=setup`);
  const strip = page.getByRole("button", { name: /^Dictation/ });
  await expect(strip).toContainText("Not set up yet");
  await expect(strip.locator("kbd")).toHaveCount(0);
});

test("Home shows today's dictation and the latest dictations", async ({
  page,
}) => {
  await page.goto(`${fixture}?dictation=ready`);
  const summary = page.getByRole("region", { name: "Recent dictation" });
  await expect(summary).toContainText("Words today");
  await expect(summary).toContainText("42");
  await expect(summary).toContainText("4 days");
  await expect(
    summary.getByText("Can you send the revised screens before Friday?"),
  ).toBeVisible();
  await expect(
    summary.getByRole("button", { name: "Copy original" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Dictation/ })).toContainText(
    "Hold to talk",
  );
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
  await page
    .getByRole("region", { name: "Recent dictation" })
    .getByText("Can you send the revised screens before Friday?")
    .click();
  const show = page.getByRole("button", { name: "Show original" });
  await show.click();
  await expect(page.getByLabel("Text before AI cleanup")).toHaveText(
    "can you send the revised screens before friday",
  );
  await page.getByRole("button", { name: "Hide original" }).click();
  await expect(page.getByLabel("Text before AI cleanup")).toBeHidden();
});

test("a dictation can teach the dictionary a spelling", async ({ page }) => {
  await page.goto(`${fixture}?dictation=ready`);
  await page
    .getByRole("region", { name: "Recent dictation" })
    .getByText("Can you send the revised screens before Friday?")
    .click();
  await page.getByRole("button", { name: "Add to dictionary" }).click();
  await page.getByLabel("Heard as").fill("sam");
  await page.getByLabel("Write as").fill("Sam");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Added as a replacement")).toBeVisible();
  await expect(page.getByLabel("Heard as")).toBeHidden();
});

test("the dictionary keeps replacements, snippets and multi-word names", async ({
  page,
}) => {
  await page.goto(`${fixture}?dictation=ready`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Dictionary", exact: true }).click();

  await page.getByPlaceholder("Add a word or name").fill("Charge Bee");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove Charge Bee" }),
  ).toBeVisible();

  await page.getByLabel("When I say").fill("gonna");
  await page.getByLabel("Write", { exact: true }).fill("going to");
  await page.getByLabel("Write", { exact: true }).press("Enter");
  const replacements = page.getByRole("list", { name: "Replacements" });
  await expect(replacements).toContainText("gonna→going to");

  await page.getByLabel("Snippet phrase").fill("my address");
  await page.getByLabel("Snippet text").fill("1 Infinite Loop\nCupertino");
  await page.getByRole("button", { name: "Add snippet" }).click();
  await expect(page.getByRole("list", { name: "Snippets" })).toContainText(
    "1 Infinite Loop ⏎ Cupertino",
  );

  await page.getByRole("button", { name: "Remove gonna" }).click();
  await expect(replacements).toBeHidden();
});

test("a finished meeting opens on notes the person can write", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByText("Product design review", { exact: true }).click();
  await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const notes = page.getByRole("textbox", { name: "Your notes" });
  await notes.fill("- Ship Friday");
  await notes.press("End");
  await notes.press("Enter");
  await notes.pressSequentially("Ask Sam");
  await expect(notes).toHaveValue("- Ship Friday\n- Ask Sam");
  // Saved apart from the document, so it survives a reload.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("fixture-notes-one")))
    .toBe("- Ship Friday\n- Ask Sam");
  await page.reload();
  await page.getByText("Product design review", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Your notes" })).toHaveValue(
    "- Ship Friday\n- Ask Sam",
  );
});

test("Enhance keeps the person's points apart from AI notes", async ({
  page,
}) => {
  await page.goto(`${fixture}?userNote`);
  await page.getByText("Product design review", { exact: true }).click();
  const mine = page.locator('.ws-note-item[data-origin="user"]');
  await expect(mine).toContainText("You wrote this");
  await expect(mine.getByRole("textbox")).toHaveValue(
    "Check the empty state copy before Friday.",
  );
  await expect(mine.locator(".ws-citations button")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Regenerate", exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Your notes" }).fill("- Ship Friday");
  await expect(
    page.getByRole("button", { name: "Enhance notes" }),
  ).toBeVisible();
});

test("meeting setup can capture just the running call app", async ({
  page,
}) => {
  await page.goto(`${fixture}?callApp`);
  await page.getByRole("button", { name: "Record meeting" }).first().click();
  const source = page.getByLabel("Capture audio from");
  await expect(source).toBeVisible();
  // The app-wide switch lives in Settings, not in every meeting's setup.
  await expect(page.getByText("Offer notes for calls")).toBeHidden();
});

test("on-device claims give way when AI cleanup uses a cloud provider", async ({
  page,
}) => {
  await page.goto(fixture + "?dictation=ready");
  await expect(page.getByText("Everything stays on this device")).toBeVisible();
  await expect(page.getByText("Runs on your device")).toBeVisible();

  await page.goto(fixture + "?dictation=ready&cloudCleanup");
  await expect(page.getByText("AI cleanup uses OpenAI")).toBeVisible();
  await expect(page.getByText("Runs on your device")).toBeHidden();
  // Meetings and their notes still run locally.
  await page.getByText("Product design review", { exact: true }).click();
  await expect(page.locator(".ws-meta")).toContainText(
    "Everything stays on this device",
  );
});

test("a new meeting opens on your notes, and the bar can reopen them", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Record meeting" }).first().click();
  await page.getByLabel("Title").fill("Design sync");
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  const notes = page.getByRole("textbox", { name: "Your notes" });
  await expect(notes).toBeFocused();
  await notes.pressSequentially("- Ship the new home");
  await page.getByRole("button", { name: "Back" }).first().click();
  await page.getByRole("button", { name: "Open notes", exact: true }).click();
  await expect(notes).toHaveValue("- Ship the new home");
  // It took focus once; reopening leaves focus where you put it.
  await expect(notes).not.toBeFocused();
});

test("meeting setup offers a heads-up for the people on the call", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Record meeting" }).first().click();
  await expect(
    page.getByRole("button", { name: "Copy a heads-up message" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("tab", { name: "Meetings & notes", exact: true })
    .click();
  await expect(page.getByText("Reminder to tell people")).toBeVisible();
  await expect(page.getByText("Offer notes for calls")).toBeVisible();
});

test("keyboard users land in an opened transcript and its evidence", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByText("Product design review", { exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Product design review" }),
  ).toBeFocused();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "0:02", exact: true }).click();
  const evidence = page.getByRole("complementary", {
    name: "From the transcript",
  });
  await expect(evidence).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(evidence).toBeHidden();
});

test("collapsed settings sections keep their controls out of reach", async ({
  page,
}) => {
  await page.goto(`${fixture}?dictation=ready`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const space = page.getByRole("switch", { name: "Add space after pasting" });
  await expect(space).toHaveCount(0);
  await page.getByRole("button", { name: "Transcription" }).click();
  await expect(space).toHaveCount(1);
});

test("a meeting keeps a record of how people were told", async ({ page }) => {
  await page.goto(`${fixture}?consent`);
  await page.getByText("Product design review", { exact: true }).click();
  await expect(page.locator(".ws-consent-record")).toHaveText(
    "Recorded your mic and Zoom · Reminder to tell people shown",
  );
});

test("Home puts what needs you first and lists dictations once", async ({
  page,
}) => {
  await page.goto(`${fixture}?dictation=ready`);
  const attention = page.getByRole("region", {
    name: "Needs attention",
    exact: true,
  });
  const dictations = page.getByRole("region", { name: "Recent dictation" });
  await expect(attention).toBeVisible();
  await expect(dictations).toBeVisible();
  const above = await page.evaluate(() => {
    const [first, second] = [
      document.querySelector('[aria-label="Needs attention"]'),
      document.querySelector(".ws-dictation-strip"),
    ];
    return !!(
      first &&
      second &&
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
  expect(above).toBe(true);
  // The dictation shows in its own section, not again under Recent.
  await expect(
    page.locator(".ws-document-row", { hasText: "Note to Sam" }),
  ).toHaveCount(0);
  await expect(dictations.getByText(/revised screens/)).toBeVisible();
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

test("AI cleanup settings offer the command shortcut", async ({ page }) => {
  await page.goto(`${fixture}?dictation=ready&cleanup=1`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "AI writing", exact: true }).click();
  await expect(
    page.getByText("Command shortcut", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Select text and say how to change it, or say what to write.",
    ),
  ).toBeVisible();
});

test("settings has eight sections as tabs, with each control in one place", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const tabs = page.getByRole("tablist", { name: "Settings" }).getByRole("tab");
  await expect(tabs).toHaveText([
    "General",
    "Dictation",
    "AI writing",
    "Dictionary",
    "Meetings & notes",
    "Audio",
    "Engines",
    "Privacy & storage",
  ]);
  await expect(page.getByRole("tab", { name: "Dictation" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // Arrow keys move between sections.
  await page.getByRole("tab", { name: "Dictation" }).focus();
  await page.keyboard.press("ArrowDown");
  const ai = page.getByRole("tab", { name: "AI writing" });
  await expect(ai).toBeFocused();
  await expect(ai).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toBeVisible();
  // Styles show even before AI cleanup is on.
  await expect(page.getByText("Styles", { exact: true })).toBeVisible();
  // The notes engine is only under Meetings & notes, not Engines too.
  await page.getByRole("tab", { name: "Engines", exact: true }).click();
  await expect(page.getByText("More dictation engines")).toHaveCount(0);
  await page.getByRole("tab", { name: "Privacy & storage" }).click();
  await expect(page.getByText("What leaves this device")).toBeVisible();
});

test("unreviewed languages stay hidden until preview languages is on", async ({
  page,
}) => {
  await page.goto(fixture + "?dictation=ready");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "General", exact: true }).click();
  const language = page.getByRole("button", { name: "English (English)" });
  await language.click();
  await expect(page.getByRole("option")).toHaveText(["English (English)"]);
  await page.keyboard.press("Escape");

  const preview = page.getByRole("switch", { name: "Preview languages" });
  await preview.focus();
  await page.keyboard.press("Space");
  await expect(preview).toBeChecked();
  await language.click();
  await expect(
    page.getByRole("option", { name: "日本語 (Japanese) · Preview" }),
  ).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(17);
});

test("a template's own sections show in the notes", async ({ page }) => {
  await page.goto(fixture + "?template");
  await page.getByText("Product design review", { exact: true }).click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Blockers", exact: true }),
  ).toBeVisible();
  // Standups don't track decisions.
  await expect(
    page.getByRole("heading", { name: "Decisions", exact: true }),
  ).toHaveCount(0);
  const blocker = page.getByRole("textbox", { name: "Blockers" });
  await expect(blocker).toHaveValue(
    "Waiting on the final copy for the first screen.",
  );
  // Template sections are edited like any other.
  await blocker.fill("Copy is ready.");
  await expect(blocker).toHaveValue("Copy is ready.");
  await expect(page.getByLabel("Notes template")).toContainText("Standup");
});

test("regenerating notes can switch template", async ({ page }) => {
  await page.goto(fixture);
  await page.getByText("Product design review", { exact: true }).click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page.getByLabel("Notes template").click();
  await page.getByRole("option", { name: "Customer call" }).click();
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("fixture-retry") || "{}")
            .notesTemplate,
      ),
    )
    .toBe("customer_call");
});

test("meeting setup asks which template the notes follow", async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Record meeting" }).first().click();
  // Only notes have a template.
  await expect(page.getByLabel("Notes template")).toHaveCount(0);
  await page.getByRole("button", { name: "Transcript + notes" }).click();
  await showEngineOptions(page);
  await expect(page.getByLabel("Notes template")).toBeVisible();
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
