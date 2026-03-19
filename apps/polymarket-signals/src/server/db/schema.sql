create table if not exists agents (
  slug text primary key,
  market_type text not null,
  display_name text not null,
  active_since timestamptz not null default now()
);

create table if not exists markets (
  market_id text primary key,
  market_type text not null,
  opens_at timestamptz not null,
  resolves_at timestamptz not null,
  up_price_cents integer not null,
  down_price_cents integer not null,
  up_ask_price_cents integer,
  down_ask_price_cents integer,
  spread_bps integer not null,
  liquidity_usd numeric(18,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists market_observations (
  market_id text not null references markets(market_id),
  market_type text not null,
  observed_at timestamptz not null default now(),
  up_price_cents integer not null,
  down_price_cents integer not null,
  up_ask_price_cents integer,
  down_ask_price_cents integer,
  spread_bps integer not null,
  liquidity_usd numeric(18,2) not null,
  primary key (market_id, observed_at)
);

create index if not exists market_observations_market_idx on market_observations(market_id, observed_at);

create table if not exists signals (
  signal_id text primary key,
  agent_slug text not null references agents(slug),
  market_id text not null references markets(market_id),
  market_type text not null,
  direction text not null,
  entry_price_cents integer not null,
  confidence numeric(5,4) not null default 0,
  explanation text not null default '',
  predicted_at timestamptz not null,
  resolves_at timestamptz not null,
  commitment text not null,
  commitment_hash_mode text not null default 'poseidon2-field-v1',
  commitment_status text not null,
  is_premium boolean not null default true,
  created_at timestamptz not null default now()
);

alter table signals add column if not exists confidence numeric(5,4) not null default 0;
alter table signals add column if not exists explanation text not null default '';
alter table signals add column if not exists commitment_hash_mode text not null default 'poseidon2-field-v1';
alter table signals alter column commitment_hash_mode set default 'poseidon2-field-v1';
alter table markets add column if not exists up_ask_price_cents integer;
alter table markets add column if not exists down_ask_price_cents integer;
alter table market_observations add column if not exists up_ask_price_cents integer;
alter table market_observations add column if not exists down_ask_price_cents integer;

create unique index if not exists signals_agent_market_unique on signals(agent_slug, market_id);

create table if not exists signal_commitment_witnesses (
  signal_id text primary key references signals(signal_id),
  signal_id_hash text not null,
  agent_slug_hash text not null,
  market_id_hash text not null,
  commitment_version integer not null,
  salt text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists signal_anchors (
  signal_id text primary key references signals(signal_id),
  commitment text not null,
  commitment_hash_mode text not null,
  anchor_status text not null default 'pending',
  anchor_chain_id integer not null,
  anchor_network text not null,
  anchor_contract_address text,
  anchor_tx_hash text,
  anchor_explorer_url text,
  anchored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists signal_reveals (
  signal_id text primary key references signals(signal_id),
  revealed_at timestamptz not null,
  outcome text not null,
  simulated_pnl_cents integer,
  proof_state text not null default 'committed',
  proof_id text,
  zk_tx_hash text,
  zkverify_url text
);

create table if not exists purchases (
  purchase_id text primary key,
  wallet_address text not null,
  signal_id text not null references signals(signal_id),
  payment_network text not null,
  payment_token text not null,
  payment_amount text not null,
  payment_status text not null,
  payment_scheme text not null default 'x402-exact-evm',
  payment_tx_hash text,
  payment_payer text,
  treasury_address text not null,
  created_at timestamptz not null default now()
);

alter table purchases add column if not exists payment_scheme text not null default 'x402-exact-evm';
alter table purchases add column if not exists payment_tx_hash text;
alter table purchases add column if not exists payment_payer text;
create unique index if not exists purchases_payment_tx_hash_unique on purchases(payment_tx_hash) where payment_tx_hash is not null;

create table if not exists access_grants (
  grant_id text primary key,
  wallet_address text not null,
  signal_id text not null references signals(signal_id),
  purchase_id text not null references purchases(purchase_id),
  created_at timestamptz not null default now(),
  unique(wallet_address, signal_id)
);

create table if not exists zk_proofs (
  proof_id text primary key,
  signal_id text not null references signals(signal_id),
  proof_system text not null,
  verification_mode text not null,
  statement text,
  proof_status text not null,
  proof_reference text,
  tx_hash text,
  zkverify_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_events (
  event_id text primary key,
  signal_id text,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists wallet_auth_nonces (
  wallet_address text primary key,
  nonce text not null,
  chain_id integer not null,
  message text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists wallet_sessions (
  session_id text primary key,
  wallet_address text not null,
  chain_id integer not null,
  signature text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists wallet_sessions_wallet_idx on wallet_sessions(lower(wallet_address));
create index if not exists wallet_sessions_expires_idx on wallet_sessions(expires_at);

create table if not exists user_activity_events (
  event_id text primary key,
  wallet_address text,
  signal_id text references signals(signal_id),
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_activity_wallet_idx on user_activity_events(lower(wallet_address));
create index if not exists user_activity_signal_idx on user_activity_events(signal_id);
