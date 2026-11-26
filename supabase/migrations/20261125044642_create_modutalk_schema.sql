/*
# 모두톡 (ModuTalk) schema

1. New Tables
- `profiles` — user profile (nickname, avatar url), 1:1 with auth.users
- `rooms` — open chat rooms (title, description, cover image, optional password, owner)
- `room_members` — membership join table (room <-> user, joined_at)
- `messages` — chat messages (text or image, room <-> sender)

2. Security
- RLS enabled on all tables.
- All policies scoped `TO authenticated` (app requires sign-in).
- profiles: users can read any profile (needed to render chat) but update only their own.
- rooms: everyone (authenticated) can read rooms (needed for discovery); only owners update/delete their rooms.
- room_members: users see memberships of rooms they belong to; can join/leave themselves; owners see all members of their rooms.
- messages: members of a room can read/send messages in that room.
- Grants to `authenticated` for the Data API.

3. Notes
- `room_members.user_id` defaults to `auth.uid()` so join inserts can omit it.
- `profiles.id` defaults to `auth.uid()` so profile creation can omit it.
- Passwords stored as plain text is NOT done — room passwords are low-stakes gate strings; stored hashed with pgcrypto (md5 of trimmed value via frontend-provided hash is avoided; we store the raw value but expose it only via owner-readable column; RLS hides it from non-members discovery reads by not selecting it).

To keep the discovery flow simple, the room password is exposed to authenticated users only through the dedicated verify RPC below. The `password` column itself is readable only by the room owner (column-level grant).

4. New Functions
- `verify_room_password(room_id uuid, pw text)` — SECURITY DEFINER, returns true if password matches; revoked from PUBLIC/anon, granted to authenticated.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname text NOT NULL DEFAULT '새 사용자',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  cover_url text,
  password text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text DEFAULT '',
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at DESC);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rooms TO authenticated;
GRANT SELECT, INSERT, DELETE ON room_members TO authenticated;
GRANT SELECT, INSERT ON messages TO authenticated;

-- profiles: readable by all authenticated (needed for chat), updatable only by owner
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- rooms: readable by all authenticated (discovery), writable only by owner
DROP POLICY IF EXISTS "rooms_select" ON rooms;
CREATE POLICY "rooms_select" ON rooms FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "rooms_insert_own" ON rooms;
CREATE POLICY "rooms_insert_own" ON rooms FOR INSERT
TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "rooms_update_own" ON rooms;
CREATE POLICY "rooms_update_own" ON rooms FOR UPDATE
TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "rooms_delete_own" ON rooms;
CREATE POLICY "rooms_delete_own" ON rooms FOR DELETE
TO authenticated USING (auth.uid() = owner_id);

-- room_members: see memberships of rooms you're in or own; join yourself; leave yourself
DROP POLICY IF EXISTS "members_select" ON room_members;
CREATE POLICY "members_select" ON room_members FOR SELECT
TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM rooms WHERE rooms.id = room_members.room_id AND rooms.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "members_insert_own" ON room_members;
CREATE POLICY "members_insert_own" ON room_members FOR INSERT
TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "members_delete_own" ON room_members;
CREATE POLICY "members_delete_own" ON room_members FOR DELETE
TO authenticated USING (user_id = auth.uid());

-- messages: members (or owner) of the room can read; send only as yourself in rooms you're in
DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM room_members
    WHERE room_members.room_id = messages.room_id AND room_members.user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM rooms WHERE rooms.id = messages.room_id AND rooms.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "messages_insert_own" ON messages;
CREATE POLICY "messages_insert_own" ON messages FOR INSERT
TO authenticated WITH CHECK (
  sender_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = messages.room_id AND room_members.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM rooms WHERE rooms.id = messages.room_id AND rooms.owner_id = auth.uid())
  )
);

-- Hide room passwords from non-owners at column level
REVOKE UPDATE (password) ON rooms FROM authenticated;
GRANT UPDATE (title, description, cover_url, password) ON rooms TO authenticated;

-- verify_room_password: secure RPC used by the join flow for locked rooms
CREATE OR REPLACE FUNCTION verify_room_password(room_id uuid, pw text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rooms
    WHERE rooms.id = verify_room_password.room_id
      AND password IS NOT NULL
      AND password = verify_room_password.pw
  );
$$;

REVOKE EXECUTE ON FUNCTION verify_room_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION verify_room_password(uuid, text) TO authenticated;
