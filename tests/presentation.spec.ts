import { expect, test } from "@playwright/test";

const fixture = (query: string) =>
  `/playwright/presentation-fixture.html?${query}`;

test.describe("presentation system", () => {
  test("keeps the native shell composed at the minimum viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto(fixture("view=system"));

    await expect(page.getByText("SilkScribe", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Keep SilkScribe ready to record" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Studio Display/ }),
    ).toBeVisible();
    await expect(page.locator("main")).toHaveCSS("overflow-y", "auto");
  });

  test("preserves logical layout and controls in RTL", async ({ page }) => {
    await page.goto(fixture("view=system&dir=rtl"));

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByRole("switch", { name: "Audio feedback" }),
    ).toBeChecked();
    await page.getByRole("switch", { name: "Audio feedback" }).focus();
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("switch", { name: "Audio feedback" }),
    ).not.toBeChecked();
  });

  test("uses near-instant transitions when reduced motion is requested", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(fixture("view=system"));

    await expect(page.getByRole("button", { name: "⌘ ⇧ Space" })).toHaveCSS(
      "transition-duration",
      "0.001s",
    );
  });

  test("recomposes without horizontal clipping at 200 percent zoom", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto(fixture("view=system"));
    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });

    await expect(
      page.getByRole("heading", { name: "Keep SilkScribe ready to record" }),
    ).toBeVisible();
    const horizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
  });
});

test.describe("portalled interactions", () => {
  test("keeps dropdowns in view and restores trigger focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 740, height: 520 });
    await page.goto(fixture("view=dropdown"));

    const trigger = page.getByRole("button", { name: "Native Keys" });
    await trigger.click();

    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    const bounds = await listbox.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(740);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(520);

    await page.keyboard.press("ArrowUp");
    await expect(
      page.getByRole("option", { name: "Tauri global shortcut" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(listbox).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("traps dialog focus, closes on Escape, and restores focus", async ({
    page,
  }) => {
    await page.goto(fixture("view=dialog"));

    const dialog = page.getByRole("alertdialog", {
      name: "Delete this local model?",
    });
    await page.getByRole("button", { name: "Open dialog" }).click();
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Open dialog" }),
    ).toBeFocused();
  });
});

test.describe("deterministic product states", () => {
  for (const state of [
    "active",
    "installed",
    "downloadable",
    "downloading",
    "extracting",
    "switching",
    "error",
  ]) {
    test(`renders the ${state} model state`, async ({ page }) => {
      await page.goto(fixture(`view=model&state=${state}`));
      await expect(page.getByText("Parakeet V3")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("undefined");
    });
  }

  test("keeps copied feedback inside the history row geometry", async ({
    page,
  }) => {
    await page.goto(fixture("view=history"));
    const row = page.getByTestId("history-row");
    const before = await row.boundingBox();

    const copy = page.getByTestId("history-copy-button");
    await copy.click();
    await expect(copy).toHaveAccessibleName(/copied/i);
    const after = await row.boundingBox();
    expect(after?.height).toBe(before?.height);
  });

  test("keeps onboarding action reachable at minimum height", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1180, height: 640 });
    await page.goto(fixture("view=onboarding"));

    await expect(
      page.getByRole("button", { name: "Open System Settings" }),
    ).toBeVisible();
    await expect(page.locator('li[aria-current="step"]')).toContainText(
      "Accessibility",
    );
  });

  for (const state of [
    "recording",
    "transcribing",
    "processing",
    "success",
    "error",
    "cancelled",
  ]) {
    test(`announces the ${state} overlay state`, async ({ page }) => {
      await page.setViewportSize({ width: 420, height: 160 });
      await page.goto(fixture(`view=overlay&state=${state}`));

      await expect(page.getByRole("status")).toBeVisible();
      await expect(page.getByRole("status")).toHaveAttribute(
        "aria-label",
        /.+/,
      );
      if (state !== "recording") {
        await expect(page.getByRole("status")).toContainText(/\S+/);
      }
    });
  }
});
