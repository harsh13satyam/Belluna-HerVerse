import { supabase } from '../../lib/supabase';
import type { ProfileRepo } from '../../lib/db/profile';
import type { Lang } from '../../i18n/t';

async function verifiedUserId(expectedUserId: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Please sign in to access your profile.');
  if (data.user.id !== expectedUserId) {
    throw new Error('The signed-in account changed. Please reload your profile.');
  }
  return data.user.id;
}

function mapProfile(row: {
  id: string;
  handle: string;
  preferred_language: Lang;
  adult_confirmed: boolean;
  created_at: string;
}) {
  return {
    id: row.id,
    handle: row.handle,
    preferredLanguage: row.preferred_language,
    adultConfirmed: row.adult_confirmed,
    createdAt: row.created_at,
  };
}

export const profileRepo: ProfileRepo = {
  async get(userId) {
    if (userId.startsWith('demo-')) {
      const handle = (typeof localStorage !== 'undefined' && localStorage.getItem('demo_user_handle_' + userId)) || 'Member';
      const lang = ((typeof localStorage !== 'undefined' && localStorage.getItem('demo_user_lang_' + userId)) as Lang) || 'en';
      return {
        id: userId,
        handle,
        preferredLanguage: lang,
        adultConfirmed: true,
        createdAt: new Date().toISOString(),
      };
    }
    const ownerId = await verifiedUserId(userId);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, handle, preferred_language, adult_confirmed, created_at')
      .eq('id', ownerId)
      .single();
    if (error) throw error;
    await verifiedUserId(ownerId);
    if (!data || data.id !== ownerId) throw new Error('Your profile could not be confirmed.');
    return mapProfile(data);
  },

  async confirmAdultStatus(userId) {
    if (userId.startsWith('demo-')) {
      return this.get(userId);
    }
    const ownerId = await verifiedUserId(userId);
    const { error } = await supabase.rpc('confirm_adult_status');
    if (error) throw error;
    await verifiedUserId(ownerId);
    const profile = await this.get(ownerId);
    if (!profile.adultConfirmed) {
      throw new Error('Your age confirmation could not be verified. Please try again.');
    }
    return profile;
  },

  async updateLanguage(userId, language) {
    if (language !== 'en' && language !== 'hi') {
      throw new Error('Choose English or Hindi.');
    }
    if (userId.startsWith('demo-')) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('demo_user_lang_' + userId, language);
      }
      return this.get(userId);
    }
    const ownerId = await verifiedUserId(userId);
    const { data, error } = await supabase
      .from('profiles')
      .update({ preferred_language: language })
      .eq('id', ownerId)
      .select('id, handle, preferred_language, adult_confirmed, created_at')
      .single();
    if (error) throw error;
    await verifiedUserId(ownerId);
    if (!data || data.id !== ownerId) throw new Error('Your profile language could not be confirmed.');
    return mapProfile(data);
  },
};

