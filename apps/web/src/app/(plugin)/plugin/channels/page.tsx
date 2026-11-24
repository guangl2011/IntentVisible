"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../../(dashboard)/pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../../(dashboard)/components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
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
  const loader = useCallback((shopId: string) => loadMatch(shopId), []);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <h1>Channels</h1>
      <p className="muted">
        Which Intent Match channels may send traffic to your intent pages: Play and Ads channels, the partner
        whitelist, and the market/category scope. Splits below come from measured affiliate visits.
      </p>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}

      <div className="card" data-testid="channel-switches">
        <div className="intent-head">
          <h3>Channel switches</h3>
          <SimulatedLabel what="channel state" />
        </div>
        <p className="muted">
          Channel state is shown read-only in Phase I — enabling and disabling channels ships with the
          channels writer.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Channel</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Play</td>
              <td>
                <span className="badge badge-APPROVED">enabled</span>
              </td>
            </tr>
            <tr>
              <td>Ads</td>
              <td>
                <span className="badge badge-APPROVED">enabled</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="intent-head">
          <h3>Partner whitelist &amp; scope</h3>
        </div>
        <p className="muted">
          Partners may only be added to the whitelist per channel, and market/category scope constrains which
          requests can match. Disclosure copy is force-previewed before any partner goes live (§2.5).
        </p>
      </div>

      {binding === null || result === null ? (
        <LoadingPanel label="channel splits" />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <>
          <div className="card">
            <div className="intent-head">
              <h3>Visits &amp; orders by channel</h3>
            </div>
            <ChannelPartnerTable
              header="Channel"
              rows={result.data.payload.by_channel.map((row) => ({ key: row.channel, ...row }))}
            />
          </div>
          <div className="card">
            <div className="intent-head">
              <h3>Visits &amp; orders by partner</h3>
            </div>
            <ChannelPartnerTable
              header="Partner"
              rows={result.data.payload.by_partner.map((row) => ({ key: row.partner, ...row }))}
            />
          </div>
        </>
      )}

      <BlindSpotFooter
        items={[
          "Channel splits cover affiliate-tagged traffic only — dark-social and organic referrals are invisible in Phase I.",
          "Channel enable/disable is read-only here until the channels writer ships.",
        ]}
      />
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
  if (rows.length === 0) {
    return <p className="muted">No affiliate traffic recorded in this window.</p>;
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>{header}</th>
          <th>Visits</th>
          <th>Orders</th>
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
