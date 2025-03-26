'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { LSP26FollowerSystem } from '@/lib/lsp26';
import { LSP3ProfileManager, LSP3ProfileData } from '@/lib/lsp3';
import { provider } from '@/lib/up-provider';
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

interface FollowingData {
  address: string;
  isMutual: boolean;
  profile?: LSP3ProfileData;
}

export default function Following() {
  const { accounts, isConnected } = useWallet();
  const [following, setFollowing] = useState<FollowingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const [userProfile, setUserProfile] = useState<LSP3ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1); // Current page for UI pagination
  const [totalPages, setTotalPages] = useState(1); // Total pages
  const [allFollowingData, setAllFollowingData] = useState<FollowingData[]>([]); // Store all following for pagination
  
  // Create these instances only once
  const followerSystem = useMemo(() => new LSP26FollowerSystem(), []);
  const profileManager = useMemo(() => new LSP3ProfileManager(), []);

  // Calculate total pages
  useEffect(() => {
    if (totalResults > 0) {
      setTotalPages(Math.ceil(totalResults / pageSize));
    } else {
      setTotalPages(1);
    }
  }, [totalResults, pageSize]);

  // Update UI when page changes
  useEffect(() => {
    if (allFollowingData.length > 0) {
      // UI paginations starts from 1, but our code uses 0-based indexing
      const pageIndex = currentPage - 1;
      const offset = pageIndex * pageSize;
      const paginatedFollowing = allFollowingData.slice(offset, offset + pageSize);
      setFollowing(paginatedFollowing);
    }
  }, [currentPage, pageSize, allFollowingData]);

  // Change page
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // Previous page
  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Next page
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

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

  // Manual refresh function
  const handleRefresh = () => {
    setFollowing([]);
    setPage(0);
    setCurrentPage(1);
    setRefreshing(true);
    fetchFollowing(0);
  };

  // Fetch following from blockchain and check mutual status
  const fetchFollowing = useCallback(async (newPage = 0) => {
    if (!isConnected || !accounts[0]) return;

    try {
      setLoading(true);
      setError(null);
      if (newPage === 0) {
        setRefreshing(true);
      }
      
      if (newPage === 0) {
        // Optimize by using getMutualConnections to get all followers and followings at once
        const { allFollowers, allFollowing } = await followerSystem.getMutualConnections(accounts[0]);
        
        console.log(`Found ${allFollowing.length} total following`);
        
        // Convert followers to Set for faster lookups
        const followerSet = new Set(allFollowers.map(addr => addr.toLowerCase()));
        
        // Process all following profiles
        const followingData: FollowingData[] = [];
        
        for (const address of allFollowing) {
          try {
            // Check if they are mutual based on the sets
            const isMutual = followerSet.has(address.toLowerCase());
            
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
            
            followingData.push({
              address,
              isMutual,
              profile
            });
          } catch (error) {
            console.error(`Error processing following ${address}:`, error);
          }
        }
        
        // Store all following data for pagination
        setAllFollowingData(followingData);
        setTotalResults(followingData.length);
        
        // Apply UI pagination for the first page
        const paginatedFollowing = followingData.slice(0, pageSize);
        setFollowing(paginatedFollowing);
        
        // Check if there are more to show
        setHasMore(followingData.length > pageSize);
      }
      
      // Update the current page
      setPage(newPage);
    } catch (error) {
      console.error('Error fetching following:', error);
      setError('Failed to load following profiles. Please try again.');
    } finally {
      setLoading(false);
      if (newPage === 0) {
        setRefreshing(false);
      }
    }
  }, [isConnected, accounts, pageSize]);

  // Unfollow a profile
  const handleUnfollow = async (address: string) => {
    if (!isConnected || !accounts[0]) return;
    
    try {
      toast.loading(`Unfollowing ${address}...`);
      
      await followerSystem.unfollow(address);
      
      // Update state by removing the unfollowed profile
      setFollowing(current => current.filter(profile => profile.address !== address));
      
      toast.success('Unfollowed successfully!');
    } catch (error) {
      console.error('Error unfollowing:', error);
      toast.error('Failed to unfollow.');
    }
  };

  useEffect(() => {
    // Fetch data when component mounts
    let isMounted = true;
    let initialFetchDone = false;

    // Only fetch if connected and not fetched yet
    if (isConnected && accounts[0] && !initialFetchDone) {
      initialFetchDone = true;
      fetchFollowing();
      fetchUserProfile();
    }

    // Listen for account changes
    if (provider) {
      const providerInstance = provider;
      
      const handleAccountsChanged = () => {
        console.log('Account changed, refreshing following...');
        if (isMounted) {
          setFollowing([]);
          setPage(0);
          fetchFollowing();
          fetchUserProfile();
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
  }, [isConnected, accounts, fetchFollowing, fetchUserProfile]);

  if (!isConnected) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 text-center">
        <p className="text-gray-500">Please connect your wallet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Following</h1>
        
        <div className="flex items-center space-x-4">
          <button 
            onClick={handleRefresh}
            disabled={refreshing}
            className={`px-3 py-1 text-sm rounded ${
              refreshing 
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          
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
      
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-800">Profiles You Follow</h2>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-[#FF2975]">{totalResults}</span> profiles found
              {totalResults > 0 && (
                <span className="ml-1">
                  (showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalResults)})
                </span>
              )}
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
            <button 
              onClick={() => {
                setError(null);
                fetchFollowing();
              }}
              className="mt-2 text-sm font-medium text-red-700 hover:text-red-600"
            >
              Try Again
            </button>
          </div>
        )}

        <div>
          {loading && following.length === 0 ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF2975] mx-auto"></div>
              <p className="mt-4 text-gray-500">Loading following...</p>
            </div>
          ) : following.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-500">
                {!loading ? 'You aren\'t following any profiles yet.' : 'Loading following...'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {following.map((profile) => (
                <li key={profile.address} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <a 
                        href={`https://universaleverything.io/${profile.address}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        {profile.profile && profile.profile.avatar ? (
                          <ImageWithFallback
                            src={profile.profile.avatar}
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
                        href={`https://universaleverything.io/${profile.address}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:text-[#FF2975]"
                      >
                        <p className="text-sm font-medium text-gray-900 truncate hover:underline">
                          {profile.profile?.name || 'Anonymous Profile'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {profile.address}
                        </p>
                      </a>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {profile.isMutual && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Mutual Follow
                        </span>
                      )}
                      <button
                        onClick={() => handleUnfollow(profile.address)}
                        className="px-3 py-1 text-xs rounded bg-red-100 text-red-800 hover:bg-red-200"
                      >
                        Unfollow
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 flex justify-center items-center">
              <nav className="flex items-center">
                <button
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1 || loading}
                  className={`px-3 py-1 mx-1 rounded ${
                    currentPage === 1 || loading
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                  }`}
                >
                  Previous
                </button>
                
                <div className="flex px-2">
                  {/* Display page numbers with ellipsis for large page counts */}
                  {Array.from({ length: Math.min(totalPages, 5) }).map((_, index) => {
                    let pageNum: number;
                    
                    // Calculate which page numbers to show
                    if (totalPages <= 5) {
                      // If total pages <= 5, show all pages: 1, 2, 3, 4, 5
                      pageNum = index + 1;
                    } else if (currentPage <= 3) {
                      // If currentPage <= 3, show first 5 pages: 1, 2, 3, 4, 5
                      pageNum = index + 1;
                    } else if (currentPage >= totalPages - 2) {
                      // If currentPage >= totalPages - 2, show last 5 pages
                      pageNum = totalPages - 4 + index;
                    } else {
                      // Otherwise show currentPage and 2 before and after: currentPage-2, currentPage-1, currentPage, currentPage+1, currentPage+2
                      pageNum = currentPage - 2 + index;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-8 h-8 mx-1 text-sm rounded-full ${
                          currentPage === pageNum
                            ? 'bg-[#FF2975] text-white'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages || loading}
                  className={`px-3 py-1 mx-1 rounded ${
                    currentPage === totalPages || loading
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                  }`}
                >
                  Next
                </button>
              </nav>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">About Following</h2>
        <p className="text-gray-700">
          This page shows all profiles your Universal Profile follows on the LUKSO blockchain.
          You can see the mutual follow status of each profile and unfollow any profile at any time.
        </p>
        <p className="mt-2 text-gray-700">
          Mutual connections are highlighted with a green tag. All data is retrieved from the LUKSO blockchain
          and is real-time.
        </p>
      </div>
    </div>
  );
} 