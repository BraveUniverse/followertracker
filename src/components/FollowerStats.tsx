'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { LSP26FollowerSystem } from '@/lib/lsp26';
import { LSP3ProfileManager, LSP3ProfileData } from '@/lib/lsp3';
import { db, FollowStats } from '@/lib/supabase';
import { provider } from '@/lib/up-provider';
import { toast } from 'react-hot-toast';
import Image from 'next/image';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, Area, 
  AreaChart, ComposedChart, Bar
} from 'recharts';

// Generic fallback image component to handle image loading errors
const ImageWithFallback = ({ src, alt, ...props }: any) => {
  const [error, setError] = useState(false);

  return error ? (
    <div className={`flex items-center justify-center bg-gray-100 rounded-full ${props.className}`}>
      <span className="text-xs text-gray-500">No Image</span>
    </div>
  ) : (
    <Image
      src={src}
      alt={alt}
      {...props}
      onError={() => setError(true)}
    />
  );
};

interface FollowerStatsData {
  followerCount: number;
  followingCount: number;
  mutualCount: number;
  dailyChange: number;
  followRatio: number;
}

export default function FollowerStats() {
  const { accounts, isConnected } = useWallet();
  const [stats, setStats] = useState<FollowerStatsData>({
    followerCount: 0,
    followingCount: 0,
    mutualCount: 0,
    dailyChange: 0,
    followRatio: 0
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<LSP3ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  
  // Tarihsel veriler için state
  const [historicalStats, setHistoricalStats] = useState<FollowStats[]>([]);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalError, setHistoricalError] = useState<string | null>(null);

  // Create follower system instance only once
  const followerSystem = useMemo(() => new LSP26FollowerSystem(), []);
  const profileManager = useMemo(() => new LSP3ProfileManager(), []);

  // Fetch current user profile
  const fetchUserProfile = useCallback(async () => {
    if (!isConnected || !accounts[0]) return;
    
    try {
      setProfileLoading(true);
      const profile = await profileManager.getProfileData(accounts[0]);
      setUserProfile(profile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setProfileLoading(false);
    }
  }, [accounts, isConnected, profileManager]);

  // Tarihsel istatistikleri yükle
  const fetchHistoricalStats = useCallback(async () => {
    if (!isConnected || !accounts[0]) return;
    
    try {
      setHistoricalLoading(true);
      setHistoricalError(null);
      
      // Son 30 günlük istatistikleri al
      const stats = await db.stats.getStats(accounts[0], 30);
      
      if (stats.length === 0) {
        setHistoricalError('No historical data available yet. Statistics are collected daily as you use the app.');
      } else {
        // Tarihe göre sırala (eskiden yeniye)
        const sortedStats = [...stats].sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        setHistoricalStats(sortedStats);
      }
    } catch (error: any) {
      console.error('Error fetching historical stats:', error);
      setHistoricalError(`Failed to load historical data: ${error.message || 'Unknown error'}`);
    } finally {
      setHistoricalLoading(false);
    }
  }, [accounts, isConnected]);

  // Grafik verilerini formatlama
  const formatChartData = (stats: FollowStats[]) => {
    return stats.map(stat => ({
      date: new Date(stat.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }),
      followers: stat.follower_count,
      following: stat.following_count,
      mutual: stat.mutual_count,
      nonMutual: stat.follower_count - stat.mutual_count,
      followRatio: stat.following_count > 0 ? 
        parseFloat((stat.follower_count / stat.following_count).toFixed(2)) : 0
    }));
  };

  // Function to fetch statistics directly from blockchain
  const fetchBlockchainStats = useCallback(async () => {
    if (!isConnected || !accounts[0]) return;

    try {
      setLoading(true);
      setError(null);
      
      toast.loading('Loading blockchain data...', { id: 'stats-toast' });
      
      // Optimizasyon: Tüm verileri tek seferde getir
      const { allFollowers, allFollowing, mutualCount } = await followerSystem.getMutualConnections(accounts[0]);
      
      const followerCount = allFollowers.length;
      const followingCount = allFollowing.length;

      console.log(`Data from blockchain: Followers: ${followerCount}, Following: ${followingCount}, Mutual: ${mutualCount}`);

      // Follow ratio
      const followRatio = followingCount > 0 ? (followerCount / followingCount) : 0;

      // Calculate daily change from database
      const dailyChange = await fetchDailyChange(accounts[0], followerCount);

      // Save to database for historical tracking
      try {
        await saveStatsToDatabase(accounts[0], followerCount, followingCount, mutualCount);
        
        // Verileri kaydettikten sonra tarihsel verileri yeniden yükle
        fetchHistoricalStats();
      } catch (dbError) {
        console.warn('Could not save statistics:', dbError);
        toast.error('Statistics could not be saved to database, but data is still viewable');
      }

      // Update state
      setStats({
        followerCount,
        followingCount,
        mutualCount,
        dailyChange,
        followRatio
      });
      
      setLastUpdate(new Date());
      toast.success('Blockchain data loaded successfully', { id: 'stats-toast' });
    } catch (error: any) {
      console.error('Error fetching blockchain statistics:', error);
      setError(`Error fetching blockchain data: ${error.message || 'Unknown error'}`);
      toast.error('Could not load blockchain data', { id: 'stats-toast' });
    } finally {
      setLoading(false);
    }
  }, [accounts, isConnected, followerSystem, fetchHistoricalStats]);

  // Get daily change from database
  const fetchDailyChange = async (address: string, currentFollowerCount: number): Promise<number> => {
    try {
      // Get today's date
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Get last 2 days of stats
      const recentStats = await db.stats.getStats(address, 2);
      
      // Find yesterday's stats
      const yesterdayStats = recentStats.find(stat => {
        const statDate = new Date(stat.date);
        statDate.setHours(0, 0, 0, 0);
        const yesterdayDate = new Date(today);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        return statDate.getTime() === yesterdayDate.getTime();
      });

      // If yesterday's data exists, calculate the change
      return yesterdayStats ? currentFollowerCount - yesterdayStats.follower_count : 0;
    } catch (error) {
      console.error('Error calculating daily change:', error);
      return 0;
    }
  };

  // Save statistics to database
  const saveStatsToDatabase = async (address: string, followerCount: number, followingCount: number, mutualCount: number) => {
    try {
      // Get today's date
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Get most recent stats
      const recentStats = await db.stats.getStats(address, 1);
      
      // Check if we already have today's record
      const todayStats = recentStats.find(stat => {
        const statDate = new Date(stat.date);
        statDate.setHours(0, 0, 0, 0);
        return statDate.getTime() === today.getTime();
      });

      // Save only if no record exists or there's a change
      const shouldSave = !todayStats || 
                        todayStats.follower_count !== followerCount || 
                        todayStats.following_count !== followingCount || 
                        todayStats.mutual_count !== mutualCount;

      if (shouldSave) {
        console.log('Saving new statistics to database...');
        const result = await db.stats.saveStats({
          address,
          date: today.toISOString(),
          follower_count: followerCount,
          following_count: followingCount,
          mutual_count: mutualCount
        });
        
        if (!result) {
          throw new Error('Database save result is empty');
        }
        
        console.log('Statistics saved successfully');
      } else {
        console.log('No changes in statistics, skipping save');
      }
    } catch (error) {
      console.error('Error saving statistics:', error);
      throw error;
    }
  };

  useEffect(() => {
    // Fetch data when component mounts or when account changes
    let isMounted = true;

    // Only fetch if we're connected
    if (isConnected && accounts[0]) {
      fetchBlockchainStats();
      fetchUserProfile();
      fetchHistoricalStats();
    }

    // Listen for account changes if provider exists
    if (provider) {
      const providerInstance = provider; // For type narrowing
      
      // Refresh data when account changes
      const handleAccountsChanged = () => {
        console.log('Account changed, refreshing blockchain data...');
        if (isMounted) {
          fetchBlockchainStats();
          fetchUserProfile();
          fetchHistoricalStats();
        }
      };

      // Add event listeners
      providerInstance.on('accountsChanged', handleAccountsChanged);
      providerInstance.on('contextAccountsChanged', handleAccountsChanged);

      // Cleanup function
      return () => {
        isMounted = false;
        providerInstance.removeListener('accountsChanged', handleAccountsChanged);
        providerInstance.removeListener('contextAccountsChanged', handleAccountsChanged);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [isConnected, accounts, fetchBlockchainStats, fetchUserProfile, fetchHistoricalStats]);

  const renderStat = (title: string, value: number | string, subtext?: string, subtextClass?: string) => (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      <p className="text-3xl font-bold text-[#FF2975]">{value}</p>
      {subtext && (
        <p className={subtextClass || 'text-sm text-gray-500'}>
          {subtext}
        </p>
      )}
    </div>
  );

  if (!isConnected) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <p className="text-gray-500">Please connect your wallet.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <p className="text-gray-500">Loading blockchain data...</p>
        <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5">
          <div className="bg-[#FF2975] h-2.5 rounded-full animate-pulse w-3/4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Follower Statistics</h2>
        
        <div className="flex items-center space-x-4">
          {lastUpdate && (
            <p className="text-sm text-gray-500">
              Last update: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
          
          {isConnected && accounts[0] && (
            <div className="flex items-center space-x-2 bg-gray-100 rounded-full px-3 py-1">
              {userProfile && userProfile.avatar ? (
                <ImageWithFallback
                  src={userProfile.avatar}
                  alt="Your Profile"
                  width={28}
                  height={28}
                  className="rounded-full"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center">
                  <span className="text-xs text-gray-500">UP</span>
                </div>
              )}
              <span className="text-sm font-mono truncate max-w-[120px] md:max-w-[180px]">
                {userProfile?.name || accounts[0]}
              </span>
            </div>
          )}
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
              <button 
                onClick={() => {
                  setError(null);
                  fetchBlockchainStats();
                }}
                className="mt-2 text-sm font-medium text-red-700 hover:text-red-600"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {renderStat(
          "Followers", 
          stats.followerCount,
          `${stats.dailyChange >= 0 ? '+' : ''}${stats.dailyChange} today`,
          `text-sm ${stats.dailyChange >= 0 ? 'text-green-500' : 'text-red-500'}`
        )}

        {renderStat("Following", stats.followingCount)}

        {renderStat(
          "Mutual Connections", 
          stats.mutualCount,
          stats.followerCount > 0 
            ? `${((stats.mutualCount / stats.followerCount) * 100).toFixed(1)}% ratio` 
            : '0% ratio'
        )}

        {renderStat(
          "Follow Ratio", 
          stats.followRatio.toFixed(2),
          stats.followRatio >= 1 ? 'Good' : stats.followRatio >= 0.5 ? 'Average' : 'Low'
        )}
      </div>
      
      {/* Tarihsel veriler grafiği */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Follower Trends (Last 30 Days)</h3>
        
        {historicalLoading ? (
          <div className="flex flex-col items-center justify-center py-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF2975]"></div>
            <p className="mt-4 text-gray-500">Loading historical data...</p>
          </div>
        ) : historicalError ? (
          <div className="bg-blue-50 p-4 rounded">
            <p className="text-sm text-blue-700">{historicalError}</p>
          </div>
        ) : historicalStats.length === 0 ? (
          <div className="bg-blue-50 p-4 rounded">
            <p className="text-sm text-blue-700">No historical data available yet. Statistics will be collected as you use the app.</p>
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={formatChartData(historicalStats)}
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="followers" fill="#FF2975" stroke="#FF2975" name="Followers" />
                <Line type="monotone" dataKey="following" stroke="#8884d8" name="Following" />
                <Line type="monotone" dataKey="mutual" stroke="#82ca9d" name="Mutual" />
                <Bar dataKey="nonMutual" barSize={20} fill="#FFA3C7" name="One-way Followers" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      
      <div className="bg-white rounded-lg shadow-lg p-4 border-l-4 border-blue-500">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Blockchain Data</h3>
            <div className="mt-1 text-sm text-blue-700">
              <p>These statistics are fetched directly from the LSP-26 contract on the LUKSO blockchain. Statistics represent the real-time follower status of your Universal Profile.</p>
              <p className="mt-1">The trend chart shows how your follower count has changed over time. Data is collected each time you visit this page.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 