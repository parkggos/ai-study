-- 기존 lotto_draws 테이블에 채팅/선정 이유 컬럼 추가
alter table public.lotto_draws add column if not exists chat_log jsonb;
