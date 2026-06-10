import {
  ArrowUpRight,
  CircleAlert,
  FileText,
  Github,
  MessageSquareQuote,
  Wrench,
} from "lucide-react";
import {
  externalLinks,
  faqItems,
  supportChannels,
  troubleshootingCards,
} from "./content";
import { SectionIntro, SiteFrame, SupportJumpLink } from "./shared";

export const SupportPage = () => (
  <SiteFrame page="support">
    <section className="support-hero">
      <div className="support-hero__copy" data-hero>
        <span className="eyebrow">SilkScribe support</span>
        <h1>Help for clear Mac setup and everyday voice typing.</h1>
        <p>
          Find the fastest path through permissions, shortcuts, model setup,
          text insertion, and direct support without leaving the product story
          behind.
        </p>
      </div>
      <div className="support-hero__channels" id="support-channels">
        {supportChannels.map((channel) => (
          <a
            className="support-channel"
            href={channel.href}
            key={channel.title}
            target={channel.href.startsWith("mailto:") ? undefined : "_blank"}
            rel={channel.href.startsWith("mailto:") ? undefined : "noreferrer"}
            data-hero
          >
            <span className="support-channel__label">{channel.title}</span>
            <strong>{channel.label}</strong>
            <p>{channel.body}</p>
            <span className="support-channel__cta">
              Open
              <ArrowUpRight aria-hidden="true" />
            </span>
          </a>
        ))}
      </div>
    </section>

    <section className="jump-grid">
      <SupportJumpLink
        href="#microphone"
        title="Microphone permission"
        body="Fix the most common first-run blocker on macOS."
      />
      <SupportJumpLink
        href="#accessibility"
        title="Accessibility access"
        body="Required for typing the transcript back into your app."
      />
      <SupportJumpLink
        href="#shortcuts"
        title="Shortcut troubleshooting"
        body="Resolve conflicts with launchers and global hotkeys."
      />
      <SupportJumpLink
        href="#typing"
        title="Insertion and paste flow"
        body="Keep focus stable and choose the right paste mode."
      />
      <SupportJumpLink
        href="#models"
        title="Model setup"
        body="Confirm downloads and local engine readiness."
      />
      <SupportJumpLink
        href="#history"
        title="History and logs"
        body="Gather the right context before filing a bug."
      />
    </section>

    <section className="section-block" id="troubleshooting">
      <SectionIntro
        eyebrow="Before you contact us"
        title="Start with the parts macOS needs SilkScribe to use."
        body="Most issues come down to microphone access, accessibility access, shortcut conflicts, model readiness, or where the text is being inserted."
      />
      <div className="troubleshooting-grid">
        {troubleshootingCards.map((card) => (
          <article
            className="troubleshooting-card"
            id={card.id}
            key={card.id}
            data-reveal
          >
            <div className="troubleshooting-card__header">
              <Wrench aria-hidden="true" />
              <div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </div>
            </div>
            <ol>
              {card.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {card.note ? (
              <p className="troubleshooting-card__note">
                <CircleAlert aria-hidden="true" />
                {card.note}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>

    <section className="section-block" id="faq">
      <SectionIntro
        eyebrow="FAQ"
        title="Answers for people setting up private Mac voice typing."
        body="These answers stay focused on what SilkScribe needs to hear your voice, turn it into text, and write into the app you are already using."
      />
      <div className="faq-list">
        {faqItems.map((item) => (
          <details className="faq-item" key={item.id} id={item.id} data-reveal>
            <summary>
              <span>{item.question}</span>
              <ArrowUpRight aria-hidden="true" />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>

    <section className="section-block">
      <SectionIntro
        eyebrow="Known limitations"
        title="Transparent about where support is strongest."
        body="SilkScribe is open source and actively evolving. If you hit something repeatable, prefer GitHub issues so the report stays public, searchable, and useful to the next person."
      />
      <div className="limit-grid">
        <article className="limit-card" data-reveal>
          <MessageSquareQuote aria-hidden="true" />
          <h3>Best support path</h3>
          <p>
            Email is great for direct help. GitHub issues are best for bugs and
            crash details that should stay visible.
          </p>
        </article>
        <article className="limit-card" data-reveal>
          <FileText aria-hidden="true" />
          <h3>What helps most</h3>
          <p>
            Include your macOS version, Apple Silicon or Intel, selected model,
            shortcut mode, and whether transcription succeeded before text
            insertion failed.
          </p>
        </article>
      </div>
      <div className="limit-links" data-reveal>
        <a href={externalLinks.githubIssues} target="_blank" rel="noreferrer">
          <Github aria-hidden="true" />
          Review open issues
        </a>
        <a href={externalLinks.githubReleases} target="_blank" rel="noreferrer">
          <FileText aria-hidden="true" />
          Read release notes
        </a>
      </div>
    </section>
  </SiteFrame>
);
