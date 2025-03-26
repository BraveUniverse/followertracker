'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { LSP26FollowerSystem } from '@/lib/lsp26';
import { LSP3ProfileManager, LSP3ProfileData } from '@/lib/lsp3';
import { toast } from 'react-hot-toast';
import { provider } from '@/lib/up-provider';
import Image from 'next/image';

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

export default function Dashboard(props: any) {
  const { accounts, isConnected } = useWallet();
  const [stats, setStats] = useState({
    followerCount: 0,
    followingCount: 0,
    mutualCount: 0,
    nonMutualCount: 0,
    nonFollowingBack: 0,
    suggestedProfiles: 0
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [userProfile, setUserProfile] = useState<LSP3ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Create follower system instance only once
  const followerSystem = useMemo(() => new LSP26FollowerSystem(), []);
  const profileManager = useMemo(() => new LSP3ProfileManager(), []);

  // Navigation function (to be called from outside the Dashboard component)
  const onNavigate = props.onNavigate || (() => {});

  // Simplified loading state
  const [loadingStats, setLoadingStats] = useState({
    followerCount: 0,
    followingCount: 0,
    isLargeDataset: false,
    loadedFollowers: 0,
    loadedFollowing: 0,
    mutualChecked: 0,
    mutualFound: 0,
    stage: 'init' // 'init', 'counts', 'followers', 'following', 'mutual'
  });

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

  // Function to fetch statistics directly from blockchain
  const fetchStats = useCallback(async () => {
    if (!isConnected || !accounts[0]) return;

    try {
      setLoading(true);
      
      // İlk aşama: Temel bilgileri göster
      setLoadingStats(prev => ({
        ...prev,
        stage: 'counts'
      }));
      
      // İlk önce profil sayılarını al, ardından mutual connections hesapla
      const { allFollowers, allFollowing, mutualCount } = await followerSystem.getMutualConnections(accounts[0]);

      // Kullanıcıya temel sayı bilgilerini göster
      setLoadingStats({
        followerCount: allFollowers.length,
        followingCount: allFollowing.length,
        isLargeDataset: allFollowers.length > 500 || allFollowing.length > 500,
        loadedFollowers: allFollowers.length,
        loadedFollowing: allFollowing.length,
        mutualChecked: Math.max(allFollowers.length, allFollowing.length),
        mutualFound: mutualCount,
        stage: 'completed' // İşlem tamamlandı
      });
      
      console.log(`Found ${allFollowers.length} followers, ${allFollowing.length} following, and ${mutualCount} mutual connections directly from blockchain`);
      
      // Non-mutual hesapları hesapla
      const nonMutualCount = allFollowers.length - mutualCount;
      const nonFollowingBack = allFollowing.length - mutualCount;
      
      // Öneri sayısını belirle
      const suggestedProfiles = allFollowers.length > 0 || allFollowing.length > 0 ? 25 : 0;
      
      // State güncelle
      setStats({
        followerCount: allFollowers.length,
        followingCount: allFollowing.length,
        mutualCount,
        nonMutualCount,
        nonFollowingBack,
        suggestedProfiles
      });
      
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      toast.error('Could not load blockchain stats. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [accounts, isConnected, followerSystem]);

  useEffect(() => {
    // Fetch stats when component mounts
    let isMounted = true;

    // Only fetch if connected
    if (isConnected && accounts[0]) {
      fetchStats();
      fetchUserProfile();
    }

    // Listen for account changes
    if (provider) {
      const providerInstance = provider; 
      
      // Refresh data when account changes
      const handleAccountsChanged = () => {
        console.log('Account changed, refreshing blockchain data...');
        if (isMounted) {
          fetchStats();
          fetchUserProfile();
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
  }, [isConnected, accounts, fetchStats, fetchUserProfile]);

  // Clickable statistic card
  const statCard = (title: string, value: number | string, description?: string, target?: string) => (
    <div 
      className="p-6 bg-white rounded-lg shadow-lg hover:shadow-xl transition-all cursor-pointer border-2 border-transparent hover:border-[#FF2975]"
      onClick={() => target && onNavigate(target)}
    >
      <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
      <p className="text-4xl font-bold text-[#FF2975] my-2">{value}</p>
      {description && <p className="text-sm text-gray-500">{description}</p>}
    </div>
  );

  if (!isConnected) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg text-center">
        <p className="text-gray-700">Please connect your wallet to view your dashboard.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF2975] mx-auto mb-4"></div>
        
        {loadingStats.followerCount > 0 && (
          <div className="mb-6">
            <p className="text-gray-700 font-medium mb-2">Blockchain Data:</p>
            <p className="text-gray-700">Follower Count: {loadingStats.followerCount}</p>
            <p className="text-gray-700">Following Count: {loadingStats.followingCount}</p>
            
            {loadingStats.stage === 'mutual' && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-700">
                    Checking mutual connections:
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {Math.round((loadingStats.mutualChecked / Math.max(
                      loadingStats.followerCount <= loadingStats.followingCount ? loadingStats.followerCount : loadingStats.followingCount, 1
                    )) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-1">
                  <div 
                    className="bg-[#FF2975] h-2.5 rounded-full" 
                    style={{ width: `${Math.min(100, Math.round((loadingStats.mutualChecked / Math.max(
                      loadingStats.followerCount <= loadingStats.followingCount ? loadingStats.followerCount : loadingStats.followingCount, 1
                    )) * 100))}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {loadingStats.mutualChecked} of {
                    loadingStats.followerCount <= loadingStats.followingCount 
                      ? loadingStats.followerCount 
                      : loadingStats.followingCount
                  } checked
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Found <span className="text-[#FF2975] font-medium">{loadingStats.mutualFound}</span> mutual connections so far
                </p>
              </div>
            )}
            
            {loadingStats.stage === 'completed' && (
              <div className="mt-4 p-3 bg-green-50 rounded text-green-800">
                <p className="font-medium">Data retrieval completed!</p>
                <p className="text-sm mt-1">Found {loadingStats.mutualFound} mutual connections</p>
              </div>
            )}
          </div>
        )}
        
        <p className="text-gray-500">
          {loadingStats.stage === 'init' 
            ? "Connecting to blockchain..." 
            : loadingStats.stage === 'counts' 
              ? "Getting follower data from blockchain..." 
              : loadingStats.stage === 'mutual'
                ? "Verifying connections on blockchain..." 
                : loadingStats.stage === 'completed'
                  ? "Processing data..."
                  : "Loading blockchain data..."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCard('Followers', stats.followerCount, 'Profiles that follow you', 'followers')}
        {statCard('Following', stats.followingCount, 'Profiles you follow', 'following')}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCard('One-way Followers', stats.nonMutualCount, 'Profiles that follow you but you don\'t follow back', 'one-way-followers')}
        {statCard('One-way Following', stats.nonFollowingBack, 'Profiles you follow but don\'t follow you back', 'one-way-following')}
        {statCard('Recommended Profiles', stats.suggestedProfiles, 'Profiles you might want to follow', 'recommendations')}
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">About Dashboard</h2>
        <div className="prose max-w-none">
          <p>
            This dashboard displays real-time follower statistics retrieved from the LUKSO blockchain.
            All data is obtained directly from the LSP-26 Universal Profile Follow contract, ensuring
            you have the most accurate and up-to-date information about your followers.
          </p>
          <p className="mt-2">
            <strong>Why is this important?</strong> Unlike traditional social platforms, blockchain data
            is verifiable and transparent. These numbers are reliable as they represent real connections
            between Universal Profiles.
          </p>
          <p className="mt-2">
            For detailed follower management and analysis, you can explore the Follower Management and
            Follower Statistics tabs in the navigation menu.
          </p>
        </div>
      </div>
    </div>
  );
} 