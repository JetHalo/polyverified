# Polymarket Commit-Reveal Circuit Intake

## Circuit Language

- Language: `Noir`
- Proof system target: `UltraHonk`
- Verification mode: `zkverifyjs-non-aggregation`

## Goal

Prove that the revealed signal payload matches the payload originally committed for a Polymarket premium signal.

This circuit does **not** prove:

- that the prediction was profitable
- that the market data was correct
- that the server published the commitment at a globally trusted wall-clock timestamp

## Public Inputs

- `commitment: Field`
- `signal_id_hash: Field`
- `commitment_version: Field`

## Private Inputs

- `agent_slug_hash: Field`
- `market_id_hash: Field`
- `direction_bit: Field`
- `entry_price_cents: Field`
- `predicted_at_unix: Field`
- `resolves_at_unix: Field`
- `salt: Field`

## Constraints

1. `direction_bit` must be `0` or `1`
2. `predicted_at_unix < resolves_at_unix`
3. `entry_price_cents` must be in the application-approved range before proving
4. `signal_id_hash` in witness must match public `signal_id_hash`
5. `commitment_version` in witness must match public `commitment_version`
6. `Poseidon(commitment_version, signal_id_hash, agent_slug_hash, market_id_hash, direction_bit, entry_price_cents, predicted_at_unix, resolves_at_unix, salt) == commitment`
