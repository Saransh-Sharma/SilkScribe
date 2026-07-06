import { useState, useEffect, type KeyboardEvent } from "react";
import { Check, Github, LockKeyhole, Mic, Sparkles, Copy, ArrowRight, ArrowDown } from "lucide-react";
import {
  appBadges,
  audienceCards,
  beforeAfterExamples,
  externalLinks,
  finalTrustStrip,
  heroDemo,
  howItWorksSteps,
  marketingScreenshots,
  outputCards,
  primaryDownloadHref,
  primaryDownloadLabel,
  privacyCards,
  setupCards,
} from "./content";
import { ActionButton, InlinePill, SectionIntro, SiteFrame } from "./shared";

const heroScreenshot = marketingScreenshots.hero;

const TrustRail = () => (
  <div className="trust-rail" data-hero aria-label="SilkScribe benefits">
    {[
      "Private by default",
      "Works in any app",
      "Runs locally",
      "Open source",
    ].map((item) => (
      <span key={item}>
        <Check aria-hidden="true" />
        {item}
      </span>
    ))}
  </div>
);

const HeroShowcase = () => (
  <div className="hero-showcase" data-hero>
    <div className="hero-showcase__inner">
      <figure className="hero-showcase__product">
        <img
          src={heroScreenshot.src}
          alt={heroScreenshot.alt}
          width={heroScreenshot.width}
          height={heroScreenshot.height}
          loading="eager"
          decoding="async"
        />
        <figcaption>{heroScreenshot.caption}</figcaption>
      </figure>

      <article className="hero-showcase__demo">
        <div className="demo-block demo-block--spoken">
          <span>Spoken thought</span>
          <p>"{heroDemo.spoken}"</p>
        </div>
        <div className="demo-flow" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="demo-block demo-block--written">
          <span>SilkScribe writes</span>
          <p>{heroDemo.written}</p>
        </div>
        <small>Hold shortcut → speak → release</small>
      </article>
    </div>
  </div>
);

const WorkflowSequence = () => (
  <div className="workflow-sequence">
    {howItWorksSteps.map((step, index) => (
      <article className="workflow-step" key={step.title} data-reveal>
        <span className="workflow-step__number">0{index + 1}</span>
        <div>
          <h3>{step.title}</h3>
          <p>{step.description}</p>
        </div>
      </article>
    ))}
  </div>
);

