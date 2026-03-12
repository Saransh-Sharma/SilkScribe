export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface ProofPoint {
  label: string;
  value: string;
}

export interface Step {
  title: string;
  description: string;
}

export interface FeatureStory {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  accent: "blue" | "amber" | "berry";
}

export interface SupportChannel {
  title: string;
  href: string;
  body: string;
  label: string;
}

export interface TroubleshootingCard {
  id: string;
  title: string;
  body: string;
  steps: string[];
  note?: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface ScreenshotAsset {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption: string;
}

const normalizedSiteUrl =
  import.meta.env.VITE_SITE_URL?.trim().replace(/\/$/, "") || null;

export const externalLinks = {
  github: "https://github.com/SilkScribe/SilkScribe",
  githubIssues: "https://github.com/SilkScribe/SilkScribe/issues",
  githubReleases: "https://github.com/SilkScribe/SilkScribe/releases",
  email: "mailto:contact@silkscribe.app",
  appStore: import.meta.env.VITE_SITE_APP_STORE_URL?.trim() || null,
  siteUrl: normalizedSiteUrl,
  canonicalOgImageUrl: normalizedSiteUrl
    ? `${normalizedSiteUrl}/og-image.webp`
    : null,
};

export const marketingScreenshots: Record<"hero", ScreenshotAsset> = {
  hero: {
    src: "./screenshots/onboarding-welcome.webp",
    alt: "SilkScribe onboarding screen showing the Mac-first setup flow.",
    width: 1548,
    height: 1148,
    caption: "Actual SilkScribe onboarding UI captured from the app component.",
  },
};

export const heroProofPoints: ProofPoint[] = [
  { label: "Offline-first", value: "Runs on your Mac" },
  { label: "Privacy-first", value: "No forced cloud hop" },
  { label: "Open source", value: "Built in public" },
  { label: "Custom models", value: "Whisper + Parakeet" },
  {
    label: "Optional post-processing",
    value: "Apple Intelligence on supported Macs",
  },
];

export const howItWorksSteps: Step[] = [
  {
    title: "Hold your shortcut",
    description:
      "SilkScribe is built around one quick rhythm instead of menus, floating toolbars, and extra ceremony.",
  },
  {
    title: "Speak naturally",
    description:
      "Local speech engines listen for the part that matters, with support for offline transcription and cleaner short bursts.",
  },
  {
    title: "Release to paste",
    description:
      "SilkScribe places the text back into the active app, so the result lands where you were already working.",
  },
];

export const featureStories: FeatureStory[] = [
  {
    eyebrow: "Native setup",
    title: "Mac permissions are explained like product UX, not like a wiki.",
    description:
      "The onboarding flow mirrors how the app actually works: microphone access, accessibility access, and one real test so people know the setup is finished.",
    bullets: [
      "Clear permission language",
      "One-minute first run",
      "Mac-first troubleshooting",
    ],
    accent: "blue",
  },
  {
    eyebrow: "Local engines",
    title: "Speech stays close to the work.",
    description:
      "SilkScribe prioritizes on-device transcription. Use Whisper variants, Parakeet V3, and optional post-processing without turning the product into a black box.",
    bullets: [
      "Offline transcription",
      "GPU acceleration where available",
      "Optional Apple Intelligence post-processing on Apple Silicon + macOS Tahoe 26+",
    ],
    accent: "amber",
  },
  {
    eyebrow: "Focused output",
    title: "Built for typing into the apps you already live in.",
    description:
      "This is not another dashboard-first AI workspace. SilkScribe is tuned for focused desktop flow, from shortcuts to paste modes to history and custom word correction.",
    bullets: [
      "Push to talk or tap once",
      "Clipboard-safe paste modes",
      "History and custom words",
    ],
    accent: "berry",
  },
];

export const supportChannels: SupportChannel[] = [
  {
    title: "Email support",
    href: externalLinks.email,
    label: "Email contact@silkscribe.app",
    body: "Use this for App Store review questions, account-free support, or anything you would rather not post publicly.",
  },
  {
    title: "GitHub issues",
    href: externalLinks.githubIssues,
    label: "Open an issue",
    body: "Best for reproducible bugs, crash reports, feature requests, and known limitations that should stay discoverable.",
  },
];

export const troubleshootingCards: TroubleshootingCard[] = [
  {
    id: "microphone",
    title: "Microphone permission",
    body: "SilkScribe cannot transcribe if macOS has blocked mic access.",
    steps: [
      "Open System Settings > Privacy & Security > Microphone.",
      "Turn SilkScribe on.",
      "Quit and reopen the app, then try one short dictation in a focused text field.",
    ],
    note: "If you previously chose “Don’t Allow,” macOS will not ask again until you re-enable it here.",
  },
  {
    id: "accessibility",
    title: "Accessibility access",
    body: "SilkScribe needs Accessibility permission so it can place text back into your apps.",
    steps: [
      "Open System Settings > Privacy & Security > Accessibility.",
      "Enable SilkScribe in the list.",
      "Return to the app and run the quick practice flow again.",
    ],
  },
  {
    id: "shortcuts",
    title: "Shortcut not firing",
    body: "A shortcut can fail if another app has claimed the same key combination or the keyboard backend needs adjustment.",
    steps: [
      "Open SilkScribe Settings > General > SilkScribe Shortcuts.",
      "Choose a shortcut that is not already owned by Raycast, Spotlight, or another launcher.",
      "If needed, switch the keyboard implementation in Debug settings and test again.",
    ],
  },
  {
    id: "typing",
    title: "Text is not inserting",
    body: "Most insertion issues come from focus or paste method selection rather than the speech engine.",
    steps: [
      "Keep the destination text field focused until transcription finishes.",
      "Check Settings > Advanced > Paste Method.",
      "If you preserve clipboard contents, SilkScribe may switch to direct insertion to avoid replacing your clipboard.",
    ],
  },
  {
    id: "models",
    title: "Model download or setup issues",
    body: "If the preferred speech engine is still preparing, SilkScribe needs time to finish model setup locally.",
    steps: [
      "Wait for the model setup screen to finish preparing the offline engine.",
      "Open Models settings to confirm the selected model is installed.",
      "If a download fails, try again on a stable connection or switch to another supported model.",
    ],
    note: "Community models are supported, but troubleshooting is strongest for the default packaged options.",
  },
  {
    id: "history",
    title: "History and logs",
    body: "You can use history to confirm transcriptions succeeded even if insertion failed, then gather logs if support needs them.",
    steps: [
      "Open the Home dashboard to review recent activity and saved transcripts.",
      "Press Cmd+Shift+D to reveal Debug mode if the Debug section is hidden.",
      "Then open Settings > Debug to reveal the log directory when support asks for logs.",
      "Share your macOS version, chip type, model choice, and the exact behavior you saw.",
    ],
  },
];

export const faqItems: FaqItem[] = [
  {
    id: "faq-offline",
    question: "Does SilkScribe require the cloud to transcribe?",
    answer:
      "No. SilkScribe is designed around local transcription on your own machine. Optional post-processing can use external providers, but the product is usable without shipping your voice to a remote service.",
  },
  {
    id: "faq-mac",
    question: "Is the App Store version Mac-only?",
    answer:
      "The pages here are intentionally Mac-first because the App Store listing is for the macOS desktop app. SilkScribe also has a broader desktop story, and an iOS companion is planned separately.",
  },
  {
    id: "faq-permissions",
    question: "Why does SilkScribe ask for Accessibility permission?",
    answer:
      "That permission allows SilkScribe to place text into the app you are actively using. Without it, the app may be able to hear and transcribe your voice but it cannot type the result back where you need it.",
  },
  {
    id: "faq-models",
    question: "Which models does SilkScribe support?",
    answer:
      "SilkScribe supports multiple Whisper variants and Parakeet V3, with room for additional and community-provided models. Exact availability can vary by build and platform capabilities.",
  },
  {
    id: "faq-apple-intelligence",
    question: "Does Apple Intelligence work on every Mac?",
    answer:
      "No. Apple Intelligence is an optional post-processing path and requires an Apple Silicon Mac running macOS Tahoe (26.0) or later with Apple Intelligence enabled in System Settings.",
  },
  {
    id: "faq-support",
    question: "Where should I report a crash or repeatable bug?",
    answer:
      "Use GitHub issues for anything reproducible so the report stays searchable. Include your macOS version, hardware, selected model, shortcut mode, and whether the issue happens before or after transcription finishes.",
  },
];

export const marketingNav: NavLink[] = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Support", href: "support/" },
  { label: "GitHub", href: externalLinks.github, external: true },
];

export const supportNav: NavLink[] = [
  { label: "Overview", href: "../" },
  { label: "Troubleshooting", href: "#troubleshooting" },
  { label: "FAQ", href: "#faq" },
  { label: "GitHub", href: externalLinks.github, external: true },
];
