import { redirect } from "next/navigation";

/**
 * Root route fallback: hand visitors to the dashboard login. The middleware
 * rewrites `/` to /login (single hop, so the login Server Action works
 * behind the redirect-following hosted proxy); this server-side redirect
 * only runs for requests that bypass the middleware. The login page itself
 * forwards already-authenticated sessions to /queue.
 */
export default function Home() {
  redirect("/login");
}
