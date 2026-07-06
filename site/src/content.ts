export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface Step {
  title: string;
  description: string;
}

export interface MarketingCard {
  title: string;
  body: string;
}

export interface BeforeAfterExample {
  label: string;
  spoken: string;
  written: string;
}

export interface AudienceCard {
  title: string;
  body: string;
  example: string;
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
  github: "https://github.com/Saransh-Sharma/SilkScribe",
  githubIssues: "https://github.com/Saransh-Sharma/SilkScribe/issues",
  githubReleases:
    "https://github.com/Saransh-Sharma/SilkScribe/releases/tag/v0.1.0",
  email: "mailto:contact@silkscribe.app",
  appStore: import.meta.env.VITE_SITE_APP_STORE_URL?.trim() || null,
  siteUrl: normalizedSiteUrl,
  canonicalOgImageUrl: normalizedSiteUrl
    ? `${normalizedSiteUrl}/og-image.webp`
    : null,
};

export const primaryDownloadHref =
  externalLinks.appStore ?? externalLinks.githubReleases;

export const primaryDownloadLabel = externalLinks.appStore
  ? "Get SilkScribe for Mac"
  : "Download from GitHub Releases";

export const marketingScreenshots: Record<"hero", ScreenshotAsset> = {
  hero: {
    src: "./screenshots/onboarding-welcome.webp",
    alt: "SilkScribe onboarding screen showing the Mac-first setup flow.",
    width: 1548,
    height: 1148,
    caption: "Actual SilkScribe onboarding UI captured from the app component.",
  },
};

export const howItWorksSteps: Step[] = [
  {
    title: "Hold your shortcut",
    description:
      "Start dictation from anywhere on your Mac. No dashboard, meeting bot, or extra writing workspace.",
  },
  {
    title: "Say it naturally",
    description:
      "Speak the rough version. Pause, correct yourself, and use your own words while SilkScribe captures the thought.",
  },
  {
    title: "Release to write",
    description:
      "Clean text appears where your cursor already is, ready to use without a copy-paste ritual.",
  },
];

export const heroDemo = {
  spoken:
    "hey can you send the update to the team and say i finished the onboarding copy and i'll share screenshots later today also mention setup should be less than a minute",
  written:
    "Hey team - I finished the onboarding copy and will share screenshots later today. Setup should take less than a minute.",
};

export const beforeAfterExamples: BeforeAfterExample[] = [
  {
    label: "Team update",
    spoken:
      "quick update i finished the onboarding copy and i'll share the screenshots later today can you review the first run setup flow once",
    written:
      "Quick update: I finished the onboarding copy and will share the screenshots later today. Can you review the first-run setup flow once?",
  },
  {
    label: "Slack reply",
    spoken:
      "yeah this looks good to me but let's make the empty state a little warmer and reduce the top padding before we ship",
    written:
      "Yeah, this looks good to me. Let's make the empty state a little warmer and reduce the top padding before we ship.",
  },
  {
    label: "AI prompt",
    spoken:
      "act like a senior product designer and review this onboarding screen for clarity friction hierarchy and emotional tone",
    written:
      "Act like a senior product designer and review this onboarding screen for clarity, friction, hierarchy, and emotional tone.",
  },
  {
    label: "Email",
    spoken:
      "hi priya thanks for sending this over i'll review it by evening and send comments if anything needs to change",
    written:
      "Hi Priya, thanks for sending this over. I'll review it by evening and send comments if anything needs to change.",
  },
];

export const appBadges = [
  "Mail",
  "Notes",
  "Slack",
  "Teams",
  "Notion",
  "Cursor",
  "Linear",
  "Safari",
  "Messages",
  "Docs",
  "ChatGPT",
  "Any text field",
];

