import type { User } from '@supabase/supabase-js';

export type LocalProfile = {
  role: 'owner' | 'customer' | null;
  storeName: string | null;
  storeRegion: string | null;
  storeIndustry: string | null;
};

const NICKNAME_KEY = 'naeil_guest_nickname';
const USER_ID_KEY = 'naeil_guest_user_id';
const PROFILE_KEY = 'naeil_local_profile';

const adjectives = ['다정한', '부지런한', '반짝이는', '든든한', '상냥한', '활기찬', '꼼꼼한', '따뜻한'];
const nouns = ['동네친구', '이웃손님', '골목지기', '단골메이트', '소식꾼', '응원단', '마실러', '생활러'];

const randomItem = (items: string[]) => items[Math.floor(Math.random() * items.length)];

export const getOrCreateGuestNickname = () => {
  const existing = localStorage.getItem(NICKNAME_KEY);
  if (existing) return existing;

  const suffix = Math.floor(1000 + Math.random() * 9000);
  const nickname = `${randomItem(adjectives)} ${randomItem(nouns)} ${suffix}`;
  localStorage.setItem(NICKNAME_KEY, nickname);
  return nickname;
};

export const getOrCreateGuestUserId = () => {
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  localStorage.setItem(USER_ID_KEY, id);
  return id;
};

export const createLocalGuestUser = (): User => {
  const nickname = getOrCreateGuestNickname();

  return {
    id: getOrCreateGuestUserId(),
    app_metadata: {},
    user_metadata: { full_name: nickname },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    email: '',
  } as User;
};

export const getDisplayName = (user?: User | null) => (
  user?.user_metadata?.full_name || getOrCreateGuestNickname()
);

export const readLocalProfile = (): LocalProfile => {
  const fallback: LocalProfile = {
    role: null,
    storeName: null,
    storeRegion: null,
    storeIndustry: null,
  };

  try {
    const rawProfile = localStorage.getItem(PROFILE_KEY);
    return rawProfile ? { ...fallback, ...JSON.parse(rawProfile) } : fallback;
  } catch {
    return fallback;
  }
};

export const writeLocalProfile = (profile: LocalProfile) => {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
};
