# $PAWS Telegram Mini App

Phase 1 (frontend) is in `frontend/`. Backend (`functions/`), admin panel and Jetton
contract are later phases; the folders are scaffolded.

## Run on Android (GitHub Codespaces or Replit)
```bash
cd frontend
cp .env.example .env      # fill in values
npm install
npm run dev               # opens on port 5173
```
Deploy: push to GitHub, import the repo in Vercel, set Root Directory `frontend`,
Build `npm run build`, Output `dist`, and add the `VITE_*` variables.

## Important
- The UI shows **no balances until the backend answers**. Without the Phase 2+ API
  you will see a "Loading / Retry" screen. That is intentional: no fake data.
- Edit `frontend/public/tonconnect-manifest.json` with your real Vercel URL.
- Never put bot tokens, service-account keys or TON keys in `frontend/`.

## API contract the frontend expects
All requests send `Authorization: tma <initData>`. The server must validate it.
Spec endpoints plus these additions (needed by the UI):
`POST /user/level/upgrade`, `GET /wallet/proof-payload`,
`POST /ton/payment/intent`, `GET /ton/payment/status`.

`GET /user/profile` returns: `points, level, rank_title, referral_code, referral_link,
withdrawable, blocked, mining{energy,max_energy,per_tap,auto_tap_active,auto_claimable},
config{max_level,token_name,token_symbol,jetton_master,buy_price_ton,
auto_tap_fee_ton,verification_fee_ton,min_withdrawal,conversion_rate,
referral_percent,links{community,rewards}}`.
