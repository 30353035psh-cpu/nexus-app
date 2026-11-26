/*
# Room member roles (방장/부방장) and moderation access for 모두톡

1. Schema change
- `room_members.role` (text, NOT NULL, default 'member', CHECK in 'member'|'co_owner').
  The room owner is identified by `rooms.owner_id` and does NOT need a special
  member role — the UI shows 👑 방장 for `rooms.owner_id` and 🛡️ 부방장 for
  `room_members.role = 'co_owner'`.

2. New helper functions (SECURITY DEFINER, STABLE — callable only by authenticated)
- `is_room_member(p_room_id uuid)` — is the current user a member of the room.
- `is_room_owner(p_room_id uuid)` — is the current user the room owner.
- `my_room_role(p_room_id uuid)` — returns 'owner' | 'co_owner' | 'member' | 'none'.

3. Security / RLS changes on room_members
- SELECT: opened to all authenticated users (`USING (true)`), matching the
  open-chat model already used for rooms/messages. This is required so every
  participant can render the participant list, and so Realtime DELETE events
  (kicks) reach the kicked user for immediate exit. Membership rows and roles
  are non-sensitive in this app.
- UPDATE: new policy "members_update_role" — only the room owner can change
  member rows (the client only ever writes the `role` column; the table grant
  is column-restricted to `role`).
- DELETE: new policy "members_delete" — a user can remove themselves (leave),
  the owner can remove anyone, and a co-owner can remove only plain 'member'
  rows and never the owner's own row.
- INSERT: unchanged ("members_insert_own", user joins as themselves).

4. Realtime
- room_members was already added to supabase_realtime in the previous
  migration; role updates and deletes now flow to subscribed clients.

5. Notes
- Idempotent statements only; no destructive operations; existing memberships
  are preserved and default to 'member'.
*/

ALTER TABLE public.room_members ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'room_members_role_check'
      AND conrelid = 'public.room_members'::regclass
  ) THEN
    ALTER TABLE public.room_members
      ADD CONSTRAINT room_members_role_check CHECK (role IN ('member', 'co_owner'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION is_room_member(p_room_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM room_members
    WHERE room_id = p_room_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_room_owner(p_room_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rooms
    WHERE rooms.id = p_room_id AND rooms.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION my_room_role(p_room_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM rooms WHERE rooms.id = p_room_id AND rooms.owner_id = auth.uid()) THEN 'owner'
    ELSE COALESCE((SELECT role FROM room_members WHERE room_id = p_room_id AND user_id = auth.uid()), 'none')
  END;
$$;

REVOKE EXECUTE ON FUNCTION is_room_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_room_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION my_room_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_room_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_room_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION my_room_role(uuid) TO authenticated;

GRANT UPDATE (role) ON public.room_members TO authenticated;

DROP POLICY IF EXISTS "members_select" ON public.room_members;
CREATE POLICY "members_select" ON public.room_members FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "members_update_role" ON public.room_members;
CREATE POLICY "members_update_role" ON public.room_members FOR UPDATE
TO authenticated
USING (is_room_owner(room_id))
WITH CHECK (is_room_owner(room_id));

DROP POLICY IF EXISTS "members_delete_own" ON public.room_members;
CREATE POLICY "members_delete" ON public.room_members FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR is_room_owner(room_id)
  OR (
    my_room_role(room_id) = 'co_owner'
    AND role = 'member'
    AND user_id <> (SELECT owner_id FROM rooms WHERE rooms.id = room_members.room_id)
  )
);
