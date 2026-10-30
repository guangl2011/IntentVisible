import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

// Route tests run only where a database exists (CI db job). Locally without
// DATABASE_URL this suite is skipped, so `pnpm test` stays green everywhere.
describe.skipIf(!process.env.DATABASE_URL)("database", () => {
  it("applies the schema and accepts queries", async () => {
    const prisma = new PrismaClient();
    const rows = await prisma.$queryRaw`SELECT 1 AS ok`;
    expect(rows).toEqual([{ ok: 1 }]);
    await prisma.$disconnect();
  });
});
