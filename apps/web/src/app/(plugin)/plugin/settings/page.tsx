"use client";

import Link from "next/link";

import { useLocale, useT } from "../../../../lib/plugin/i18n/locale";
import { LOCALES } from "../../../../lib/plugin/settings";
import type { Locale } from "../../../../lib/plugin/i18n/dictionary";
import { BlindSpotFooter } from "../components/red-lines";
import { IconCard, IconKey, IconLanguage, IconLink, IconTrash } from "../components/icons";

/**
 * Settings (design v1.5 §0.6 rule 2, §2.6): the Language section —
 * English (default) or Chinese, persisted to cookie + settings record,
 * the whole plugin tree re-renders on change — plus the integrations,
 * billing, and uninstall entries that link to their dedicated pages.
 */

/** The Language section: two options, active one checked, immediate apply. */
function LanguageSection() {
  const t = useT();
  const { locale, setLocale } = useLocale();

  const options: { value: Locale; label: string }[] = [
    { value: "en", label: t.settings.language.en },
    { value: "zh", label: t.settings.language.zh },
  ];

  return (
    <div className="card" data-testid="language-section">
      <div className="intent-head">
        <h3>
          <IconLanguage /> {t.settings.language.title}
        </h3>
        <span className="muted">{t.settings.language.pickerLabel}</span>
      </div>
      <div className="language-options" role="radiogroup" aria-label={t.settings.language.pickerLabel}>
        {LOCALES.map((value) => {
          const option = options.find((o) => o.value === value);
          return (
            <label key={value} className={`language-option ${locale === value ? "is-active" : ""}`}>
              <input
                type="radio"
                name="plugin-locale"
                value={value}
                checked={locale === value}
                onChange={() => setLocale(value)}
                data-testid={`language-${value}`}
              />
              <span>{option?.label ?? value}</span>
            </label>
          );
        })}
      </div>
      <p className="muted">{t.settings.language.body}</p>
    </div>
  );
}

/** Settings entries that link into their dedicated pages. */
export default function SettingsPage() {
  const t = useT();
  const links: { href: string; icon: React.ReactNode; title: string; desc: string }[] = [
    { href: "/plugin/integrations", icon: <IconLink />, title: t.integrations.title, desc: t.settings.links.integrations },
    { href: "/plugin/billing", icon: <IconCard />, title: t.billing.title, desc: t.settings.links.billing },
    { href: "/plugin/uninstall", icon: <IconTrash />, title: t.uninstall.title, desc: t.settings.links.uninstall },
  ];

  return (
    <>
      <h1>{t.settings.title}</h1>
      <p className="muted">{t.settings.intro}</p>

      <LanguageSection />

      <div className="iv-module-grid">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="iv-card iv-module-card iv-link-card">
            <div className="intent-head">
              <span className="iv-module-icon iv-module-library" aria-hidden="true">
                {link.icon}
              </span>
              <h3>{link.title}</h3>
            </div>
            <p className="iv-module-desc">{link.desc}</p>
            <span className="iv-card-cta">{t.settings.openCta} →</span>
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="intent-head">
          <h3>
            <IconKey /> {t.settings.permissions.title}
          </h3>
        </div>
        <p className="muted">{t.settings.permissions.body}</p>
      </div>

      <BlindSpotFooter items={t.blindSpots.settings} />
    </>
  );
}
