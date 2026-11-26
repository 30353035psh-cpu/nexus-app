import { useEffect, useState, useCallback } from 'react';
import { supabase, type Room, type Message } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { MessageCircle, Loader2, Lock } from 'lucide-react';

type RoomWithMeta = Room & {
  last_message: string | null;
  last_message_at: string | null;
  member_count: number;
};

export default function ChatsTab({ onOpenRoom }: { onOpenRoom: (room: Room) => void }) {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<RoomWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRooms = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: memberRows } = await supabase
      .from('room_members')
      .select('rooms(*)')
      .eq('user_id', user.id);
    const myRooms = (memberRows ?? [])
      .map((row) => row.rooms as unknown as Room)
      .filter(Boolean);

    const enriched: RoomWithMeta[] = await Promise.all(
      myRooms.map(async (room) => {
        const [msgRes, countRes] = await Promise.all([
          supabase
            .from('messages')
            .select('content, image_url, created_at')
            .eq('room_id', room.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('room_members')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', room.id),
        ]);
        const last = msgRes.data as Pick<Message, 'content' | 'image_url' | 'created_at'> | null;
        return {
          ...room,
          last_message: last?.image_url ? '사진' : (last?.content ?? null),
          last_message_at: last?.created_at ?? null,
          member_count: countRes.count ?? 0,
        };
      })
    );

    enriched.sort((a, b) => {
      const ta = a.last_message_at ?? a.created_at;
      const tb = b.last_message_at ?? b.created_at;
      return tb < ta ? -1 : tb > ta ? 1 : 0;
    });
    setRooms(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`my-chats-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          loadRooms();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members' },
        () => {
          loadRooms();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadRooms]);

  return (
    <div className="pb-20">
      <div className="px-5 pt-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">
            <MessageCircle className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p>참여한 채팅방이 없습니다.</p>
            <p className="mt-1 text-xs">아래 '오픈채팅 찾기' 탭에서 방에 참여해 보세요.</p>
          </div>
        ) : (
          <ul>
            {rooms.map((room) => (
              <li key={room.id}>
                <button
                  onClick={() => onOpenRoom(room)}
                  className="w-full flex items-center gap-3.5 px-2 py-3.5 rounded-2xl hover:bg-white active:bg-gray-100 transition text-left"
                >
                  {room.cover_url ? (
                    <img
                      src={room.cover_url}
                      alt=""
                      className="w-14 h-14 rounded-2xl object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-[#3B75E4]/10 flex items-center justify-center shrink-0">
                      <MessageCircle className="w-6 h-6 text-[#3B75E4]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                      {room.password && <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      <span className="truncate">{room.title}</span>
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {room.last_message ?? '아직 메시지가 없습니다'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-gray-400 flex items-center justify-end gap-0.5">
                      <MessageCircle className="w-3 h-3" />
                      {room.member_count}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
