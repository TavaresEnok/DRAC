const crypto = require('node:crypto');
const readline = require('node:readline/promises');

async function main() {
  const password = process.argv[2] || (await promptPassword());
  if (!password || password.length < 10) {
    throw new Error('A senha precisa ter pelo menos 10 caracteres.');
  }

  const iterations = Number(process.env.DRAC_CENTRAL_HASH_ITERATIONS || 210000);
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  console.log(`pbkdf2_sha256$${iterations}$${salt}$${hash}`);
}

async function promptPassword() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question('Senha administrativa: ');
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
