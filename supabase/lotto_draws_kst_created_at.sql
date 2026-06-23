-- 기존 timestamptz(UTC) 컬럼을 한국 시간 벽시계(timestamp)로 변환
alter table public.lotto_draws
  alter column created_at type timestamp without time zone
  using (created_at at time zone 'Asia/Seoul');

alter table public.lotto_draws
  alter column created_at set default (timezone('Asia/Seoul', now()));
