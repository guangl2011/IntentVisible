import Link from "next/link";

/** Sub-navigation for the Pipeline v2 pages; presentational only. */
export function PipelineNav({ active }: { active: string }) {
  const items: Array<[string, string]> = [
    ["onboarding", "Onboarding"],
    ["gates", "Gates"],
    ["metrics", "Metrics"],
    ["library", "Library"],
  ];
  return (
    <div className="shopify-nav">
      {items.map(([key, label]) =>
        key === active ? (
          <span key={key} className="shopify-nav-active">
            {label}
          </span>
        ) : (
          <Link key={key} href={`/pipeline/${key}`}>
            {label}
          </Link>
        ),
      )}
    </div>
  );
}
