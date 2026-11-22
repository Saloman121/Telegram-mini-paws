# $PAWS Telegram Mini App — Frontend Starter

This repository contains the first development stage: a responsive React/Vite frontend based on the supplied PAWS screenshots.

## Included
- Home screen with tap interaction, points counter, energy display and footprint banner
- Friends/referral screen with Telegram sharing and copy-link actions
- Earn screen with task categories and local preview claiming
- Leaderboard preview
- TON Connect wallet UI
- Footprint map, Buy Token, Levels, Rewards and Withdraw screens
- Telegram WebApp SDK initialization
- Vercel-ready Vite configuration

## Run locally
```bash
npm install
cp .env.example .env
npm run dev
```

## Build
```bash
npm run build
```

## Deploy to Vercel
1. Push this folder to a GitHub repository.
2. Import the repository into Vercel.
3. Framework preset: Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Set the environment variables from `.env.example`.

## Important production status
This is a frontend starter, not a production earning or token application yet. The displayed points and task claims are local preview state and reset on refresh. The wallet connect button uses TonConnect UI, but no wallet payment is sent or verified. Wallet verification, Auto Tap payment, Jetton purchases, real task verification, referrals, withdrawals, leaderboard data and admin operations require the secure Firebase/Cloud Functions backend and TON integration in later stages.

Before mainnet:
- Validate Telegram `initData` on the server.
- Move all balance and reward changes to trusted Cloud Functions.
- Verify TON transactions on-chain with amount, destination, network and replay checks.
- Use Firestore rules that deny client-side writes to balances, roles and payment status.
- Keep signing keys in Secret Manager or a dedicated signing service; never in frontend or Firestore.
- Test contracts and payment flows on TON testnet.
