/*
# Fix password verification (trim compare) for 모두톡 secret rooms

1. Function change
- `verify_room_password(room_id, pw)`: both the stored room password and the
  submitted password are compared with `btrim()` (leading/trailing whitespace
  removed), so a password saved with stray whitespace (or typed with one)
  still matches. Logic otherwise unchanged.

2. Security
- Same grants as before: EXECUTE only for `authenticated`, revoked from
  PUBLIC/anon. Room deletion already cascades to messages and room_members via
  existing foreign keys, so no further DDL is needed for the delete feature.
*/

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
      AND btrim(password) = btrim(verify_room_password.pw)
  );
$$;

REVOKE EXECUTE ON FUNCTION verify_room_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION verify_room_password(uuid, text) TO authenticated;
