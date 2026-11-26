import { useState } from 'react';
import { supabase, type Room } from '@/lib/supabase';
import { Loader2, X, Lock } from 'lucide-react';

export default function JoinPasswordModal({
  room,
  onClose,
  onJoined,
}: {
  room: Room;
  onClose: () => void;
  onJoined: (room: Room) => void;
}) {
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password.trim()) {
      setError('비밀번호를 입력해 주세요.');
      return;
    }
    setChecking(true);
    setError(null);

    const { data: ok, error: rpcError } = await supabase.rpc('verify_room_password', {
      room_id: room.id,
      pw: password.trim(),
    });

    if (rpcError || !ok) {
      setChecking(false);
      setError('비밀번호가 올바르지 않습니다.');
      return;
    }

    const { error: joinErr } = await supabase
      .from('room_members')
      .insert({ room_id: room.id });
    setChecking(false);
    if (joinErr) {
      setError('참여에 실패했습니다. 다시 시도해 주세요.');
      return;
    }
    onJoined(room);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xs bg-white rounded-3xl p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-3">
            <Lock className="w-6 h-6 text-amber-500" />
          </div>
          <h3 className="font-bold text-gray-900 mb-1">비밀 채팅방</h3>
          <p className="text-xs text-gray-400 mb-5">
            '{room.title}' 방에 참여하려면
            <br />
            비밀번호를 입력해 주세요.
          </p>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="비밀번호"
            autoFocus
            className="w-full h-11 px-4 rounded-xl bg-gray-100 border border-transparent focus:bg-white focus:border-[#3B75E4] outline-none transition text-sm text-gray-900 text-center"
          />
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          <button
            onClick={submit}
            disabled={checking}
            className="w-full h-11 mt-4 rounded-xl bg-[#3B75E4] text-white font-semibold hover:bg-[#3366CC] active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {checking && <Loader2 className="w-4 h-4 animate-spin" />}
            참여하기
          </button>
        </div>
      </div>
    </div>
  );
}
