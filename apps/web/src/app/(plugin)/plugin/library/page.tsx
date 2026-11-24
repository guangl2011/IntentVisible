"use client";

import Link from "next/link";

import { useT } from "../../../../lib/plugin/i18n/locale";
import { BlindSpotFooter } from "../components/red-lines";
import { IconGauge, IconMap, IconPackage, IconSearch, IconSpark, IconYield } from "../components/icons";

/**
 * Intent Library hub (design v1.5 §2.1, Build module): the card grid into
 * the research/map/intents/SKU/attribution pages. Cards carry an icon, a
 * one-line description, and the link — the pages own their data.
 */

export default function LibraryPage() {
  const t = useT();
  const cards: { href: string; icon: React.ReactNode; title: string; desc: string }[] = [
    { href: "/plugin/site-research", icon: <IconSearch />, title: t.library.cards.siteResearch.title, desc: t.library.cards.siteResearch.desc },
    { href: "/plugin/marketing-map", icon: <IconMap />, title: t.library.cards.marketingMap.title, desc: t.library.cards.marketingMap.desc },
    { href: "/plugin/intents", icon: <IconSpark />, title: t.library.cards.buyerIntents.title, desc: t.library.cards.buyerIntents.desc },
    { href: "/plugin/products", icon: <IconPackage />, title: t.library.cards.products.title, desc: t.library.cards.products.desc },
    { href: "/plugin/attribution", icon: <IconYield />, title: t.library.cards.attribution.title, desc: t.library.cards.attribution.desc },
  ];

  return (
    <>
      <h1>{t.library.title}</h1>
      <p className="muted">{t.library.intro}</p>
      <div className="iv-module-grid">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="iv-card iv-module-card iv-link-card">
            <div className="intent-head">
              <span className="iv-module-icon iv-module-library" aria-hidden="true">
                {card.icon}
              </span>
              <h3>{card.title}</h3>
            </div>
            <p className="iv-module-desc">{card.desc}</p>
            <span className="iv-card-cta">{t.library.openCta} →</span>
          </Link>
        ))}
        <div className="iv-card iv-module-card">
          <div className="intent-head">
            <span className="iv-module-icon iv-module-audit" aria-hidden="true">
              <IconGauge />
            </span>
            <h3>{t.library.healthTitle}</h3>
          </div>
          <p className="iv-module-desc">{t.library.healthDesc}</p>
          <Link className="btn" href="/plugin/attribution">
            {t.library.healthCta}
          </Link>
        </div>
      </div>
      <BlindSpotFooter items={t.blindSpots.library} />
    </>
  );
}
