import { getPrisma } from "../../../lib/prisma";
import { CreateAgentForm } from "./create-agent-form";

/**
 * Agents overview: every registered agent with its key prefix (never the key
 * itself), activity state, and intent count — plus the creation form whose
 * raw-key reveal happens exactly once.
 */
export default async function AgentsPage() {
  const prisma = getPrisma();

  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      active: true,
      createdAt: true,
      _count: { select: { intents: true } },
    },
  });

  return (
    <div>
      <h1 className="page-title">Agents</h1>
      <CreateAgentForm />

      {agents.length === 0 ? (
        <p className="muted">No agents registered yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>API key</th>
              <th>Status</th>
              <th>Intents</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id}>
                <td>{agent.name}</td>
                <td>
                  <code>{agent.keyPrefix}…</code>
                </td>
                <td>{agent.active ? "Active" : "Inactive"}</td>
                <td>{agent._count.intents}</td>
                <td>
                  {agent.createdAt.toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
