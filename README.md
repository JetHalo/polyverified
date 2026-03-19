# zk x402

Polymarket `x402 + zkVerify` premium prediction feed.

## Current Product

This repository is now centered on the Polymarket signals product:

- premium directional signals
- `BTC / ETH` hourly markets
- `Gold / Silver` daily markets
- `x402` for premium unlocks
- `zkVerify` for commit / reveal verification

The active frontend app is:

- `apps/polymarket-signals`

## Kept Paths

- `apps/polymarket-signals`
- `docs/polymarket_x402_zkverify_prediction_feed_prd.md`
- `docs/polymarket_x402_zkverify_prediction_feed_prd_zh.md`
- `docs/plans/2026-03-12-polymarket-signals-nextjs-migration.md`
- `docs/plans/2026-03-13-polymarket-signals-implementation-plan.md`
- `docs/plans/2026-03-13-polymarket-signals-implementation-plan_zh.md`

## Quick Start

Install dependencies:

```bash
npm install
```

Start the product locally:

```bash
npm run dev
```

This now launches:

```bash
npm run dev -w @x402/polymarket-signals
```

## Notes

- The old off-chain AI analysis prototype and unrelated legacy docs have been removed.
- Frontend work should continue in `apps/polymarket-signals`.
- The next implementation steps are defined in the files under `docs/plans/`.
