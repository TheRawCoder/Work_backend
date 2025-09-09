import * as bcrypt from 'bcryptjs';

async function hashPassword() {
  const plainPassword = '123456'; // <- new simple password
  const hashed = await bcrypt.hash(plainPassword, 10); // 10 = salt rounds
  console.log('Hashed password:', hashed);
}

hashPassword();
