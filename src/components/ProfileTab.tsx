import { useEffect, useState, useCallback } from 'react';
import { supabase, type Room, type Profile } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AvatarUpload } from '@/components/AvatarUpload';
import { LogOut, MessageCircle, Loader2 } from 'lucide-react';

export default function ProfileTab({ onOpenRoom }: { onOpenRoom: (room: Room) => void }) {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [myRooms, setMyRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  useEffect(() => {
    if (profile) setNickname(profile.nickname);
  }, [profile]);

  const loadMyRooms = useCallback(async () => {
    if (!user) return;
    setLoadingRooms(true);
    const { data } = await supabase
      .from('room_members')
      .select('rooms(*)')
      .eq('user_id', user.id);
    const rooms = (data ?? [])
      .map((row) => row.rooms as unknown as Room)
      .filter(Boolean);
    setMyRooms(rooms);
    setLoadingRooms(false);
  }, [user]);

  useEffect(() => {
    loadMyRooms();
  }, [loadMyRooms]);

  const saveNickname = async () => {
    if (!user || !nickname.trim()) return;
    setSaving(true);
    setSaved(false);
    await supabase.from('profiles').update({ nickname: nickname.trim() }).eq('id', user.id);
    await refreshProfile();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleAvatarUploaded = async (url: string) => {
    if (!user) return;
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
    await refreshProfile();
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const displayName = profile?.nickname ?? '사용자';
  const myMessage = profile as unknown as Profile;

  return (
    <div className="pb-20">
      <div className="bg-white px-6 pt-10 pb-8 flex flex-col items-center border-b border-gray-100">
        <AvatarUpload
          url={profile?.avatar_url ?? null}
          nickname={displayName}
          onUploaded={handleAvatarUploaded}
        />
        <p className="mt-3 text-xs text-gray-400">사진을 눌러 프로필 이미지 변경</p>

        <div className="w-full mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">닉네임</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              className="flex-1 h-11 px-4 rounded-xl bg-gray-100 border border-transparent focus:bg-white focus:border-[#3B75E4] outline-none transition text-gray-900"
            />
            <button
              onClick={saveNickname}
              disabled={saving || !nickname.trim() || nickname === (myMessage?.nickname ?? '')}
              className="h-11 px-4 rounded-xl bg-[#3B75E4] text-white text-sm font-semibold hover:bg-[#3366CC] active:scale-95 transition disabled:opacity-40 flex items-center gap-1.5"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              저장
            </button>
          </div>
          {saved && <p className="text-xs text-green-600 mt-1.5">저장되었습니다.</p>}
        </div>

        <p className="w-full mt-3 text-xs text-gray-400 text-left">{user?.email}</p>
      </div>

      <div className="px-6 pt-6">
        <h3 className="text-sm font-bold text-gray-500 mb-3">내가 참여한 채팅방 ({myRooms.length})</h3>
        {loadingRooms ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : myRooms.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            아직 참여한 채팅방이 없습니다.
          </div>
        ) : (
          <ul className="space-y-1">
            {myRooms.map((room) => (
              <li key={room.id}>
                <button
                  onClick={() => onOpenRoom(room)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition text-left"
                >
                  {room.cover_url ? (
                    <img src={room.cover_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-[#3B75E4]/10 flex items-center justify-center">
                      <MessageCircle className="w-5 h-5 text-[#3B75E4]" />
                    </div>
                  )}
                  <span className="font-medium text-gray-900 text-sm">{room.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={handleSignOut}
          className="w-full mt-10 h-11 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 active:scale-[0.98] transition flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </button>
      </div>
    </div>
  );
}
