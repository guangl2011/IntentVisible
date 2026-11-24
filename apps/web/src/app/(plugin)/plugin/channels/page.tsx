"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../../(dashboard)/pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../../(dashboard)/components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
import { useT } from "../../../../lib/plugin/i18n/locale";
import { loadPlugin } from "../../../../lib/plugin/load";
import { BlindSpotFooter, SimulatedLabel } from "../components/red-lines";
import { usePluginPage } from "../use-plugin-page";

/**
 * Channels (design v1.4 §2.5): Play / Ads channel switches, the partner
 * whitelist, and the per-channel / per-partner visit-order splits the
 * match route measures. Channel enablement is a Phase I display —
 * toggling ships with the channels writer.
 */

function loadMatch(shopId: string) {
  return loadPlugin(() => getPluginClient().match(shopId));
}

export default function ChannelsPage() {
  const t = useT();
  const loader = useCallback((shopId: string) => loadMatch(shopId), []);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <h1>{t.channels.title}</h1>
      <p className="muted">{t.channels.intro}</p>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}

      <div className="card" data-testid="channel-switches">
        <div className="intent-head">
          <h3>{t.channels.switches.title}</h3>
          <SimulatedLabel what={t.simLabels.channelState} />
        </div>
        <p className="muted">{t.channels.switches.stateNote}</p>
        <table className="table">
          <thead>
            <tr>
              <th>{t.channels.switches.headers.channel}</th>
              <th>{t.channels.switches.headers.state}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Play</td>
              <td>
                <span className="badge badge-APPROVED">{t.channels.switches.enabled}</span>
              </td>
            </tr>
            <tr>
              <td>Ads</td>
              <td>
                <span className="badge badge-APPROVED">{t.channels.switches.enabled}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="intent-head">
          <h3>{t.channels.whitelist.title}</h3>
        </div>
        <p className="muted">{t.channels.whitelist.body}</p>
      </div>

      {binding === null || result === null ? (
        <LoadingPanel label={t.simLabels.loadingChannelSplits} />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <>
          <div className="card">
            <div className="intent-head">
              <h3>{t.channels.byChannel}</h3>
            </div>
            <ChannelPartnerTable
              header={t.channels.switches.headers.channel}
              rows={result.data.payload.by_channel.map((row) => ({ key: row.channel, ...row }))}
            />
          </div>
          <div className="card">
            <div className="intent-head">
              <h3>{t.channels.byPartner}</h3>
            </div>
            <ChannelPartnerTable
              header={t.channels.switches.headers.partner}
              rows={result.data.payload.by_partner.map((row) => ({ key: row.partner, ...row }))}
            />
          </div>
        </>
      )}

      <BlindSpotFooter items={t.blindSpots.channels} />
    </>
  );
}

function ChannelPartnerTable({
  header,
  rows,
}: {
  header: string;
  rows: { key: string; visits: number; orders: number }[];
}) {
  const t = useT();
  if (rows.length === 0) {
    return <p className="muted">{t.channels.emptyWindow}</p>;
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>{header}</th>
          <th>{t.channels.headers.visits}</th>
          <th>{t.channels.headers.orders}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>{row.key}</td>
            <td>{row.visits}</td>
            <td>{row.orders}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
