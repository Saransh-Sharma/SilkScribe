import {
  LogicalPosition,
  LogicalSize,
  currentMonitor,
  getCurrentWindow,
} from "@tauri-apps/api/window";

const WINDOW_MARGIN = 32;

const NORMAL_SIZE = { width: 1360, height: 920 };
const NORMAL_MIN_SIZE = { width: 1180, height: 820 };
const ONBOARDING_SIZE = { width: 1480, height: 980 };
const ONBOARDING_MIN_SIZE = { width: 1280, height: 900 };

let isOnboardingWindowModeActive = false;

const applyWindowMode = async (
  targetSize: { width: number; height: number },
  minSize: { width: number; height: number },
) => {
  const appWindow = getCurrentWindow();
  const monitor = await currentMonitor().catch(() => null);

  if (!monitor) {
    await appWindow.setMinSize(new LogicalSize(minSize.width, minSize.height));
    await appWindow.setSize(new LogicalSize(targetSize.width, targetSize.height));
    await appWindow.center();
    return;
  }

  const { scaleFactor, workArea } = monitor;
  const workAreaSize = workArea.size.toLogical(scaleFactor);
  const workAreaPosition = workArea.position.toLogical(scaleFactor);
  const availableWidth = Math.max(720, workAreaSize.width - WINDOW_MARGIN * 2);
  const availableHeight = Math.max(640, workAreaSize.height - WINDOW_MARGIN * 2);

  const appliedMinWidth = Math.min(minSize.width, availableWidth);
  const appliedMinHeight = Math.min(minSize.height, availableHeight);
  const appliedWidth = Math.min(
    Math.max(targetSize.width, appliedMinWidth),
    availableWidth,
  );
  const appliedHeight = Math.min(
    Math.max(targetSize.height, appliedMinHeight),
    availableHeight,
  );

  await appWindow.setMinSize(
    new LogicalSize(appliedMinWidth, appliedMinHeight),
  );
  await appWindow.setSize(new LogicalSize(appliedWidth, appliedHeight));

  const centeredX =
    workAreaPosition.x + Math.max(WINDOW_MARGIN, (workAreaSize.width - appliedWidth) / 2);
  const centeredY =
    workAreaPosition.y + Math.max(WINDOW_MARGIN, (workAreaSize.height - appliedHeight) / 2);

  await appWindow.setPosition(new LogicalPosition(centeredX, centeredY));
};

export const enterOnboardingWindowMode = async () => {
  if (isOnboardingWindowModeActive) return;
  isOnboardingWindowModeActive = true;
  await applyWindowMode(ONBOARDING_SIZE, ONBOARDING_MIN_SIZE);
};

export const exitOnboardingWindowMode = async () => {
  if (!isOnboardingWindowModeActive) return;
  isOnboardingWindowModeActive = false;
  await applyWindowMode(NORMAL_SIZE, NORMAL_MIN_SIZE);
};
