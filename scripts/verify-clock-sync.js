// Run with: node scripts/verify-clock-sync.js
// Verifies your server time is synchronized for TOTP to work

const now = new Date()
const timestamp = Math.floor(now.getTime() / 1000)

console.log("Current server time:", now.toString())
console.log("Unix timestamp:", timestamp)
console.log("Time-based TOTP counter (30s windows):", Math.floor(timestamp / 30))
console.log("")
console.log("NTP time sync check:")
console.log("- Windows: w32tm /query /status")
console.log("- macOS/Linux: timedatectl status or ntpq -p")
console.log("")
console.log("If your clock is off by more than ~30 seconds, TOTP may fail.")
console.log("Consider enabling NTP sync on your server.")