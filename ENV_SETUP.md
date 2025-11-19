# Environment Variables Setup

## Local Development

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your values in `.env`:
   - `VITE_STARS_CONTRACT_ADDRESS`: Already filled (0x78076e59Ac4cb49b5895ca3C3f930618f8aB3B29)
   - `GAME_SIGNER_PRIVATE_KEY`: Get from MetaMask
     - Select your game signer account
     - Click ⋮ → Account details → Export private key
     - Paste it in `.env` (starts with 0x...)
   - `ADMIN_PRIVATE_KEY`: (Optional) Your admin wallet private key for scripts

3. **NEVER commit `.env` to Git** - it's already in `.gitignore`

## Vercel Deployment

In your Vercel dashboard:

1. Go to Project Settings → Environment Variables
2. Add these variables:

### Public Variables (exposed to frontend)
- `VITE_STARS_CONTRACT_ADDRESS` = `0x78076e59Ac4cb49b5895ca3C3f930618f8aB3B29`
- `VITE_CHOPS_CONTRACT_ADDRESS` = (leave empty for now)
- `VITE_CHAIN_ID` = `656476`
- `VITE_RPC_URL` = `https://rpc.open-campus-codex.gelato.digital`

### Secret Variables (server-side only)
- `GAME_SIGNER_PRIVATE_KEY` = Your game signer wallet private key
- `ADMIN_PRIVATE_KEY` = Your admin wallet private key (for automated scripts)

⚠️ **Mark these as "Sensitive"** in Vercel so they're not visible in logs!

## Getting Your Private Keys

### Game Signer Wallet
1. Open MetaMask
2. Select the "Game Signer" account
3. Click the ⋮ menu → Account details
4. Click "Export private key"
5. Enter your MetaMask password
6. Copy the private key (DO NOT SHARE!)

### Admin Wallet (Same process)
1. Select your admin account in MetaMask
2. Follow same steps as above

## Security Notes

- ✅ `.env` is in `.gitignore` - never committed to Git
- ✅ Private keys are only accessed server-side (`server/signer.js`)
- ✅ Frontend only sees contract addresses and RPC URL (safe to expose)
- ⚠️ Never log private keys
- ⚠️ Never send private keys to the frontend
- ⚠️ Use different wallets for game signer and admin
