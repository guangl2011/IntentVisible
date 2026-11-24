import { redirect } from "next/navigation";
import { hasDashboardSession } from "../../lib/session";
import { PluginFrame } from "./plugin/components/plugin-frame";

/**
 * Guard + chrome for every plugin page. The plugin is the installation
 * surface inside the Shopify admin, so it renders its own Polaris-style
 * app frame (design v1.4 §2.1) — deliberately NOT the standalone
 * dashboard's topbar, which keeps serving the old dashboard routes.
 */
export default async function PluginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await hasDashboardSession())) {
    redirect("/login");
  }

  return <PluginFrame>{children}</PluginFrame>;
}
