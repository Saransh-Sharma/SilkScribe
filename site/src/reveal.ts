const HERO_SELECTOR = "[data-hero]";
const REVEAL_SELECTOR = "[data-reveal]";

export const bootEffects = () => {
  document.documentElement.classList.add("js");

  const heroNodes = Array.from(
    document.querySelectorAll<HTMLElement>(HERO_SELECTOR),
  );
  heroNodes.forEach((node, index) => {
    window.setTimeout(() => {
      node.classList.add("is-visible");
    }, 110 * index);
  });

  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((node) => {
      node.classList.add("is-visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      rootMargin: "0px 0px -10% 0px",
      threshold: 0.12,
    },
  );

  document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((node) => {
    observer.observe(node);
  });
};
