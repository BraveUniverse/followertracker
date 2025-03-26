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

interface ProfileData {
  address: string;
  profile?: LSP3ProfileData;
}

export default function MutualConnections() {
  const { accounts, isConnected } = useWallet();
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const [userProfile, setUserProfile] = useState<LSP3ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1); // Current page for UI pagination
  const [totalPages, setTotalPages] = useState(1); // Total pages
  const [allProfilesData, setAllProfilesData] = useState<ProfileData[]>([]); // Store all profiles for pagination
  const [totalResults, setTotalResults] = useState(0);
  
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
    if (allProfilesData.length > 0) {
      // UI paginations starts from 1, but our code uses 0-based indexing
      const pageIndex = currentPage - 1;
      const offset = pageIndex * pageSize;
      const paginatedProfiles = allProfilesData.slice(offset, offset + pageSize);
      setProfiles(paginatedProfiles);
    }
  }, [currentPage, pageSize, allProfilesData]);

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

  // Fetch mutual connections using checkFollowRelation method
  const fetchMutualConnections = useCallback(async (newPage = 0) => {
    if (!isConnected || !accounts[0]) return;

    try {
      setLoading(true);
      setError(null);

      if (newPage === 0) {
        // Use optimized method to get mutual connections
        const { mutualConnections } = await followerSystem.getMutualConnections(accounts[0]);
        
        console.log(`Found ${mutualConnections.length} mutual connections`);
        
        // Process all mutual profiles
        const mutualProfiles: ProfileData[] = [];
        
        for (const address of mutualConnections) {
          try {
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
            
            mutualProfiles.push({
              address,
              profile
            });
          } catch (error) {
            console.error(`Error processing profile ${address}:`, error);
          }
        }
        
        // Store all profiles data for pagination
        setAllProfilesData(mutualProfiles);
        setTotalResults(mutualProfiles.length);
        
        // Apply pagination for first page
        const paginatedProfiles = mutualProfiles.slice(0, pageSize);
        setProfiles(paginatedProfiles);
        
        // Set if there are more profiles to show
        setHasMore(mutualProfiles.length > pageSize);
      }
      
      setPage(newPage);
    } catch (error) {
      console.error('Error fetching mutual connections:', error);
      setError('Failed to load profiles. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [isConnected, accounts, pageSize]);

  // Manual refresh function
  const handleRefresh = () => {
    setProfiles([]);
    setPage(0);
    setCurrentPage(1);
    setRefreshing(true);
    fetchMutualConnections(0).finally(() => {
      setRefreshing(false);
    });
  };

  useEffect(() => {
    // Fetch data when component mounts
    let isMounted = true;
    let initialFetchDone = false;

    // Only fetch if connected and not fetched yet
    if (isConnected && accounts[0] && !initialFetchDone) {
      initialFetchDone = true;
      fetchMutualConnections();
      fetchUserProfile();
    }

    // Listen for account changes
    if (provider) {
      const providerInstance = provider;
      
      const handleAccountsChanged = () => {
        console.log('Account changed, refreshing profiles...');
        if (isMounted) {
          setProfiles([]);
          setPage(0);
          fetchMutualConnections();
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
  }, [isConnected, accounts, fetchMutualConnections, fetchUserProfile]);

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
        <h1 className="text-2xl font-bold text-gray-800">Mutual Connections</h1>
        
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
            <h2 className="text-xl font-semibold text-gray-800">Profiles You Mutually Follow</h2>
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
                fetchMutualConnections();
              }}
              className="mt-2 text-sm font-medium text-red-700 hover:text-red-600"
            >
              Try Again
            </button>
          </div>
        )}

        <div>
          {loading && profiles.length === 0 ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF2975] mx-auto"></div>
              <p className="mt-4 text-gray-500">Loading profiles...</p>
            </div>
          ) : profiles.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-500">
                {!loading ? 'No mutual connections found.' : 'Loading profiles...'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {profiles.map((profile) => (
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
                            width={48}
                            height={48}
                            className="rounded-full hover:ring-2 hover:ring-[#FF2975]"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300">
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
                        <p className="text-sm font-medium text-gray-900 hover:underline">
                          {profile.profile?.name || 'Anonymous Profile'}
                        </p>
                      </a>
                      <div 
                        className="text-xs text-gray-500 flex items-center cursor-pointer mt-1 group"
                        onClick={() => {
                          navigator.clipboard.writeText(profile.address);
                          toast.success('Address copied to clipboard!');
                        }}
                        title="Click to copy address"
                      >
                        <span className="font-mono">{profile.address.substring(0, 10)}...{profile.address.substring(38)}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 ml-1 opacity-0 group-hover:opacity-100 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </div>
                    
                    <div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Mutual Follow
                      </span>
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
        <h2 className="text-xl font-semibold text-gray-800 mb-4">What are Mutual Connections?</h2>
        <p className="text-gray-700">
          Mutual connections are profiles that you follow and who also follow you back.
          These profiles represent two-way connections you've established on the blockchain.
        </p>
        <p className="mt-2 text-gray-700">
          Mutual connections typically represent more active relationships and have greater potential for valuable interactions.
          All data is retrieved from the LUKSO blockchain and is real-time.
        </p>
      </div>
    </div>
  );
} 