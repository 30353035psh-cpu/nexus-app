/*
# Fix message loading, open message access, and enable realtime for 모두톡

1. Schema change
- Add a foreign key `messages.sender_id -> profiles(id)` so the client can join
  sender profile data (nickname, avatar) with its message queries. This was
  previously missing: messages.sender_id only referenced auth.users(id), so the
  PostgREST embed `messages(...).profiles(...)` failed with a relationship error
  and every message fetch returned an error.

2. Security changes (user-requested: open chat — all signed-in users can read
  and post messages in every room)
- messages_select: now `USING (true)` for authenticated (was member/owner-only).
- messages_insert_own: now only requires `sender_id = auth.uid()` (was
  member/owner-only). Users can still only send as themselves.
- No other policies changed. rooms, profiles, room_members policies untouched.

3. Realtime
- Add `public.messages` and `public.room_members` to the `supabase_realtime`
  publication so INSERT events reach subscribed clients. The publication
  previously had no tables, so realtime subscriptions never received events.

4. Notes
- All statements are idempotent (DO block checks for existing FK / publication
  membership, DROP POLICY IF EXISTS before CREATE).
- No destructive operations; existing message data is preserved.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_sender_profile_fkey'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_sender_profile_fkey
      FOREIGN KEY (sender_id) REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DROP POLICY IF EXISTS "messages_select" ON public.messages;
CREATE POLICY "messages_select" ON public.messages FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "messages_insert_own" ON public.messages;
CREATE POLICY "messages_insert_own" ON public.messages FOR INSERT
TO authenticated
WITH CHECK (sender_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'room_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
  END IF;
END $$;
