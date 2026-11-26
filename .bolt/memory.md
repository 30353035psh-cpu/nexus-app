# Project memory

## Product intent & audience

- Real-time chat application with room-based messaging and image uploads.
- Korean-language product (UI labels, role names in Korean: 방장/부방장).
- Room creators and designated moderators manage participants.

## Brand personality & voice

- Production-quality, polished UI; explicitly "beautiful, not cookie cutter."
- Existing dark theme must be preserved across all new features.
- User communicates in Korean; code/UI labels in Korean where user-facing.

## Visual design & UX direction

- Dark UI aesthetic already established; new components must match it.
- Tailwind CSS + Lucide React icons only; no extra UI/icon packages.
- Path alias `@/` → `src/` for all project module imports; avoid deep relative paths.
- React hooks expected; JSX syntax.
- Participant list modal: top-right [👥 참여자] button opens list with avatars + nicknames.
- Role badges next to nicknames: 👑 방장 (creator), 🛡️ 부방장 (designated).
- Permission-gated UI actions: host sees appoint/dismiss vice-host, kick, edit room title & cover; vice-host sees only kick (not on host/other vice-hosts); members see none.

## Decisions, constraints & rationale

- Supabase used for auth and database; `persistSession: true` for auto-login — logout only via explicit button (profile/settings tab).
- Room roles enforced at DB level via RLS/security rules, not just UI: vice-host cannot edit room info or kick hosts/other vice-hosts; DB rejects such attempts.
- `room_members` table holds role field linked to host/vice-host/member logic.
- Kicked users are removed from member list in real-time and auto-exited from the room immediately.
- Existing login/signup, real-time messaging, and image-upload logic must never be broken when adding features.
- Room title edits reflect immediately in chat header via update callback.

## Open questions & assumptions

- Exact `room_members` schema/migration details inferred; column names not fully confirmed in this turn.
- Room cover image storage (Supabase Storage bucket name) assumed but not explicitly named here.
- Whether vice-host can see the room settings menu at all (UI hidden vs. read-only) inferred as fully hidden for non-hosts.