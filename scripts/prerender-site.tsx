import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarketingPage } from "../site/src/marketing-page";
import { SupportPage } from "../site/src/support-page";

const ROOT = process.cwd();
const DIST = resolve(ROOT, "dist-site");

const siteUrl = process.env.VITE_SITE_URL?.replace(/\/$/, "") ?? "";

const renderDocument = async ({
  filePath,
  app,
  pagePath,
  imagePath,
}: {
  filePath: string;
  app: React.ReactElement;
  pagePath: string;
  imagePath: string;
}) => {
  const source = await readFile(filePath, "utf8");
  const appMarkup = renderToStaticMarkup(app);
  const pageUrl = siteUrl ? `${siteUrl}${pagePath}` : null;
  const ogImageUrl = siteUrl ? `${siteUrl}${imagePath}` : null;

  let html = source.replace(
    '<div id="root"></div>',
    `<div id="root">${appMarkup}</div>`,
  );

  if (pageUrl) {
    html = html.replace(
      "</head>",
      `    <link rel="canonical" href="${pageUrl}" />\n    <meta property="og:url" content="${pageUrl}" />\n</head>`,
    );
  }

  if (ogImageUrl) {
    html = html
      .replace(
        /(<meta property="og:image" content=")([^"]+)(" \/>)/,
        `$1${ogImageUrl}$3`,
      )
      .replace(
        /(<meta name="twitter:image" content=")([^"]+)(" \/>)/,
        `$1${ogImageUrl}$3`,
      );
  }

  await writeFile(filePath, html, "utf8");
};

const run = async () => {
  await renderDocument({
    filePath: resolve(DIST, "index.html"),
    app: <MarketingPage />,
    pagePath: "/",
    imagePath: "/og-image.webp",
  });

  await renderDocument({
    filePath: resolve(DIST, "support/index.html"),
    app: <SupportPage />,
    pagePath: "/support/",
    imagePath: "/og-image.webp",
  });
};

void run();
