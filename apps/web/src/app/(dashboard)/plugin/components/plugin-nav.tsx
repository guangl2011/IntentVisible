import Link from "next/link";

/** Sub-navigation for the plugin Phase I pages (design v1.4 §2.1); presentational only. */
export function PluginNav({ active }: { active: string }) {
  const items: Array<[string, string]> = [
    ["", "Overview"],
    ["intents", "Buyer Intents"],
    ["attribution", "Attribution"],
    ["audit", "Intent Audit"],
    ["match", "Intent Match"],
    ["commission", "Commission"],
    ["integrations", "Integrations"],
  ];
  return (
    <div className="plugin-nav">
      {items.map(([key, label]) =>
        key === active ? (
          <span key={key || "overview"} className="plugin-nav-active">
            {label}
          </span>
        ) : (
          <Link key={key || "overview"} href={`/plugin${key === "" ? "" : `/${key}`}`}>
            {label}
          </Link>
        ),
      )}
    </div>
  );
}
