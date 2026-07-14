import { CalendarDays, Database, FileText, LockKeyhole } from "lucide-react";
import { externalLinks, privacySections } from "./content";
import { SectionIntro, SiteFrame } from "./shared";

export const PrivacyPage = () => (
  <SiteFrame page="privacy">
    <section className="support-hero">
      <div className="support-hero__copy" data-hero>
        <span className="eyebrow">SilkScribe privacy policy</span>
        <h1>Local-first voice typing with clear boundaries.</h1>
        <p>
          This policy explains how SilkScribe handles microphone audio, local
          models, local history, optional post-processing, and support contact.
        </p>
      </div>
      <div className="support-hero__channels" id="privacy-summary">
        <article className="support-channel" data-hero>
          <span className="support-channel__label">Core product</span>
          <strong>Local transcription</strong>
          <p>
            SilkScribe is designed to transcribe speech on your Mac with local
            model files.
          </p>
          <LockKeyhole aria-hidden="true" />
        </article>
        <article className="support-channel" data-hero>
          <span className="support-channel__label">Last updated</span>
          <strong>July 7, 2026</strong>
          <p>
            This page covers the first Mac App Store release of SilkScribe.
          </p>
          <CalendarDays aria-hidden="true" />
        </article>
      </div>
    </section>

    <section className="section-block">
      <SectionIntro
        eyebrow="Data handling"
        title="What SilkScribe uses and where it stays."
        body="The core app does not require a SilkScribe account. Most product data is stored locally on your Mac."
      />
      <div className="troubleshooting-grid">
        {privacySections.map((section) => (
          <article
            className="troubleshooting-card"
            key={section.title}
            data-reveal
          >
            <div className="troubleshooting-card__header">
              <Database aria-hidden="true" />
              <div>
                <h3>{section.title}</h3>
                <p>{section.body}</p>
              </div>
            </div>
            {section.items ? (
              <ol>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            ) : null}
          </article>
        ))}
      </div>
    </section>

    <section className="section-block">
      <SectionIntro
        eyebrow="Contact"
        title="Questions and requests."
        body="For privacy questions, support requests, or deletion requests related to support email, contact us directly."
      />
      <div className="limit-links" data-reveal>
        <a href={externalLinks.email}>
          <FileText aria-hidden="true" />
          contact@silkscribe.app
        </a>
        <a href={externalLinks.githubIssues} target="_blank" rel="noreferrer">
          <FileText aria-hidden="true" />
          GitHub issues
        </a>
      </div>
    </section>
  </SiteFrame>
);
