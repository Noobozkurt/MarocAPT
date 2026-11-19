// Print the current 6-digit 2FA code for a base32 TOTP secret (dev helper): npm run totp -- JBSWY3DPEHPK3PXP
import { totp } from '../src/lib/totp';
const secret = process.argv[2];
if (!secret) {
  console.error('Usage: npm run totp -- <BASE32_SECRET>');
  process.exit(1);
}
console.log(totp(secret));
