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

  const OVERLAY_STATES = [
    "recording",
    "transcribing",
    "processing",
    "success",
    "error",
    "cancelled",
    "empty",
  ] as const;

  const STATE_LABELS: Record<string, string> = {
    recording: "Recording",
    transcribing: "Transcribing",
    processing: "Processing",
    success: "Done",
    error: "Failed",
    cancelled: "Cancelled",
    empty: "Nothing heard",
  };

  /** Perceived brightness, for the light/dark ink assertion below. */
  const luminance = (rgb: string) => {
    const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? ["0", "0", "0"]).map(
      Number,
    );
    const channel = (value: number) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  for (const theme of ["light", "dark"] as const) {
    for (const state of OVERLAY_STATES) {
      test(`announces the ${state} overlay state (${theme})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 460, height: 180 });
        await page.goto(
          fixture(`view=overlay&state=${state}&theme=${theme}&detail=1`),
        );

        const status = page.getByRole("status");
        await expect(status).toBeVisible();
        // The announcement must name the state, not merely be non-empty.
        await expect(status).toHaveAttribute(
          "aria-label",
          new RegExp(STATE_LABELS[state]),
        );
        if (state !== "recording") {
          await expect(status).toContainText(/\S+/);
        }
      });
    }

    test(`inverts the overlay ink for the ${theme} pill`, async ({ page }) => {
      await page.setViewportSize({ width: 460, height: 180 });
      // `cancelled` renders its label in plain ink; `error` is deliberately red
      // in both themes, so it cannot carry this assertion.
      await page.goto(fixture(`view=overlay&state=cancelled&theme=${theme}`));

      // "It renders" would not catch a light variant that forgot to flip its
      // ink, which is the most likely theming regression here.
      const ink = await page
        .locator(".overlay-label")
        .evaluate((el) => getComputedStyle(el).color);
      const expectsDarkInk = theme === "light";
      expect(luminance(ink) < 0.5).toBe(expectsDarkInk);
    });
  }

  test("keeps the pill inside the native overlay window", async ({ page }) => {
    // There is no shared source of truth between the CSS pill size and
    // OVERLAY_WIDTH/OVERLAY_HEIGHT in src-tauri/src/overlay.rs, so pin both
    // here and let this fail loudly if either drifts.
    const OVERLAY_WINDOW = { width: 400, height: 116 };

    await page.setViewportSize(OVERLAY_WINDOW);
    await page.goto(fixture("view=overlay&state=success&detail=1"));

    const box = await page.getByRole("status").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(OVERLAY_WINDOW.width);
    expect(box!.height).toBeLessThanOrEqual(OVERLAY_WINDOW.height);
  });

  test("keeps the overlay legible under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 460, height: 180 });
    await page.goto(fixture("view=overlay&state=transcribing"));

    const node = page.locator(".overlay-node-lead");
    await expect(node).toHaveCSS("animation-name", "none");

    // ...but the pill must keep a real transition so states stay readable.
    // This is what proves the overlay opts out of theme.css's blanket
    // `*{transition-duration:1ms!important}` reduced-motion rule.
    const duration = await page
      .locator(".overlay-pill")
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).not.toMatch(/^0\.001s/);
  });
});
