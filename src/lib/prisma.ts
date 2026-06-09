import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// MariaDB driver adapter — 연결 문자열(DATABASE_URL)을 그대로 전달
const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);

// 개발 중 HMR로 인한 커넥션 누수를 막기 위한 전역 싱글톤
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
