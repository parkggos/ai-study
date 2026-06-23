-- Supabase SQL Editor에서 실행하세요.
create table if not exists public.lotto_draws (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  numbers integer[] not null,
  bonus integer not null check (bonus between 1 and 45),
  draw_type text not null default 'random' check (draw_type in ('random', 'analysis', 'saju', 'auto'))
);

create index if not exists lotto_draws_created_at_idx on public.lotto_draws (created_at desc);

alter table public.lotto_draws enable row level security;

-- 서버(service role)만 직접 접근하고, 클라이언트는 /api/lotto-draws 를 사용합니다.
-- anon 키로 직접 접근하지 않도록 정책은 추가하지 않습니다.