export const privacyCards: MarketingCard[] = [
  {
    title: "Local-first transcription",
    body: "Use local speech models so dictation can happen on your Mac.",
  },
  {
    title: "No forced cloud workspace",
    body: "SilkScribe is not designed around uploading every thought to a web dashboard.",
  },
  {
    title: "Clear permissions",
    body: "Microphone and accessibility permissions are explained during setup.",
  },
  {
    title: "Open source",
    body: "Review the code, understand the product, and verify how it works.",
  },
];

export const outputCards: MarketingCard[] = [
  {
    title: "Natural cleanup",
    body: "Turns rough speech into readable sentences.",
  },
  {
    title: "Smart punctuation",
    body: "Adds punctuation and casing so the result feels written, not dumped.",
  },
  {
    title: "Custom vocabulary",
    body: "Teach SilkScribe names, acronyms, product terms, and phrases you use often.",
  },
  {
    title: "Optional polish",
    body: "Use supported Apple Intelligence post-processing where available for cleaner formatting and clarity.",
  },
  {
    title: "Recent history",
    body: "Recover recent dictations when you need to reuse or restore something.",
  },
  {
    title: "Flexible paste modes",
    body: "Choose how SilkScribe inserts text into the active app.",
  },
];

export const audienceCards: AudienceCard[] = [
  {
    title: "For builders",
    body: "Dictate bug reports, PR notes, code comments, technical prompts, and implementation thoughts without breaking focus.",
    example: "Explain why this API should be idempotent and mention retry behavior.",
  },
  {
    title: "For managers",
    body: "Turn spoken thoughts into clear updates, review comments, feedback notes, planning docs, and follow-ups.",
    example:
      "Summarize the decision and mention that we need owner, timeline, and risk tracking.",
  },
  {
    title: "For writers",
    body: "Capture ideas, rough paragraphs, outlines, and edits without waiting for the perfect first sentence.",
    example:
      "Draft a paragraph about why privacy-first tools feel calmer to use.",
  },
  {
    title: "For operators",
    body: "Move through support replies, internal notes, checklists, and repeated messages faster.",
    example:
      "Tell the customer we are checking this and will share an update by tomorrow.",
  },
];

export const setupCards: MarketingCard[] = [
  {
    title: "Microphone access",
    body: "Needed to capture your speech when you trigger dictation.",
  },
  {
    title: "Accessibility access",
    body: "Needed to place text into the active app.",
  },
  {
    title: "Shortcut setup",
    body: "Choose the key combination that feels natural.",
  },
  {
    title: "Test dictation",
    body: "Confirm the full speak-and-write flow before you rely on it.",
  },
];

export const finalTrustStrip = [
  "Private by default",
  "Mac-native",
  "Works anywhere",
  "Open source",
];

export const supportChannels: SupportChannel[] = [
  {
    title: "Email support",
    href: externalLinks.email,
    label: "Email contact@silkscribe.app",
    body: "Use this for account-free support, setup questions, or anything you would rather not post publicly.",
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
      "No. SilkScribe is designed around local transcription on your own Mac. Optional post-processing can use external providers, but the core voice typing flow is built for local-first use.",
  },
  {
    id: "faq-mac",
    question: "Is SilkScribe built for Mac workflows?",
    answer:
      "Yes. The site is intentionally Mac-first because SilkScribe is built around desktop shortcuts, macOS permissions, and writing into the app where your cursor already is.",
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
      "SilkScribe supports local transcription models, including Whisper variants and Parakeet V3 in supported builds. Exact availability can vary by release and Mac capabilities.",
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
  { label: "Privacy", href: "#privacy" },
  { label: "Use cases", href: "#use-cases" },
  { label: "Open source", href: "#open-source" },
  { label: "Support", href: "support/" },
  { label: "GitHub", href: externalLinks.github, external: true },
];

export const supportNav: NavLink[] = [
  { label: "Overview", href: "../" },
  { label: "Troubleshooting", href: "#troubleshooting" },
  { label: "FAQ", href: "#faq" },
  { label: "GitHub", href: externalLinks.github, external: true },
];
