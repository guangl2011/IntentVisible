import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { hasDashboardSession } from "../../lib/session";
import { LOCALE_COOKIE, localeFromCookie } from "../../lib/plugin/settings";
import { PluginFrame } from "./plugin/components/plugin-frame";

/**
 * Guard + chrome for every plugin page (design v1.5 §0.6). The plugin is
 * the installation surface inside the Shopify admin, so it renders its
 * own full-width frame with a top navigation bar — deliberately NOT a
 * left rail, which does not fit the admin embed. The locale cookie is
 * read here (server) so the first paint already renders the chosen
 * language before any client state loads.
 */
export default async function PluginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await hasDashboardSession())) {
    redirect("/login");
  }

  const initialLocale = localeFromCookie((await cookies()).get(LOCALE_COOKIE)?.value);

  return <PluginFrame initialLocale={initialLocale}>{children}</PluginFrame>;
}
