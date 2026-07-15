// Run with: node scripts/generate-totp-secret.js
// Returns a base32 TOTP secret compatible with Google Authenticator

function generateBase32Secret(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

const secret = generateBase32Secret()

console.log("=====================================")
console.log("Your TOTP Secret (for .env.local):")
console.log("ADMIN_TOTP_SECRET=" + secret)
console.log("=====================================")
console.log("")
console.log("QR Code URL (paste in browser to test):")
console.log("https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=otpauth://totp/RubysRelics?secret=" + secret + "&issuer=RubysRelics")
console.log("")
console.log("Add to your .env.local file and restart the dev server.")