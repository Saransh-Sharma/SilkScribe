import {
  CheckCircle2,
  CircleHelp,
  LockKeyhole,
  Mic2,
  Sparkles,
  Waves,
} from "lucide-react";
import {
  externalLinks,
  featureStories,
  heroProofPoints,
  howItWorksSteps,
  marketingScreenshots,
} from "./content";
import { ActionButton, InlinePill, SectionIntro, SiteFrame } from "./shared";

const heroScreenshot = marketingScreenshots.hero;

const HeroVisual = () => (
  <div className="hero-stage" data-hero>
    <div
      className="hero-stage__ribbon hero-stage__ribbon--one"
      aria-hidden="true"
    />
    <div
      className="hero-stage__ribbon hero-stage__ribbon--two"
      aria-hidden="true"
    />
    <div
      className="hero-stage__ribbon hero-stage__ribbon--three"
      aria-hidden="true"
    />

    <figure className="product-shot product-shot--hero">
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

    <article className="floating-console floating-console--recorder">
      <span className="floating-console__eyebrow">Live overlay</span>
      <div className="floating-console__wave">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <p>
        Hold, speak, release. SilkScribe keeps the dictation rhythm compact.
      </p>
    </article>

    <article className="floating-console floating-console--support">
      <span className="floating-console__eyebrow">Support-ready</span>
      <p>
        Mic, permissions, and paste flow are explained the same way the app
        explains them.
      </p>
    </article>
  </div>
);

export const MarketingPage = () => (
  <SiteFrame page="marketing">
    <section className="hero">
      <div className="hero__copy">
        <InlinePill>Mac dictation designed for focused work</InlinePill>
        <p className="hero__eyebrow" data-hero>
          Speech-to-text for people who would rather keep typing flow than open
          another AI workspace.
        </p>
        <h1 data-hero>
          Hold a shortcut. Speak naturally. Let SilkScribe finish the sentence
          in the app you are already using.
        </h1>
        <p className="hero__body" data-hero>
          SilkScribe gives Mac professionals a faster dictation rhythm without
          forcing the cloud, locking away models, or hiding setup behind
          confusing system dialogs. It feels premium, but the core stays local,
          open, and practical.
        </p>
        <div className="hero__actions" data-hero>
          <ActionButton
            href={externalLinks.appStore}
            caption={
              externalLinks.appStore
                ? undefined
                : "Primary App Store CTA becomes live as soon as the listing URL exists."
            }
          >
            {externalLinks.appStore
              ? "Get SilkScribe for Mac"
              : "Mac App Store in review"}
          </ActionButton>
          <ActionButton href={externalLinks.github} tone="secondary" external>
            Explore the open-source project
          </ActionButton>
        </div>
        <div className="hero__proof" data-hero>
          {heroProofPoints.map((item) => (
            <div className="proof-chip" key={item.label}>
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
      <HeroVisual />
    </section>

    <section className="trust-band" data-reveal>
      <div className="trust-band__intro">
        <span className="eyebrow">Why it feels different</span>
        <p>
          SilkScribe is opinionated about staying close to the desktop. The
          product earns trust through setup clarity, local processing, and
          output that lands where the work is.
        </p>
      </div>
      <div className="trust-band__items">
        <div>
          <LockKeyhole aria-hidden="true" />
          <span>Privacy-first by default</span>
        </div>
        <div>
          <Mic2 aria-hidden="true" />
          <span>Mac permissions explained clearly</span>
        </div>
        <div>
          <Sparkles aria-hidden="true" />
          <span>Optional post-processing on supported Macs</span>
        </div>
        <div>
          <Waves aria-hidden="true" />
          <span>Built around a desktop shortcut habit</span>
        </div>
      </div>
    </section>

    <section className="section-block" id="how-it-works">
      <SectionIntro
        eyebrow="How it works"
        title="The rhythm is simple on purpose."
        body="SilkScribe removes the ceremony around dictation so the interaction becomes muscle memory instead of a new workspace to manage."
      />
      <div className="steps-grid">
        {howItWorksSteps.map((step, index) => (
          <article className="step-card" key={step.title} data-reveal>
            <span className="step-card__index">0{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </article>
        ))}
      </div>
    </section>

    <section className="section-block" id="features">
      <SectionIntro
        eyebrow="Feature narrative"
        title="A product site with just enough polish, backed by real product behavior."
        body="These sections mirror how SilkScribe already behaves in the app today: permission guidance, local engines, custom model control, and output that respects the active text field."
      />
      <div className="feature-stack">
        {featureStories.map((story) => (
          <article
            className={`feature-story feature-story--${story.accent}`}
            key={story.title}
            data-reveal
          >
            <div className="feature-story__copy">
              <span className="eyebrow">{story.eyebrow}</span>
              <h3>{story.title}</h3>
              <p>{story.description}</p>
              <ul className="feature-story__list">
                {story.bullets.map((bullet) => (
                  <li key={bullet}>
                    <CheckCircle2 aria-hidden="true" />
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
            <div className="feature-story__visual" aria-hidden="true">
              <div className="feature-visual-card">
                <span className="feature-visual-card__line" />
                <span className="feature-visual-card__line feature-visual-card__line--strong" />
                <span className="feature-visual-card__line" />
              </div>
              <div className="feature-visual-pill">{story.eyebrow}</div>
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="platform-panel" data-reveal>
      <div className="platform-panel__copy">
        <span className="eyebrow">Mac now, more surfaces next</span>
        <h2>
          Designed for Mac workflows today. An iOS companion is on the roadmap,
          not in the critical path.
        </h2>
        <p>
          The App Store-facing experience stays firmly Mac-first: shortcuts,
          desktop permissions, and native typing flow. iOS is mentioned as a
          future extension, not a distraction from the product that exists right
          now.
        </p>
      </div>
      <div className="platform-panel__meta">
        <div className="meta-card">
          <span className="meta-card__label">Current surface</span>
          <strong>macOS desktop app</strong>
        </div>
        <div className="meta-card meta-card--accent">
          <span className="meta-card__label">Coming soon</span>
          <strong>iOS companion</strong>
        </div>
      </div>
    </section>

    <section className="cta-band" data-reveal>
      <div className="cta-band__copy">
        <span className="eyebrow">Need setup clarity before listing day?</span>
        <h2>The support page is ready for App Store review and real users.</h2>
        <p>
          Permissions help, shortcut troubleshooting, model setup notes, and
          direct support channels all live in one place without requiring a
          login.
        </p>
      </div>
      <div className="cta-band__actions">
        <ActionButton href="support/" tone="secondary">
          Open support
        </ActionButton>
        <ActionButton href={externalLinks.githubIssues} tone="ghost" external>
          Review known issues
        </ActionButton>
      </div>
      <a className="cta-band__inline-link" href="support/#faq">
        See the troubleshooting FAQ
        <CircleHelp aria-hidden="true" />
      </a>
    </section>
  </SiteFrame>
);
