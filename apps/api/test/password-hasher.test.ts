import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PasswordHasherService } from "../src/modules/auth/password-hasher.service.js";

describe("password hashing", () => {
  const hasher = new PasswordHasherService();

  it("hashes passwords with Argon2id and never returns the plaintext", async () => {
    const password = "correct horse battery staple 123";
    const passwordHash = await hasher.hashPassword(password);

    assert.match(passwordHash, /^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    assert.equal(passwordHash.includes(password), false);
    assert.equal(await hasher.verifyPassword(password, passwordHash), true);
    assert.equal(await hasher.verifyPassword("wrong password", passwordHash), false);
  });

  it("uses a unique salt for each password hash", async () => {
    const password = "correct horse battery staple 123";
    const firstHash = await hasher.hashPassword(password);
    const secondHash = await hasher.hashPassword(password);

    assert.notEqual(firstHash, secondHash);
  });

  it("does not throw or accept malformed or missing stored hashes", async () => {
    assert.equal(await hasher.verifyPassword("any password", "not-an-argon2-hash"), false);
    assert.equal(await hasher.verifyPassword("any password"), false);
  });
});