const ExampleSwitcher = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const activateTab = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + beforeAfterExamples.length) % beforeAfterExamples.length;
        break;
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % beforeAfterExamples.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = beforeAfterExamples.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActiveIndex(nextIndex);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [nextIndex]?.focus();
  };

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="example-switcher" data-reveal>
      <div
        className="example-switcher__tabs"
        role="tablist"
        aria-label="Before and after examples"
        aria-orientation="vertical"
      >
        {beforeAfterExamples.map((example, index) => (
          <button
            className={index === activeIndex ? "is-active" : undefined}
            key={example.label}
            type="button"
            role="tab"
            id={`example-tab-${index}`}
            aria-controls={`example-tabpanel-${index}`}
            aria-selected={index === activeIndex}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => setActiveIndex(index)}
            onKeyDown={(event) => activateTab(event, index)}
          >
            <span>0{index + 1}</span>
            {example.label}
          </button>
        ))}
      </div>
      {beforeAfterExamples.map((example, index) => (
        <div
          className="example-switcher__stage"
          key={example.label}
          role="tabpanel"
          id={`example-tabpanel-${index}`}
          aria-labelledby={`example-tab-${index}`}
          hidden={index !== activeIndex}
        >
          <div className="example-pane example-pane--spoken">
            <span>You say</span>
            <p>"{example.spoken}"</p>
          </div>
          <div className="example-pane example-pane--written">
            <span>SilkScribe writes</span>
            <p>{example.written}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

const ProductBento = () => (
  <div className="product-bento">
    <article className="bento-panel bento-panel--privacy" data-reveal>
      <div className="bento-panel__icon">
        <LockKeyhole aria-hidden="true" />
      </div>
      <span className="eyebrow">Privacy</span>
      <h3>Your voice should not have to leave your Mac.</h3>
      <p>
        Voice contains unfinished thoughts, private notes, and work before it is
        ready. SilkScribe is built around local-first transcription and clear
        permissions.
      </p>
      <ul>
        {privacyCards.map((card) => (
          <li key={card.title}>{card.title}</li>
        ))}
      </ul>
    </article>

    <article className="bento-panel bento-panel--output" data-reveal>
      <span className="eyebrow">Output quality</span>
      <h3>Clean text, not raw transcript.</h3>
      <div className="output-preview">
        <span>Rough speech</span>
        <p>
          yeah this looks good but lets reduce the top padding before we ship
        </p>
        <span>Clean text</span>
        <strong>
          Yeah, this looks good. Let's reduce the top padding before we ship.
        </strong>
      </div>
    </article>

    <article className="bento-panel bento-panel--compact" data-reveal>
      <span className="eyebrow">Vocabulary</span>
      <h3>{outputCards[2].title}</h3>
      <p>{outputCards[2].body}</p>
      <div className="term-list" aria-label="Example custom terms">
        <span>SilkScribe</span>
        <span>Parakeet V3</span>
        <span>Linear</span>
      </div>
    </article>

    <article className="bento-panel bento-panel--compact" data-reveal>
      <span className="eyebrow">Control</span>
      <h3>History and paste modes</h3>
      <p>
        Recover recent dictations and choose how text is inserted into the
        active app.
      </p>
      <div className="control-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </article>
  </div>
);

const AudienceRows = () => (
  <div className="audience-rows">
    {audienceCards.map((card, index) => (
      <article className="audience-row" key={card.title} data-reveal>
        <span className="audience-row__index">0{index + 1}</span>
        <div className="audience-row__copy">
          <h3>{card.title}</h3>
          <p>{card.body}</p>
        </div>
        <blockquote>"{card.example}"</blockquote>
      </article>
    ))}
  </div>
);

export const MarketingPage = () => (
  <SiteFrame page="marketing">
    <section className="hero">
      <div className="hero__copy">
        <InlinePill>A quiet utility for people who write all day</InlinePill>
        <p className="hero__eyebrow" data-hero>
          Private voice typing for Mac
        </p>
        <h1 data-hero>Don't open another AI app. Just speak.</h1>
        <p className="hero__body" data-hero>
          Hold a shortcut, say what you mean, and SilkScribe writes polished
          text inside the app you are already using.
        </p>
        <p className="hero__supporting" data-hero>
          Mail, Notes, Slack, Cursor, Notion, Safari, Linear — wherever your
          cursor is.
        </p>
        <div className="hero__actions" data-hero>
          <ActionButton href={primaryDownloadHref}>
            {primaryDownloadLabel}
          </ActionButton>
          <ActionButton href={externalLinks.github} tone="secondary" external>
            View on GitHub
          </ActionButton>
        </div>
        <TrustRail />
      </div>
      <HeroShowcase />
    </section>

    <section className="problem-section" data-reveal>
      <div className="problem-section__intro">
        <span className="eyebrow">The friction</span>
        <h2>Typing is where good thoughts slow down.</h2>
        <p>
          You already know what you want to say. The slow part is turning it
          into a clean message, note, prompt, update, or reply.
        </p>
      </div>
      <div className="workflow-compare">
        <div className="workflow-compare__row">
          <span>Without SilkScribe</span>
          <p>Think → type slowly → edit → copy → paste → continue</p>
        </div>
        <div className="workflow-compare__row workflow-compare__row--active">
          <span>With SilkScribe</span>
          <p>Think → speak → continue</p>
        </div>
      </div>
    </section>

    <section className="section-block" id="how-it-works">
      <SectionIntro
        eyebrow="How it works"
        title="One shortcut. No new workspace."
        body="SilkScribe works like a natural extension of your keyboard."
      />
      <WorkflowSequence />
      <p className="section-closing" data-reveal>
        It feels less like opening an app and more like adding a voice key to
        your Mac.
      </p>
    </section>

    <section className="section-block">
      <SectionIntro
        eyebrow="Before and after"
        title="Say the messy version. Use the polished version."
        body="SilkScribe is designed for real speech, not perfect dictation."
      />
      <ExampleSwitcher />
    </section>

    <section className="apps-section" data-reveal>
      <div>
        <span className="eyebrow">Works where you work</span>
        <h2>Dictate into the apps you already use.</h2>
      </div>
      <div className="app-rail" aria-label="Supported app examples">
        {appBadges.map((app) => (
          <span key={app}>{app}</span>
        ))}
      </div>
    </section>

    <section className="section-block" id="privacy">
      <SectionIntro
        eyebrow="Private and practical"
        title="Your voice stays close. Your output stays useful."
        body="Local-first transcription and thoughtful cleanup belong in the same product."
      />
      <ProductBento />
    </section>

    <section className="section-block" id="use-cases">
      <SectionIntro
        eyebrow="Use cases"
        title="For people who live in text fields."
        body="Builders, managers, writers, and operators can use SilkScribe whenever a thought needs to become usable text."
      />
      <AudienceRows />
    </section>

    <section className="product-section">
      <div className="product-section__media" data-reveal>
        <div className="product-section__bezel">
          <img
            src={heroScreenshot.src}
            alt="SilkScribe setup screen with guided Mac permissions."
            width={heroScreenshot.width}
            height={heroScreenshot.height}
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
      <div className="product-section__copy">
        <span className="eyebrow">Mac utility</span>
        <h2>Setup that feels clear from the first launch.</h2>
        <p>
          SilkScribe guides you through the permissions it needs and lets you
          test the full speak-and-write flow before you rely on it.
        </p>
        <ol className="setup-list">
          {setupCards.map((card, index) => (
            <li key={card.title} data-reveal>
              <span>0{index + 1}</span>
              <div>
                <strong>{card.title}</strong>
                <p>{card.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>

    <section className="open-source-section" id="open-source" data-reveal>
      <span className="eyebrow">Open source</span>
      <div>
        <h2>Trust should be inspectable.</h2>
        <p>
          Review the code, understand how SilkScribe handles meaningful access,
          report issues, and help shape the roadmap.
        </p>
      </div>
      <ActionButton href={externalLinks.github} tone="secondary" external>
        <Github aria-hidden="true" />
        View on GitHub
      </ActionButton>
    </section>

    <section className="final-cta" data-reveal>
      <div>
        <span className="eyebrow">Start speaking</span>
        <h2>Stop typing every thought.</h2>
        <p>
          SilkScribe gives your Mac a private voice layer, so you can speak
          naturally and keep working.
        </p>
      </div>
      <div className="final-cta__actions">
        <ActionButton href={primaryDownloadHref}>
          {primaryDownloadLabel}
        </ActionButton>
        <ActionButton href={externalLinks.github} tone="secondary" external>
          View on GitHub
        </ActionButton>
      </div>
      <p className="final-cta__trust">{finalTrustStrip.join(" · ")}</p>
    </section>
  </SiteFrame>
);
