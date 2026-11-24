import { redirect } from "next/navigation";

/**
 * Root route hands every visitor to the dashboard login. The login page
 * itself forwards already-authenticated sessions to /queue, so a plain
 * server-side redirect here is sufficient.
 */
export default function Home() {
  redirect("/login");
}
