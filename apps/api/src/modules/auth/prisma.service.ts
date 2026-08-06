import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private client: PrismaClient | undefined;

  get user(): PrismaClient["user"] {
    return this.getClient().user;
  }

  get session(): PrismaClient["session"] {
    return this.getClient().session;
  }

  get review(): PrismaClient["review"] {
    return this.getClient().review;
  }

  get reviewResult(): PrismaClient["reviewResult"] {
    return this.getClient().reviewResult;
  }

  async transaction<T>(callback: (client: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.getClient().$transaction(callback);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.$disconnect();
    }
  }

  private getClient(): PrismaClient {
    this.client ??= new PrismaClient();
    return this.client;
  }
}
