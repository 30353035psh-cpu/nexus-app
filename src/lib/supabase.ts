import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'placeholder-anon-key',
  {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export type Profile = {
  id: string;
  nickname: string;
  avatar_url: string | null;
  created_at: string;
};

export type Room = {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  password: string | null;
  owner_id: string;
  created_at: string;
};

export type Message = {
  id: string;
  room_id: string;
  sender_id: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
};
