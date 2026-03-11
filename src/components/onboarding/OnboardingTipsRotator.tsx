import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

const CARD_KEYS = [
  "shortcutHabit",
  "focusField",
  "shortBursts",
  "quietSpace",
  "privacy",
  "firstWin",
] as const;

interface OnboardingTipsRotatorProps {
  shortcutLabel: string;
}

const OnboardingTipsRotator: React.FC<OnboardingTipsRotatorProps> = ({
  shortcutLabel,
}) => {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [windowFocused, setWindowFocused] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFocus = () => setWindowFocused(true);
    const handleBlur = () => setWindowFocused(false);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  useEffect(() => {
    if (isHovered || !windowFocused) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % CARD_KEYS.length);
    }, 5600);

    return () => {
      window.clearInterval(timer);
    };
  }, [isHovered, windowFocused]);

  const activeCardKey = CARD_KEYS[activeIndex];

  const cardPoints = useMemo(
    () => [
      t(`onboarding.setup.tips.cards.${activeCardKey}.point1`, {
        shortcut: shortcutLabel,
      }),
      t(`onboarding.setup.tips.cards.${activeCardKey}.point2`, {
        shortcut: shortcutLabel,
      }),
      t(`onboarding.setup.tips.cards.${activeCardKey}.point3`, {
        shortcut: shortcutLabel,
      }),
    ],
    [activeCardKey, shortcutLabel, t],
  );

  const goToIndex = (index: number) => {
    setActiveIndex(index);
  };

  return (
    <section
      className="rounded-[30px] border border-ss-border-default bg-ss-bg-surface/92 p-7 shadow-[var(--ss-shadow-card)]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-ss-brand-secondary/18 bg-ss-brand-secondary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ss-brand-secondary">
            <Sparkles className="h-3.5 w-3.5" />
            {t("onboarding.setup.tipsBadge")}
          </div>
          <div
            key={activeCardKey}
            className="ss-onboarding-card-enter"
          >
            <h3 className="text-xl font-semibold text-ss-text-primary">
              {t(`onboarding.setup.tips.cards.${activeCardKey}.title`, {
                shortcut: shortcutLabel,
              })}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ss-text-tertiary">
              {t(`onboarding.setup.tips.cards.${activeCardKey}.description`, {
                shortcut: shortcutLabel,
              })}
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1 rounded-full border border-ss-border-subtle bg-ss-bg-surface-alt p-1">
          <button
            type="button"
            onClick={() =>
              setActiveIndex(
                (current) =>
                  (current - 1 + CARD_KEYS.length) % CARD_KEYS.length,
              )
            }
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ss-text-tertiary transition-colors hover:bg-ss-bg-elevated hover:text-ss-text-primary"
            aria-label={t("onboarding.setup.previousCard")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              setActiveIndex((current) => (current + 1) % CARD_KEYS.length)
            }
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ss-text-tertiary transition-colors hover:bg-ss-bg-elevated hover:text-ss-text-primary"
            aria-label={t("onboarding.setup.nextCard")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {activeCardKey === "shortcutHabit" && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-ss-brand-highlight/20 bg-ss-brand-highlight/10 px-3 py-1.5 text-xs font-semibold text-ss-brand-highlight">
          <span className="h-2 w-2 rounded-full bg-current" />
          {shortcutLabel}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {cardPoints.map((point, index) => (
          <div
            key={`${activeCardKey}-${index}`}
            className="flex items-start gap-3 rounded-[20px] border border-ss-border-subtle bg-ss-bg-surface-alt px-4 py-3.5"
          >
            <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-ss-brand-highlight" />
            <p className="text-sm leading-relaxed text-ss-text-secondary">
              {point}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-center gap-2">
        {CARD_KEYS.map((cardKey, index) => (
          <button
            key={cardKey}
            type="button"
            onClick={() => goToIndex(index)}
            className={`h-2.5 rounded-full transition-all ${
              index === activeIndex
                ? "w-8 bg-ss-brand-highlight"
                : "w-2.5 bg-ss-border-default hover:bg-ss-border-subtle"
            }`}
            aria-label={t("onboarding.setup.goToCard", { index: index + 1 })}
          />
        ))}
      </div>
    </section>
  );
};

export default OnboardingTipsRotator;
