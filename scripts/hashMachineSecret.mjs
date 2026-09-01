import crypto from "node:crypto";
import process from "node:process";

const password = process.argv[2] ?? "";

if (!password) {
  console.error("Usage: node scripts/hashMachineSecret.mjs <machine-secret>");
  process.exit(1);
}

const algorithm = "scrypt";
const params = {
  N: 16384,
  keyLength: 64,
  p: 1,
  r: 8,
};
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, params.keyLength, {
  N: params.N,
  p: params.p,
  r: params.r,
});

console.log(
  [
    algorithm,
    params.N,
    params.r,
    params.p,
    salt.toString("hex"),
    hash.toString("hex"),
  ].join("$"),
);
