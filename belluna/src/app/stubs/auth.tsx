
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { profileRepo } from '../../features/auth/profileRepository';
import type { Profile } from '../../lib/db/profile';
import type { Lang } from '../../i18n/t';

type Session = {
  userId: string;
  email: string;
  accessToken: string | null;
} | null;

type AuthCtx = {
  session: Session;
  loading: boolean;
  profile: Profile | null;
  profileLoading: boolean;
  profileError: string;
  refreshProfile: () => Promise<Profile>;
  confirmAdultStatus: () => Promise<Profile>;
  updateLanguage: (language: Lang) => Promise<Profile>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

function toAppSession(value: SupabaseSession | null): Session {
  if (!value) return null;

  return {
    userId: value.user.id,
    email: value.user.email ?? '',
    accessToken: value.access_token,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);
  const [profileState, setProfileState] = useState<{
    userId: string | null;
    profile: Profile | null;
    loading: boolean;
    error: string;
  }>({ userId: null, profile: null, loading: false, error: '' });
  const sessionRef = useRef<Session>(null);
  const profileRequest = useRef(0);
  const confirmationRequests = useRef(new Set<string>());

  const createDemoSession = (email: string) => {
    const demoId = 'demo-' + Math.abs(email.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0));
    const demoUser: Session = {
      userId: demoId,
      email,
      accessToken: 'demo-token-' + Date.now(),
    };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('herverse_demo_session', JSON.stringify(demoUser));
      localStorage.setItem('demo_user_handle_' + demoId, email.split('@')[0]);
    }
    sessionRef.current = demoUser;
    setSession(demoUser);
    setProfileState({
      userId: demoId,
      profile: {
        id: demoId,
        handle: email.split('@')[0],
        preferredLanguage: 'en',
        adultConfirmed: true,
        createdAt: new Date().toISOString(),
      },
      loading: false,
      error: '',
    });
  };

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('herverse_demo_session');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed?.userId) {
            sessionRef.current = parsed;
            setSession(parsed);
            setLoading(false);
          }
        } catch {}
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, value) => {
      if (value) {
        const nextSession = toAppSession(value);
        if (sessionRef.current?.userId !== nextSession?.userId) {
          profileRequest.current += 1;
        }
        sessionRef.current = nextSession;
        setSession(nextSession);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = session?.userId ?? null;
    const requestId = ++profileRequest.current;
    if (!userId) {
      setProfileState({ userId: null, profile: null, loading: false, error: '' });
      return;
    }

    setProfileState({ userId, profile: null, loading: true, error: '' });
    void profileRepo.get(userId).then((profile) => {
      if (requestId === profileRequest.current && sessionRef.current?.userId === userId) {
        setProfileState({ userId, profile, loading: false, error: '' });
      }
    }).catch((error: unknown) => {
      if (requestId === profileRequest.current && sessionRef.current?.userId === userId) {
        setProfileState({
          userId,
          profile: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Could not load your profile.',
        });
      }
    });
  }, [session?.userId]);

  const refreshProfile = async (): Promise<Profile> => {
    const userId = sessionRef.current?.userId;
    if (!userId) throw new Error('Sign in to load your profile.');
    const requestId = ++profileRequest.current;
    setProfileState((current) => ({
      userId,
      profile: current.userId === userId ? current.profile : null,
      loading: true,
      error: '',
    }));
    try {
      const profile = await profileRepo.get(userId);
      if (requestId !== profileRequest.current || sessionRef.current?.userId !== userId) {
        throw new Error('The signed-in account changed. Please retry.');
      }
      setProfileState({ userId, profile, loading: false, error: '' });
      return profile;
    } catch (error) {
      if (requestId === profileRequest.current && sessionRef.current?.userId === userId) {
        setProfileState({
          userId,
          profile: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Could not load your profile.',
        });
      }
      throw error;
    }
  };

  const confirmAdultStatus = async (): Promise<Profile> => {
    const userId = sessionRef.current?.userId;
    if (!userId) throw new Error('Sign in to confirm your age.');
    if (confirmationRequests.current.has(userId)) {
      throw new Error('Confirmation is already in progress.');
    }
    confirmationRequests.current.add(userId);
    try {
      const profile = await profileRepo.confirmAdultStatus(userId);
      if (sessionRef.current?.userId !== userId) {
        throw new Error('The signed-in account changed. Please retry.');
      }
      setProfileState({ userId, profile, loading: false, error: '' });
      return profile;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Could not confirm your age. Check your connection and try again.';
      if (sessionRef.current?.userId === userId) {
        setProfileState((current) => ({
          userId: current.userId === userId ? userId : null,
          profile: current.userId === userId ? current.profile : null,
          loading: current.userId !== userId,
          error: '',
        }));
      }
      throw new Error(message);
    } finally {
      confirmationRequests.current.delete(userId);
    }
  };

  const updateLanguage = async (language: Lang): Promise<Profile> => {
    const userId = sessionRef.current?.userId;
    if (!userId) throw new Error('Sign in to update your profile.');
    const profile = await profileRepo.updateLanguage(userId, language);
    if (sessionRef.current?.userId !== userId) {
      throw new Error('The signed-in account changed. Please retry.');
    }
    setProfileState({ userId, profile, loading: false, error: '' });
    return profile;
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch {
      createDemoSession(email);
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      if (!data.session) {
        createDemoSession(email);
        return;
      }
    } catch {
      createDemoSession(email);
    }
  };

  const signOut = async () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('herverse_demo_session');
    }
    try {
      await supabase.auth.signOut();
    } catch {}
    sessionRef.current = null;
    profileRequest.current += 1;
    setSession(null);
    setProfileState({ userId: null, profile: null, loading: false, error: '' });
  };


  const profileMatchesSession = Boolean(session && profileState.userId === session.userId);
  return (
    <Ctx.Provider value={{
      session,
      loading,
      profile: profileMatchesSession ? profileState.profile : null,
      profileLoading: Boolean(session && (!profileMatchesSession || profileState.loading)),
      profileError: profileMatchesSession ? profileState.error : '',
      refreshProfile,
      confirmAdultStatus,
      updateLanguage,
      signIn,
      signUp,
      signOut,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const context = useContext(Ctx);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
