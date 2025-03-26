import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Anon Key are not defined!');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database table types
export interface Follower {
  id: number;
  address: string;
  follower_address: string;
  created_at: string;
  updated_at: string;
  is_mutual: boolean;
}

export interface FollowStats {
  id: number;
  address: string;
  date: string;
  follower_count: number;
  following_count: number;
  mutual_count: number;
  created_at: string;
}

// Use service role for secure table access
// NOTE: This key should only be used server-side, not client-side!
const SERVICE_KEY = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY;

// Database operations
export const db = {
  followers: {
    // Get followers
    async getFollowers(address: string) {
      const { data, error } = await supabase
        .from('followers')
        .select('*')
        .eq('address', address);
      
      if (error) {
        console.error('Error fetching followers:', error);
        return [];
      }
      return data as Follower[];
    },

    // Get following
    async getFollowing(followerAddress: string) {
      const { data, error } = await supabase
        .from('followers')
        .select('*')
        .eq('follower_address', followerAddress);
      
      if (error) {
        console.error('Error fetching following:', error);
        return [];
      }
      return data as Follower[];
    },

    // Get random profiles from database (for recommendations when user has no connections)
    async getRandomProfiles(limit: number = 10, excludeAddress: string) {
      try {
        // İlk yaklaşım: Veritabanında birincil unique adresler - uygulamaya kaydolmuş profiller
        const { data: primaryAddresses, error: primaryError } = await supabase
          .from('followers')
          .select('address')
          .not('address', 'eq', excludeAddress) // Kullanıcının kendi adresini dışarıda bırak
          .order('id', { ascending: false }) // Aktif kullanıcıları almak için son kayıtları tercih et
          .limit(200);  // Daha geniş bir havuz al
        
        if (primaryError) {
          console.error('Error fetching primary profile addresses:', primaryError);
          return [];
        }
        
        // İkinci yaklaşım: Takipçi adresleri - bunlar da veritabanına kaydediliyor
        const { data: followerAddresses, error: followerError } = await supabase
          .from('followers')
          .select('follower_address')
          .not('follower_address', 'eq', excludeAddress)
          .order('id', { ascending: false })
          .limit(200);
          
        if (followerError) {
          console.error('Error fetching follower addresses:', followerError);
          // Sadece birincil adreslerle devam et
        }
        
        // Her iki veri setini birleştir
        const allAddresses = [
          ...(primaryAddresses || []).map(a => a.address),
          ...(followerAddresses || []).map(a => a.follower_address)
        ];
        
        console.log(`Combined ${allAddresses.length} total addresses for recommendation pool`);
        
        // Adresleri benzersiz hale getir
        const uniqueAddresses = Array.from(new Set(allAddresses));
        
        // Karıştır ve sınırla 
        const shuffled = uniqueAddresses
          .sort(() => 0.5 - Math.random()) // Fisher-Yates shuffle
          .slice(0, limit);
          
        return shuffled.map(address => ({ address }));
      } catch (error) {
        console.error('Error getting random profiles:', error);
        return [];
      }
    },

    // Add new follower - with RLS bypass support
    async addFollower(address: string, followerAddress: string, isMutual: boolean) {
      try {
        // RLS bypass: Add data with Address parameter
        const { data, error } = await supabase
          .from('followers')
          .upsert([
            {
              address,
              follower_address: followerAddress,
              is_mutual: isMutual,
              updated_at: new Date().toISOString()
            },
          ], {
            onConflict: 'address,follower_address' // Update on conflict
          });
        
        if (error) {
          // Log error details
          console.error('Error adding follower:', error);
          console.debug('Error details:', {
            address,
            followerAddress,
            isMutual,
            error
          });
          throw error;
        }
        
        // On successful addition, return the record
        return {
          address,
          follower_address: followerAddress,
          is_mutual: isMutual
        } as Follower;
      } catch (error) {
        console.error('Unexpected error adding follower:', error);
        // Return null on error, for error handling on UI side
        return null;
      }
    },

    // Remove follower - with RLS bypass support
    async removeFollower(address: string, followerAddress: string) {
      try {
        const { error } = await supabase
          .from('followers')
          .delete()
          .match({ 
            address, 
            follower_address: followerAddress 
          });
        
        if (error) {
          console.error('Error removing follower:', error);
          throw error;
        }
        
        return true;
      } catch (error) {
        console.error('Unexpected error removing follower:', error);
        return false;
      }
    },
  },

  stats: {
    // Save daily statistics - with RLS bypass support
    async saveStats(stats: Omit<FollowStats, 'id' | 'created_at'>) {
      try {
        const { data, error } = await supabase
          .from('follow_stats')
          .upsert([stats], {
            onConflict: 'address,date' // Update on conflict
          });
        
        if (error) {
          console.error('Error saving statistics:', error);
          console.debug('Error details:', {
            stats,
            error
          });
          throw error;
        }
        
        return {
          ...stats,
          id: 0, // ID is unknown but required for interface
          created_at: new Date().toISOString()
        } as FollowStats;
      } catch (error) {
        console.error('Unexpected error saving statistics:', error);
        return null;
      }
    },

    // Get statistics for a specific address
    async getStats(address: string, days: number = 60) {
      try {
        const { data, error } = await supabase
          .from('follow_stats')
          .select('*')
          .eq('address', address)
          .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
          .order('date', { ascending: true });
        
        if (error) {
          console.error('Error retrieving statistics:', error);
          return [];
        }
        
        return data as FollowStats[];
      } catch (error) {
        console.error('Unexpected error retrieving statistics:', error);
        return [];
      }
    },
  },
};

// These functions appear to be incomplete and cause linting errors
// Removing them as they seem to be duplicating functionality already in db.followers 