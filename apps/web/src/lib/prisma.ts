import { PrismaClient } from "@prisma/client";

// Lazy singleton so dev hot-reload doesn't exhaust database connections.
// Construction must not happen at import time: route modules import this
// file, and tests import routes in environments without DATABASE_URL.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}
