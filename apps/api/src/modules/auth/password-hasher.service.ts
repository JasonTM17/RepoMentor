import { Injectable } from "@nestjs/common";
import { argon2id, hash, verify } from "argon2";

export const ARGON2ID_OPTIONS = {
  hashLength: 32,
  memoryCost: 19_456,
  parallelism: 1,
  timeCost: 2,
  type: argon2id,
} as const;

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,p=1,t=2$NLqt2dvtAYhh+kftuOFaOw$2/Jz5W0EYr11PrYPAgS6NYvki0ITjbxSmjJlqPqHz44";

@Injectable()
export class PasswordHasherService {
  async hashPassword(password: string): Promise<string> {
    return hash(password, ARGON2ID_OPTIONS);
  }

  async verifyPassword(password: string, passwordHash?: string): Promise<boolean> {
    try {
      return await verify(passwordHash ?? DUMMY_PASSWORD_HASH, password);
    } catch {
      return false;
    }
  }
}
