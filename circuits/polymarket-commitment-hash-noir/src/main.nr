mod poseidon2;

use crate::poseidon2::Poseidon2;

fn main(
    commitment_version : u8,
    signal_id_hash : Field,
    agent_slug_hash : Field,
    market_id_hash : Field,
    direction_bit : u8,
    entry_price_cents : u8,
    predicted_at_unix : u64,
    resolves_at_unix : u64,
    salt : Field,
) -> pub Field {
    assert(direction_bit < 2);
    assert(predicted_at_unix < resolves_at_unix);

    let preimage: [Field; 9] = [
        commitment_version as Field,
        signal_id_hash,
        agent_slug_hash,
        market_id_hash,
        direction_bit as Field,
        entry_price_cents as Field,
        predicted_at_unix as Field,
        resolves_at_unix as Field,
        salt,
    ];

    Poseidon2::hash(preimage, 9)
}
