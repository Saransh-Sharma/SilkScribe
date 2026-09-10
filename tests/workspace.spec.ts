import { test, expect } from "@playwright/test";
const fixture = "/playwright/workspace-fixture.html";
test("workspace shows creation paths and a unified searchable library", async ({
  page,
}) => {
  await page.goto(fixture);
  await expect(
    page.getByRole("heading", { name: "Make room for the conversation." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search titles and transcripts" })
    .fill("revised screens");
  await expect(
    page.getByText("Product design review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Research interview — Elena", { exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No matching transcripts" }),
  ).toBeVisible();
});
test("transcript edits persist, speaker names can change, notes become stale", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByText("Product design review", { exact: true }).click();
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
    page.getByText("This transcript has changed.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByText("Product design review", { exact: true }).click();
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
    page.getByRole("heading", { name: "Your next conversation starts here" }),
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
