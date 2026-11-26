import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  X,
  Crown,
  Shield,
  ShieldOff,
  UserMinus,
  Loader2,
  Settings,
  Trash2,
  LogOut,
} from 'lucide-react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Room } from '@/lib/supabase';

type Participant = {
  user_id: string;
  role: string;
  profile: {
    nickname: string;
    avatar_url: string | null;
  } | null;
};

export type MemberRole = 'owner' | 'co_owner' | 'member' | 'none';

type ParticipantsModalProps = {
  room: Room;
  myRole: MemberRole;
  onClose: () => void;
  onRoomUpdated: (room: Room) => void;
  onKicked: () => void;
  onRoomDeleted: () => void;
};

export default function ParticipantsModal({
  room,
  myRole,
  onClose,
  onRoomUpdated,
  onKicked,
  onRoomDeleted,
}: ParticipantsModalProps) {
  const { user } = useAuth();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const loadParticipants = useCallback(async () => {
    const memberRes = await supabase
      .from('room_members')
      .select('user_id, role')
      .eq('room_id', room.id);
    if (memberRes.error) {
      console.error('[Participants] 참여자 조회 실패:', memberRes.error.message);
      setLoading(false);
      return;
    }
    const rows = (memberRes.data ?? []) as { user_id: string; role: string }[];
    if (rows.length === 0) {
      setParticipants([]);
      setLoading(false);
      return;
    }
    const ids = rows.map((r) => r.user_id);
    const profileRes = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url')
      .in('id', ids);
    if (profileRes.error) {
      console.error('[Participants] 프로필 조회 실패:', profileRes.error.message);
    }
    const profileMap = new Map(
      ((profileRes.data ?? []) as { id: string; nickname: string; avatar_url: string | null }[]).map(
        (pr) => [pr.id, { nickname: pr.nickname, avatar_url: pr.avatar_url }]
      )
    );
    setParticipants(
      rows.map((r) => ({
        user_id: r.user_id,
        role: r.role,
        profile: profileMap.get(r.user_id) ?? null,
      }))
    );
    setLoading(false);
  }, [room.id]);

  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  useEffect(() => {
    const channel = supabase
      .channel(`participants-${room.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${room.id}`,
        },
        (_payload: RealtimePostgresChangesPayload<Participant>) => {
          loadParticipants();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, loadParticipants]);

  // Kicked users are removed from the member list in realtime — exit immediately.
  // Only judge membership after a successful load, and never while the owner is
  // deleting the room (the member list legitimately empties during deletion).
  const loadFailedRef = useRef(false);
  useEffect(() => {
    loadFailedRef.current = false;
  });
  useEffect(() => {
    if (confirmingDelete || deleting) return;
    if (!loading && !loadFailedRef.current && user && !participants.some((p) => p.user_id === user.id)) {
      onKicked();
    }
  }, [participants, loading, user, onKicked, confirmingDelete, deleting]);

  const leaveRoom = async () => {
    if (myRole === 'owner') {
      setActionError('방장은 방을 나갈 수 없습니다. 방을 삭제해 주세요.');
      return;
    }
    setLeaving(true);
    setActionError(null);
    const { error } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', room.id)
      .eq('user_id', user?.id ?? '');
    setLeaving(false);
    if (error) {
      console.error('[Participants] 방 나가기 실패:', error.message, error.details, error.hint);
      setActionError('방 나가기에 실패했습니다.');
    } else {
      onKicked();
    }
  };

  const deleteRoom = async () => {
    setDeleting(true);
    setActionError(null);
    const { error } = await supabase.from('rooms').delete().eq('id', room.id);
    setDeleting(false);
    if (error) {
      console.error('[Participants] 방 삭제 실패:', error.message, error.details, error.hint);
      setActionError('방 삭제에 실패했습니다.');
      return;
    }
    onRoomDeleted();
  };

  const canManageRoles = myRole === 'owner';
  const canKick = myRole === 'owner' || myRole === 'co_owner';

  const kickAllowed = (target: Participant) => {
    if (target.user_id === user?.id) return false;
    if (myRole === 'owner') return true;
    if (myRole === 'co_owner') {
      if (target.user_id === room.owner_id) return false;
      return target.role !== 'co_owner';
    }
    return false;
  };

  const toggleCoOwner = async (target: Participant) => {
    setBusyId(target.user_id);
    setActionError(null);
    const nextRole = target.role === 'co_owner' ? 'member' : 'co_owner';
    const { error } = await supabase
      .from('room_members')
      .update({ role: nextRole })
      .eq('room_id', room.id)
      .eq('user_id', target.user_id);
    setBusyId(null);
    if (error) {
      console.error('[Participants] 역할 변경 실패:', error.message, error.details, error.hint);
      setActionError('역할 변경에 실패했습니다.');
    }
  };

  const kick = async (target: Participant) => {
    setBusyId(target.user_id);
    setActionError(null);
    const { error } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', room.id)
      .eq('user_id', target.user_id);
    setBusyId(null);
    if (error) {
      console.error('[Participants] 강퇴 실패:', error.message, error.details, error.hint);
      setActionError('내보내기에 실패했습니다.');
    }
  };

  const participantsLabel = (userId: string) => {
    if (userId === room.owner_id) return 'owner';
    return participants.find((p) => p.user_id === userId)?.role ?? 'none';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <h3 className="text-lg font-extrabold text-gray-900">
            참여자 목록 <span className="text-sm font-medium text-gray-400">{participants.length}명</span>
          </h3>
          <div className="flex items-center gap-2">
            {myRole === 'owner' && (
              <>
                <button
                  onClick={() => {
                    setShowRoomSettings((v) => !v);
                    setConfirmingDelete(false);
                  }}
                  className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 active:scale-90 transition"
                  aria-label="방 설정"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 active:scale-90 transition"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showRoomSettings && (
          <div>
            <RoomSettingsForm
              room={room}
              onSaved={(updated) => {
                setShowRoomSettings(false);
                onRoomUpdated(updated);
              }}
              onCancel={() => setShowRoomSettings(false)}
            />
            {confirmingDelete ? (
              <div className="px-6 py-4 bg-red-50 border-b border-red-100">
                <p className="text-sm font-semibold text-red-600 mb-1">정말 이 채팅방을 삭제할까요?</p>
                <p className="text-xs text-red-400 mb-3">방과 모든 메시지가 완전히 삭제되며 참여자 모두의 목록에서 사라집니다. 이 되돌릴 수 없습니다.</p>
                <div className="flex gap-2">
                  <button
                    onClick={deleteRoom}
                    disabled={deleting}
                    className="flex-1 h-10 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                    삭제하기
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="h-10 px-4 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-100 transition"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="w-full h-10 rounded-xl bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100 active:scale-[0.98] transition flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  채팅방 삭제하기
                </button>
              </div>
            )}
          </div>
        )}

        <div className="overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <ul>
              {participants.map((p) => {
                const isOwner = p.user_id === room.owner_id;
                const isCoOwner = !isOwner && p.role === 'co_owner';
                const canKick = kickAllowed(p);
                return (
                  <li
                    key={p.user_id}
                    className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-50 transition"
                  >
                    {p.profile?.avatar_url ? (
                      <img
                        src={p.profile.avatar_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover border border-gray-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#3B75E4]/15 text-[#3B75E4] flex items-center justify-center text-sm font-bold">
                        {(p.profile?.nickname ?? '?').charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-sm truncate">
                        {p.profile?.nickname ?? '알 수 없음'}
                        {p.user_id === user?.id && (
                          <span className="text-gray-400 font-normal"> (나)</span>
                        )}
                      </span>
                      {isOwner && (
                        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                          <Crown className="w-3 h-3" /> 방장
                        </span>
                      )}
                      {isCoOwner && (
                        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold text-sky-600 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">
                          <Shield className="w-3 h-3" /> 부방장
                        </span>
                      )}
                    </div>
                    {canManageRoles && !isOwner && (
                      <button
                        onClick={() => toggleCoOwner(p)}
                        disabled={busyId === p.user_id}
                        className="shrink-0 h-8 px-3 rounded-lg text-xs font-semibold bg-sky-50 text-sky-600 hover:bg-sky-100 active:scale-95 transition disabled:opacity-50 flex items-center gap-1"
                      >
                        {busyId === p.user_id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isCoOwner ? (
                          <ShieldOff className="w-3.5 h-3.5" />
                        ) : (
                          <Shield className="w-3.5 h-3.5" />
                        )}
                        {isCoOwner ? '부방장 해제' : '부방장 임명'}
                      </button>
                    )}
                    {canKick && (
                      <button
                        onClick={() => kick(p)}
                        disabled={busyId === p.user_id || !canKick}
                        className="shrink-0 h-8 px-3 rounded-lg text-xs font-semibold bg-red-50 text-red-500 hover:bg-red-100 active:scale-95 transition disabled:opacity-40 flex items-center gap-1"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                        내보내기
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {actionError && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mt-2">{actionError}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={leaveRoom}
            disabled={leaving || myRole === 'owner'}
            className="w-full h-11 rounded-xl border border-red-200 text-red-500 text-sm font-semibold hover:bg-red-50 active:scale-[0.98] transition disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            방 나가기
          </button>
          {myRole === 'owner' && (
            <p className="text-[10px] text-gray-400 text-center mt-2">방장은 방을 나갈 수 없습니다. 하단 방 설정에서 방을 삭제할 수 있습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function RoomSettingsForm({
  room,
  onSaved,
  onCancel,
}: {
  room: Room;
  onSaved: (room: Room) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(room.title);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(room.cover_url);
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

  const save = async () => {
    if (!title.trim()) {
      setError('방 제목을 입력해 주세요.');
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from('rooms')
      .update({ title: title.trim(), cover_url: coverUrl })
      .eq('id', room.id)
      .select()
      .maybeSingle();
    setSaving(false);
    if (error || !data) {
      console.error('[RoomSettings] 방 정보 수정 실패:', error?.message, error?.details, error?.hint);
      setError('방 정보 수정에 실패했습니다.');
      return;
    }
    onSaved(data as Room);
  };

  return (
    <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">방 제목</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={50}
          className="w-full h-11 px-4 rounded-xl bg-white border border-transparent focus:border-[#3B75E4] outline-none transition text-sm text-gray-900"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">방 커버 (대표 이미지)</label>
        <div className="flex items-center gap-3">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-14 h-14 rounded-xl object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-gray-200" />
          )}
          <label className="inline-flex items-center h-10 px-4 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 cursor-pointer text-sm text-gray-600 transition">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : '이미지 변경'}
            <input type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />
          </label>
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving || uploading}
          className="flex-1 h-10 rounded-xl bg-[#3B75E4] text-white text-sm font-semibold hover:bg-[#3366CC] active:scale-[0.98] transition disabled:opacity-50"
        >
          저장
        </button>
        <button
          onClick={onCancel}
          className="h-10 px-4 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-100 transition"
        >
          취소
        </button>
      </div>
    </div>
  );
}
