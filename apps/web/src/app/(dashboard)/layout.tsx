import Link from "next/link";
import { redirect } from "next/navigation";
import { hasDashboardSession } from "../../lib/session";
import { signOut } from "../login/actions";

/**
 * Guard for every dashboard page: without a valid session cookie the request
 * is redirected to /login before any dashboard data is queried.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await hasDashboardSession())) {
    redirect("/login");
  }

  return (
    <div className="shell">
      <nav className="topbar">
        <Link href="/queue" className="brand">
          IntentVisible
        </Link>
        <div className="nav-links">
          <Link href="/queue">Queue</Link>
          <Link href="/history">History</Link>
          <Link href="/agents">Agents</Link>
          <Link href="/shopify">Shopify</Link>
        </div>
        <form action={signOut}>
          <button type="submit" className="linklike">
            Sign out
          </button>
        </form>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
