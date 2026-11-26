import { useState } from 'react';
import { supabase, type Room } from '@/lib/supabase';
import { X, Loader2, Lock, Image as ImageIcon } from 'lucide-react';

export default function CreateRoomModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (room: Room) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? 'anon';
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `covers/${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('modutalk-media')
        .upload(path, file, { cacheControl: '3600' });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('modutalk-media').getPublicUrl(path);
      setCoverUrl(data.publicUrl);
    } catch {
      setError('이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const create = async () => {
    if (!title.trim()) {
      setError('방 제목을 입력해 주세요.');
      return;
    }
    if (usePassword && !password.trim()) {
      setError('비밀번호를 입력하거나 체크를 해제해 주세요.');
      return;
    }
    setCreating(true);
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user!.id;

    const { data: room, error: roomErr } = await supabase
      .from('rooms')
      .insert({
        title: title.trim(),
        description: description.trim(),
        cover_url: coverUrl,
        password: usePassword ? password.trim() : null,
        owner_id: userId,
      })
      .select()
      .maybeSingle();
    if (roomErr || !room) {
      setError('방 만들기에 실패했습니다.');
      setCreating(false);
      return;
    }

    const { error: joinErr } = await supabase
      .from('room_members')
      .insert({ room_id: room.id, user_id: userId });
    if (joinErr) {
      setError('방 참여 처리에 실패했습니다.');
      setCreating(false);
      return;
    }
    onCreated(room as Room);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-extrabold text-gray-900">새 오픈채팅방</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">방 커버 (선택)</label>
            <label className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 cursor-pointer text-sm text-gray-600 transition">
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
              {coverUrl ? '이미지 변경' : '이미지 선택'}
              <input type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />
            </label>
            {coverUrl && (
              <img src={coverUrl} alt="" className="mt-3 w-full h-28 object-cover rounded-xl" />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">방 제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 함께 도서 읽는 방"
              maxLength={50}
              className="w-full h-11 px-4 rounded-xl bg-gray-100 border border-transparent focus:bg-white focus:border-[#3B75E4] outline-none transition text-sm text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">설명 (선택)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="어떤 이야기를 나누나요?"
              maxLength={100}
              className="w-full h-11 px-4 rounded-xl bg-gray-100 border border-transparent focus:bg-white focus:border-[#3B75E4] outline-none transition text-sm text-gray-900"
            />
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={usePassword}
                onChange={(e) => setUsePassword(e.target.checked)}
                className="w-4 h-4 accent-[#3B75E4]"
              />
              <Lock className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">비밀번호 설정 (선택)</span>
            </label>
            {usePassword && (
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                maxLength={30}
                className="mt-3 w-full h-10 px-3.5 rounded-lg bg-gray-100 border border-transparent focus:bg-white focus:border-[#3B75E4] outline-none transition text-sm text-gray-900"
              />
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            onClick={create}
            disabled={creating || uploading}
            className="w-full h-12 rounded-xl bg-[#3B75E4] text-white font-semibold hover:bg-[#3366CC] active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            만들기
          </button>
        </div>
      </div>
    </div>
  );
}
