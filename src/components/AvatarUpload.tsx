import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Camera } from 'lucide-react';

export async function uploadToBucket(
  file: File,
  folder: 'avatars' | 'room-images'
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? 'anon';
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${folder}/${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('modutalk-media')
    .upload(path, file, { upsert: false, cacheControl: '3600' });
  if (error) throw error;

  const { data } = supabase.storage.from('modutalk-media').getPublicUrl(path);
  return data.publicUrl;
}

type AvatarUploadProps = {
  url: string | null;
  nickname: string;
  size?: number;
  onUploaded: (url: string) => void;
};

export function AvatarUpload({ url, nickname, size = 88, onUploaded }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = () => inputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const publicUrl = await uploadToBucket(file, 'avatars');
      onUploaded(publicUrl);
    } catch {
      setError('업로드에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={pick}
        className="relative rounded-full group active:scale-95 transition"
        style={{ width: size, height: size }}
      >
        {url ? (
          <img
            src={url}
            alt={nickname}
            className="w-full h-full rounded-full object-cover border border-gray-200"
          />
        ) : (
          <div
            className="w-full h-full rounded-full bg-[#3B75E4] text-white flex items-center justify-center font-bold"
            style={{ fontSize: size / 2.8 }}
          >
            {nickname.charAt(0) || '?'}
          </div>
        )}
        <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 group-active:opacity-100 flex items-center justify-center transition">
          {busy ? (
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          ) : (
            <Camera className="w-6 h-6 text-white" />
          )}
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
