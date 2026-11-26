/*
# Create storage bucket and policies for 모두톡 media

1. New Bucket
- `modutalk-media` — public-read bucket for profile avatars, room covers, and chat images.

2. Security
- Public SELECT (images load via public URL).
- INSERT allowed only for authenticated users, and only into their own folder path (`avatars/<uid>/...`, `room-images/<uid>/...`, `covers/<uid>/...`).
- Users can delete their own uploaded objects.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('modutalk-media', 'modutalk-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "modutalk_media_public_read" ON storage.objects;
CREATE POLICY "modutalk_media_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'modutalk-media');

DROP POLICY IF EXISTS "modutalk_media_auth_insert" ON storage.objects;
CREATE POLICY "modutalk_media_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'modutalk-media'
  AND (storage.foldername(name))[1] IN ('avatars', 'room-images', 'covers')
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "modutalk_media_owner_delete" ON storage.objects;
CREATE POLICY "modutalk_media_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'modutalk-media' AND owner = auth.uid());
