/*
# Message emoji reactions for 모두톡

1. New Table
- `message_reactions`
  - `id` uuid PK default gen_random_uuid()
  - `message_id` uuid NOT NULL -> messages(id) ON DELETE CASCADE
  - `user_id` uuid NOT NULL DEFAULT auth.uid() -> auth.users(id) ON DELETE CASCADE
  - `emoji` text NOT NULL (the emoji character itself)
  - `created_at` timestamptz default now()
  - UNIQUE (message_id, user_id, emoji): one reaction per user per emoji; tapping
    the same emoji again deletes the row (toggle off).

2. Security
- RLS enabled. All policies scoped TO authenticated.
- SELECT: any authenticated user (reactions must render for everyone; the count
  is shown under bubbles). This matches the already-open messages/rooms model.
- INSERT: only your own reaction row (user_id = auth.uid()).
- DELETE: only your own reaction row (toggle-off).
- Grants: SELECT/INSERT/DELETE to authenticated only.

3. Realtime
- Added to supabase_realtime publication so reaction badges appear live on both
  sides without refresh.

4. Notes
- No destructive operations; existing tables untouched.
*/

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reactions_unique UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;

DROP POLICY IF EXISTS "reactions_select" ON public.message_reactions;
CREATE POLICY "reactions_select" ON public.message_reactions FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "reactions_insert_own" ON public.message_reactions;
CREATE POLICY "reactions_insert_own" ON public.message_reactions FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "reactions_delete_own" ON public.message_reactions;
CREATE POLICY "reactions_delete_own" ON public.message_reactions FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END $$;
