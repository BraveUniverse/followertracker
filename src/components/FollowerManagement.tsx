'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { LSP26FollowerSystem } from '@/lib/lsp26';
import { db } from '@/lib/supabase';
import { provider } from '@/lib/up-provider';
import { LSP3ProfileManager, LSP3ProfileData } from '@/lib/lsp3';
import { toast } from 'react-hot-toast';
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

interface FollowerData {
  address: string;
  isMutual: boolean;
  isFollowing: boolean;
  isSelected: boolean;
  profile?: LSP3ProfileData;
}

export default function FollowerManagement() {
  const { accounts, isConnected } = useWallet();
  const [followers, setFollowers] = useState<FollowerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mutual' | 'one-way'>('all');
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const [userProfile, setUserProfile] = useState<LSP3ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  
  // Create these instances only once
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

  // Fetch followers from blockchain and check mutual status
  const fetchFollowers = useCallback(async (newPage = 0) => {
    if (!isConnected || !accounts[0]) return;

    try {
      setLoading(true);
      setError(null);

      const offset = newPage * pageSize;
      
      console.log(`Fetching followers for ${accounts[0]}, page ${newPage}, offset ${offset}`);
      
      // Get followers from blockchain
      const followerAddresses = await followerSystem.getFollowers(accounts[0], offset);
      console.log(`Found ${followerAddresses.length} followers for page ${newPage}`);

      // Check if we have more followers to load
      setHasMore(followerAddresses.length === pageSize);
      
      // Process each follower to get mutual status and profile info
      const followerData: FollowerData[] = [];
      
      for (const address of followerAddresses) {
        try {
          // Get if you're following them back
          const isFollowing = await followerSystem.isFollowing(accounts[0], address);
          
          // Get profile info
          let profile: LSP3ProfileData | undefined = undefined;
          try {
            const profileData = await profileManager.getProfileData(address);
            if (profileData) {
              profile = profileData;
            }
          } catch (profileError) {
            console.warn(`Could not fetch profile for ${address}:`, profileError);
          }
          
          followerData.push({
            address,
            isMutual: isFollowing,
            isFollowing,
            isSelected: false,
            profile
          });
        } catch (error) {
          console.error(`Error processing follower ${address}:`, error);
          followerData.push({
            address,
            isMutual: false,
            isFollowing: false,
            isSelected: false
          });
        }
      }

      // Save follower data to database for historical tracking
      try {
        await saveFollowersToDatabase(accounts[0], followerData);
      } catch (dbError) {
        console.warn('Could not save follower data to database:', dbError);
      }

      if (newPage === 0) {
        setFollowers(followerData);
      } else {
        setFollowers(prev => [...prev, ...followerData]);
      }
      
      setPage(newPage);
    } catch (error: any) {
      console.error('Error fetching followers:', error);
      setError(`Error loading followers: ${error.message || 'Unknown error'}`);
      toast.error('Could not load followers');
    } finally {
      setLoading(false);
    }
  }, [accounts, isConnected, followerSystem, profileManager]);
  
  // Save followers data to database for historical reference
  const saveFollowersToDatabase = async (address: string, followerData: FollowerData[]) => {
    try {
      const followerEntries = followerData.map(follower => ({
        user_address: address,
        follower_address: follower.address,
        is_mutual: follower.isMutual,
        timestamp: new Date().toISOString()
      }));
      
      if (followerEntries.length > 0) {
        console.log(`Saving ${followerEntries.length} follower records to database`);
        
        // Process one by one to avoid database constraints
        for (const entry of followerEntries) {
          await db.followers.addFollower(
            entry.user_address,
            entry.follower_address,
            entry.is_mutual
          );
        }
      }
    } catch (error) {
      console.error('Error saving followers to database:', error);
      // We only log the error but don't throw it as this is a secondary operation
    }
  };

  // Handle bulk follow operation for selected followers
  const handleFollowSelected = async () => {
    if (!isConnected || !accounts[0]) return;
    
    const selectedFollowers = followers.filter(f => f.isSelected && !f.isFollowing);
    if (selectedFollowers.length === 0) {
      toast.error('No followers selected or all selected followers are already being followed');
      return;
    }
    
    try {
      toast.loading(`Following ${selectedFollowers.length} profiles...`);
      
      let results;
      
      // Tek profil seçiliyse tekli işlem, birden fazla seçiliyse toplu işlem yap
      if (selectedFollowers.length === 1) {
        // Tek profil için tekli follow işlemi
        const follower = selectedFollowers[0];
        try {
          console.log(`Following single profile: ${follower.address}`);
          await followerSystem.follow(follower.address);
          results = [{ address: follower.address, success: true }];
        } catch (error) {
          console.error(`Error following ${follower.address}:`, error);
          results = [{ address: follower.address, success: false, error }];
        }
      } else {
        // Çoklu profil için batch follow işlemi
        try {
          const addresses = selectedFollowers.map(f => f.address);
          console.log(`Starting batch follow for ${addresses.length} profiles`);
          
          // PRD'ye göre maksimum 50 adresle sınırla
          const MAX_BATCH_SIZE = 50;
          if (addresses.length > MAX_BATCH_SIZE) {
            const limitedAddresses = addresses.slice(0, MAX_BATCH_SIZE);
            await followerSystem.followMany(limitedAddresses);
            // Sadece işlenen adresleri başarılı olarak işaretle
            results = addresses.map((address, index) => ({ 
              address, 
              success: index < MAX_BATCH_SIZE 
            }));
          } else {
            await followerSystem.followMany(addresses);
            // Başarılı olursa tüm adresleri başarılı olarak işaretliyoruz
            results = addresses.map(address => ({ address, success: true }));
          }
        } catch (error) {
          console.error('Error in batch follow operation:', error);
          
          // Toplu işlem başarısız olduğunda, tek tek denemeye geç
          const followPromises = selectedFollowers.map(async (follower) => {
            try {
              console.log(`Attempting individual follow for: ${follower.address}`);
              await followerSystem.follow(follower.address);
              return { address: follower.address, success: true };
            } catch (error) {
              console.error(`Error following ${follower.address}:`, error);
              return { address: follower.address, success: false, error };
            }
          });
          results = await Promise.all(followPromises);
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      
      // Güncellenmiş takipçi listesini oluştur
      const updatedFollowers = followers.map(follower => {
        const result = results.find(r => r.address === follower.address);
        if (result && result.success) {
          return { ...follower, isFollowing: true, isMutual: true };
        }
        return follower;
      });
      
      // React state'ini güncelle
      setFollowers(updatedFollowers);
      
      // Güncellenmiş verileri veritabanına kaydet
      try {
        await saveFollowersToDatabase(accounts[0], updatedFollowers);
        console.log('Updated follower data saved to database successfully');
      } catch (dbError) {
        console.warn('Could not save updated follower data:', dbError);
      }
      
      if (successCount === selectedFollowers.length) {
        toast.success(`Successfully followed ${successCount} profiles`);
      } else {
        toast.error(`Followed ${successCount} of ${selectedFollowers.length} profiles`);
      }
    } catch (error: any) {
      console.error('Error in follow operation:', error);
      toast.error(`Follow operation failed: ${error.message || 'Unknown error'}`);
    }
  };
  
  // Handle bulk unfollow operation for selected followers
  const handleUnfollowSelected = async () => {
    if (!isConnected || !accounts[0]) return;
    
    const selectedFollowers = followers.filter(f => f.isSelected && f.isFollowing);
    if (selectedFollowers.length === 0) {
      toast.error('No followers selected or none of the selected followers are being followed');
      return;
    }
    
    try {
      toast.loading(`Unfollowing ${selectedFollowers.length} profiles...`);
      
      let results;
      
      // Tek profil seçiliyse tekli işlem, birden fazla seçiliyse toplu işlem yap
      if (selectedFollowers.length === 1) {
        // Tek profil için tekli unfollow işlemi
        const follower = selectedFollowers[0];
        try {
          console.log(`Unfollowing single profile: ${follower.address}`);
          await followerSystem.unfollow(follower.address);
          results = [{ address: follower.address, success: true }];
        } catch (error) {
          console.error(`Error unfollowing ${follower.address}:`, error);
          results = [{ address: follower.address, success: false, error }];
        }
      } else {
        // Çoklu profil için batch unfollow işlemi
        try {
          const addresses = selectedFollowers.map(f => f.address);
          console.log(`Starting batch unfollow for ${addresses.length} profiles`);
          
          // PRD'ye göre maksimum 50 adresle sınırla
          const MAX_BATCH_SIZE = 50;
          if (addresses.length > MAX_BATCH_SIZE) {
            const limitedAddresses = addresses.slice(0, MAX_BATCH_SIZE);
            await followerSystem.unfollowMany(limitedAddresses);
            // Sadece işlenen adresleri başarılı olarak işaretle
            results = addresses.map((address, index) => ({ 
              address, 
              success: index < MAX_BATCH_SIZE 
            }));
          } else {
            await followerSystem.unfollowMany(addresses);
            // Başarılı olursa tüm adresleri başarılı olarak işaretliyoruz
            results = addresses.map(address => ({ address, success: true }));
          }
        } catch (error) {
          console.error('Error in batch unfollow operation:', error);
          
          // Toplu işlem başarısız olduğunda, tek tek denemeye geç
          const unfollowPromises = selectedFollowers.map(async (follower) => {
            try {
              console.log(`Attempting individual unfollow for: ${follower.address}`);
              await followerSystem.unfollow(follower.address);
              return { address: follower.address, success: true };
            } catch (error) {
              console.error(`Error unfollowing ${follower.address}:`, error);
              return { address: follower.address, success: false, error };
            }
          });
          results = await Promise.all(unfollowPromises);
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      
      // Güncellenmiş takipçi listesini oluştur
      const updatedFollowers = followers.map(follower => {
        const result = results.find(r => r.address === follower.address);
        if (result && result.success) {
          return { ...follower, isFollowing: false, isMutual: false };
        }
        return follower;
      });
      
      // React state'ini güncelle
      setFollowers(updatedFollowers);
      
      // Güncellenmiş verileri veritabanına kaydet
      try {
        await saveFollowersToDatabase(accounts[0], updatedFollowers);
        console.log('Updated follower data saved to database successfully');
      } catch (dbError) {
        console.warn('Could not save updated follower data:', dbError);
      }
      
      if (successCount === selectedFollowers.length) {
        toast.success(`Successfully unfollowed ${successCount} profiles`);
      } else {
        toast.error(`Unfollowed ${successCount} of ${selectedFollowers.length} profiles`);
      }
    } catch (error: any) {
      console.error('Error in unfollow operation:', error);
      toast.error(`Unfollow operation failed: ${error.message || 'Unknown error'}`);
    }
  };

  // Toggle selection of a follower
  const toggleSelect = (address: string) => {
    setFollowers(prev => 
      prev.map(follower => 
        follower.address === address 
          ? { ...follower, isSelected: !follower.isSelected }
          : follower
      )
    );
  };

  // Toggle selection of all followers
  const toggleSelectAll = () => {
    const displayedFollowers = getFilteredFollowers();
    const allSelected = displayedFollowers.every(f => f.isSelected);
    
    setFollowers(prev => 
      prev.map(follower => {
        // Only toggle followers that match the current filter
        // Kullanıcının kendi adresini kontrol et ve seçme
        if (displayedFollowers.some(f => f.address === follower.address) && 
            accounts[0]?.toLowerCase() !== follower.address.toLowerCase()) {
          return { ...follower, isSelected: !allSelected };
        }
        return follower;
      })
    );
  };

  // Get followers based on current filter
  const getFilteredFollowers = () => {
    return followers.filter(follower => {
      if (filter === 'mutual') return follower.isMutual;
      if (filter === 'one-way') return !follower.isMutual;
      return true;
    });
  };

  useEffect(() => {
    // Fetch followers when component mounts
    let isMounted = true;

    // Only fetch if connected and no followers exist or forced refresh
    if (isConnected && accounts[0]) {
      if (followers.length === 0) {
        fetchFollowers();
      }
      fetchUserProfile();
    }

    // Listen for account changes
    if (provider) {
      const providerInstance = provider;
      
      const handleAccountsChanged = () => {
        console.log('Account changed, refreshing followers...');
        if (isMounted) {
          // Reset followers and page state on account change
          setFollowers([]);
          setPage(0);
          fetchFollowers();
        }
      };

      providerInstance.on('accountsChanged', handleAccountsChanged);
      providerInstance.on('contextAccountsChanged', handleAccountsChanged);

      return () => {
        isMounted = false;
        providerInstance.removeListener('accountsChanged', handleAccountsChanged);
        providerInstance.removeListener('contextAccountsChanged', handleAccountsChanged);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [isConnected, accounts, followers.length, fetchFollowers, fetchUserProfile]);

  if (!isConnected) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <p className="text-gray-500">Please connect your wallet.</p>
      </div>
    );
  }

  const filteredFollowers = getFilteredFollowers();
  const allSelected = filteredFollowers.length > 0 && filteredFollowers.every(f => f.isSelected);
  const anySelected = filteredFollowers.some(f => f.isSelected);

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Follower Management</h1>
        
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
      
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-wrap justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-800">Followers</h2>
            
            <div className="flex space-x-2 mt-2 sm:mt-0">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 text-sm rounded-full ${
                  filter === 'all' 
                    ? 'bg-[#FF2975] text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('mutual')}
                className={`px-3 py-1 text-sm rounded-full ${
                  filter === 'mutual' 
                    ? 'bg-[#FF2975] text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Mutual
              </button>
              <button
                onClick={() => setFilter('one-way')}
                className={`px-3 py-1 text-sm rounded-full ${
                  filter === 'one-way' 
                    ? 'bg-[#FF2975] text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                One-way
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
            <button 
              onClick={() => {
                setError(null);
                fetchFollowers();
              }}
              className="mt-2 text-sm font-medium text-red-700 hover:text-red-600"
            >
              Try Again
            </button>
          </div>
        )}

        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-wrap items-center justify-between">
            <div className="flex items-center space-x-2 mb-2 sm:mb-0">
              <input
                type="checkbox"
                id="select-all"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-[#FF2975] rounded focus:ring-[#FF2975]"
              />
              <label htmlFor="select-all" className="text-sm text-gray-700">
                {filteredFollowers.length > 0 
                  ? `Select All (${filteredFollowers.length})`
                  : 'No followers to select'}
              </label>
            </div>
            
            <div className="flex space-x-2">
              <button 
                onClick={handleFollowSelected}
                disabled={!anySelected}
                className={`px-4 py-2 text-sm rounded ${
                  anySelected 
                    ? 'bg-green-600 text-white hover:bg-green-700' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Follow Selected
              </button>
              <button 
                onClick={handleUnfollowSelected}
                disabled={!anySelected}
                className={`px-4 py-2 text-sm rounded ${
                  anySelected 
                    ? 'bg-red-600 text-white hover:bg-red-700' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Unfollow Selected
              </button>
            </div>
          </div>
        </div>

        <div>
          {loading && followers.length === 0 ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF2975] mx-auto"></div>
              <p className="mt-4 text-gray-500">Loading followers from blockchain...</p>
            </div>
          ) : filteredFollowers.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-500">
                {followers.length === 0 
                  ? 'No followers found'
                  : `No ${filter === 'mutual' ? 'mutual' : filter === 'one-way' ? 'one-way' : ''} followers found`}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredFollowers.map((follower) => (
                <li key={follower.address} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <input
                      type="checkbox"
                      checked={follower.isSelected}
                      onChange={() => toggleSelect(follower.address)}
                      className="w-4 h-4 text-[#FF2975] rounded focus:ring-[#FF2975]"
                    />
                    
                    <div className="flex-shrink-0">
                      <a 
                        href={`https://universaleverything.io/${follower.address}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        {follower.profile && follower.profile.avatar ? (
                          <ImageWithFallback
                            src={follower.profile.avatar}
                            alt="Profile"
                            width={40}
                            height={40}
                            className="rounded-full hover:ring-2 hover:ring-[#FF2975]"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300">
                            <span className="text-xs text-gray-500">No Img</span>
                          </div>
                        )}
                      </a>
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <a 
                        href={`https://universaleverything.io/${follower.address}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:text-[#FF2975]"
                      >
                        <p className="text-sm font-medium text-gray-900 truncate hover:underline">
                          {follower.profile?.name || 'Anonymous Profile'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {follower.address}
                        </p>
                      </a>
                    </div>
                    
                    <div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        follower.isMutual 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {follower.isMutual ? 'Mutual' : 'Follower'}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          
          {hasMore && (
            <div className="p-4 text-center">
              <button 
                onClick={() => fetchFollowers(page + 1)}
                disabled={loading}
                className={`px-4 py-2 text-sm rounded ${
                  loading 
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                    : 'bg-[#FF2975] text-white hover:bg-[#FF1365]'
                }`}
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 