import { type PropsWithChildren, useEffect } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  ChevronRight,
  Github,
  Mail,
  Sparkles,
} from "lucide-react";
import {
  externalLinks,
  marketingNav,
  primaryDownloadHref,
  supportNav,
  type NavLink,
} from "./content";
import { bootEffects } from "./reveal";

type PageKind = "marketing" | "support";

const isExternal = (href: string) =>
  href.startsWith("http://") ||
  href.startsWith("https://") ||
  href.startsWith("mailto:");

const LinkList = ({ links }: { links: NavLink[] }) => (
  <nav className="site-nav" aria-label="Primary">
    {links.map((link) => (
      <a
        key={link.label}
        className="site-nav__link"
        href={link.href}
        target={link.external ? "_blank" : undefined}
        rel={link.external ? "noreferrer" : undefined}
      >
        {link.label}
      </a>
    ))}
  </nav>
);

export const ActionButton = ({
  href,
  children,
  tone = "primary",
  caption,
  external,
}: PropsWithChildren<{
  href: string | null;
  tone?: "primary" | "secondary" | "ghost";
  caption?: string;
  external?: boolean;
}>) => {
  const className = `button button--${tone}${href ? "" : " button--disabled"}`;
  const content = (
    <>
      <span className="button__label">{children}</span>
      {href ? (
        <span className="button__arrow" aria-hidden="true">
          <ArrowRight className="button__icon" />
        </span>
      ) : null}
      {caption ? <small className="button__caption">{caption}</small> : null}
    </>
  );

  if (!href) {
    return (
      <span className={className} aria-disabled="true">
        {content}
      </span>
    );
  }

  return (
    <a
      className={className}
      href={href}
      target={external || isExternal(href) ? "_blank" : undefined}
      rel={external || isExternal(href) ? "noreferrer" : undefined}
    >
      {content}
    </a>
  );
};

export const SiteFrame = ({
  page,
  children,
}: PropsWithChildren<{ page: PageKind }>) => {
  useEffect(() => {
    bootEffects();
  }, []);

  const navLinks = page === "marketing" ? marketingNav : supportNav;
  const homeHref = page === "marketing" ? "#top" : "../";
  const logoMark =
    page === "marketing" ? "./menu-bar-icon.png" : "../menu-bar-icon.png";
  const wordmark = page === "marketing" ? "./banner.png" : "../banner.png";
  const headerDownloadLabel = externalLinks.appStore
    ? "Get SilkScribe"
    : "Download";

  return (
    <div className={`site-shell site-shell--${page}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header" id="top">
        <div className="site-header__island">
          <a
            className="brand-lockup"
            href={homeHref}
            aria-label="SilkScribe home"
          >
            <img
              src={logoMark}
              alt=""
              className="brand-lockup__mark"
              width="48"
              height="48"
              loading="eager"
              decoding="async"
            />
            <img
              src={wordmark}
              alt="SilkScribe"
              className="brand-lockup__wordmark"
              width="202"
              height="84"
              loading="eager"
              decoding="async"
            />
          </a>
          <LinkList links={navLinks} />
          <div className="site-header__actions">
            <ActionButton href={primaryDownloadHref}>
              {headerDownloadLabel}
            </ActionButton>
          </div>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="site-footer" data-reveal>
        <div className="site-footer__intro">
          <span className="eyebrow">SilkScribe</span>
          <h2>Private voice typing for Mac.</h2>
          <p>
            Speak naturally. Get clean text. Stay inside the apps you already
            use.
          </p>
        </div>
        <div className="site-footer__links">
          <a href={externalLinks.github} target="_blank" rel="noreferrer">
            <Github aria-hidden="true" />
            GitHub
          </a>
          <a href={externalLinks.email}>
            <Mail aria-hidden="true" />
            contact@silkscribe.app
          </a>
          <a href={page === "marketing" ? "support/" : "#support-channels"}>
            <BookOpenCheck aria-hidden="true" />
            Support
          </a>
        </div>
        <p className="site-footer__fine-print">
          Private by default. Shortcut-driven. Open source.
        </p>
      </footer>
    </div>
  );
};

export const SectionIntro = ({
  eyebrow,
  title,
  body,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  body: string;
  align?: "left" | "center";
}) => (
  <div className={`section-intro section-intro--${align}`} data-reveal>
    <span className="eyebrow">{eyebrow}</span>
    <h2>{title}</h2>
    <p>{body}</p>
  </div>
);

export const InlinePill = ({ children }: PropsWithChildren) => (
  <span className="inline-pill">
    <Sparkles aria-hidden="true" />
    {children}
  </span>
);

export const SupportJumpLink = ({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) => (
  <a className="jump-card" href={href} data-reveal>
    <span className="jump-card__title">
      {title}
      <ChevronRight aria-hidden="true" />
    </span>
    <span className="jump-card__body">{body}</span>
  </a>
);
