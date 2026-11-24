"use client";

import { useT } from "../../../../lib/plugin/i18n/locale";
import { BlindSpotFooter } from "../components/red-lines";

/**
 * Uninstall & data deletion (design v1.4 §2.6): the "uninstall leaves no
 * residue" promise — the direct answer to the DeepLumen uninstall-
 * residue complaint (dead theme code, canonical loops, "still
 * recoverable" data weeks later). Every string renders from the
 * dictionary (§0.6 rule 2).
 */
export default function UninstallPage() {
  const t = useT();
  return (
    <>
      <h1>{t.uninstall.title}</h1>

      <div className="card notice">
        <strong>{t.uninstall.promiseTitle}</strong>
        <p className="muted">{t.uninstall.promiseBody}</p>
      </div>

      <div className="card">
        <div className="intent-head">
          <h3>{t.uninstall.deletedTitle}</h3>
        </div>
        <ul className="recommendation-list">
          {t.uninstall.deleted.map((item) => (
            <li key={item.heading}>
              <strong>{item.heading}</strong> {item.body}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="intent-head">
          <h3>{t.uninstall.neverHadTitle}</h3>
        </div>
        <p className="muted">{t.uninstall.neverHadBody}</p>
      </div>

      <BlindSpotFooter items={t.blindSpots.uninstall} />
    </>
  );
}
