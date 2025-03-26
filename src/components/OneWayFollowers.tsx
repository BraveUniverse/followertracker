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
  isMutual?: boolean;
  isSelected?: boolean;
  profile?: LSP3ProfileData;
}

export default function OneWayFollowers() {
  const { accounts, isConnected } = useWallet();
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const [userProfile, setUserProfile] = useState<LSP3ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1); // Current page for UI pagination
  const [totalPages, setTotalPages] = useState(1); // Total pages
  const [allProfilesData, setAllProfilesData] = useState<ProfileData[]>([]); // Store all profiles for pagination
  
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

  // Manual refresh function to fetch data again
  const handleRefresh = () => {
    setProfiles([]);
    setPage(0);
    setSelectedProfiles([]);
    setCurrentPage(1);
    setRefreshing(true); // Explicitly set refreshing to true
    
    // Start the refresh process
    fetchOneWayFollowers(0)
      .finally(() => {
        // Ensure refreshing state is reset even if there's an error
        setRefreshing(false);
      });
  };

  // Fetch one-way followers (profiles that follow you but you don't follow back)
  const fetchOneWayFollowers = useCallback(async (newPage = 0) => {
    if (!isConnected || !accounts[0]) return;

    try {
      setLoading(true);
      setError(null);

      if (newPage === 0) {
        // Use optimized method to get all followers and following at once
        const { allFollowers, allFollowing } = await followerSystem.getMutualConnections(accounts[0]);
        
        console.log(`Found ${allFollowers.length} total followers and ${allFollowing.length} total following`);
        
        // Convert following to Set for faster lookups
        const followingSet = new Set(allFollowing.map(addr => addr.toLowerCase()));
        
        // Filter to one-way followers only (those who you don't follow back)
        const oneWayFollowerAddresses = allFollowers.filter(address => 
          !followingSet.has(address.toLowerCase())
        );
        
        console.log(`Found ${oneWayFollowerAddresses.length} one-way followers`);
        
        // Process all profiles in batch
        const oneWayProfiles: ProfileData[] = [];
        
        for (const address of oneWayFollowerAddresses) {
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
            
            oneWayProfiles.push({
              address,
              isMutual: false, // Always false for one-way followers
              isSelected: false, // Not selected by default
              profile
            });
          } catch (error) {
            console.error(`Error processing profile ${address}:`, error);
          }
        }
        
        // Store all profiles data for pagination
        setAllProfilesData(oneWayProfiles);
        
        // Apply UI pagination for the first page
        const paginatedProfiles = oneWayProfiles.slice(0, pageSize);
        
        // Set the profiles and total count
        setProfiles(paginatedProfiles);
        setTotalResults(oneWayProfiles.length);
        
        // Check if there are more profiles to show
        setHasMore(pageSize < oneWayProfiles.length);
      } else {
        // For pagination, calculate offset based on newPage
        const offset = newPage * pageSize;
        
        // Get profiles for the requested page from all profiles data
        const paginatedProfiles = allProfilesData.slice(offset, offset + pageSize);
        
        // Update profiles with paginated data
        setProfiles(paginatedProfiles);
      }
      
      // Set the current page
      setPage(newPage);
    } catch (error) {
      console.error('Error fetching one-way followers:', error);
      setError('Failed to load profiles. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [isConnected, accounts, pageSize, allProfilesData]);

  // Update UI when page changes
  useEffect(() => {
    if (allProfilesData.length > 0) {
      // UI paginations starts from 1, but our code uses 0-based indexing
      const pageIndex = currentPage - 1;
      fetchOneWayFollowers(pageIndex);
    }
  }, [currentPage, fetchOneWayFollowers, allProfilesData]);

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

  // Follow back selected profiles
  const handleFollowSelected = async () => {
    if (!isConnected || !accounts[0] || selectedProfiles.length === 0) {
      toast.error('Please select profiles to follow');
      return;
    }
    
    try {
      toast.loading(`Following ${selectedProfiles.length} profiles...`);
      
      // Use batch operation if multiple profiles are selected
      if (selectedProfiles.length > 1) {
        // Try batch operation first
        try {
          await followerSystem.followMany(selectedProfiles);
          
          // Remove followed profiles from the list
          setProfiles(current => 
            current.filter(profile => !selectedProfiles.includes(profile.address))
          );
          
          setSelectedProfiles([]);
          toast.success(`Successfully followed ${selectedProfiles.length} profiles`);
        } catch (batchError) {
          console.error('Batch follow failed:', batchError);
          
          // Try individual follows if batch fails
          let successCount = 0;
          const successfulAddresses: string[] = [];
          
          for (const address of selectedProfiles) {
            try {
              await followerSystem.follow(address);
              successCount++;
              successfulAddresses.push(address);
            } catch (singleError) {
              console.error(`Failed to follow ${address}:`, singleError);
            }
          }
          
          // Update state based on successful follows
          if (successCount > 0) {
            setProfiles(current => 
              current.filter(profile => !successfulAddresses.includes(profile.address))
            );
            setSelectedProfiles(current => 
              current.filter(address => !successfulAddresses.includes(address))
            );
            toast.success(`Followed ${successCount}/${selectedProfiles.length} profiles`);
          } else {
            toast.error('Follow operation failed');
          }
        }
      } else {
        // Single profile follow
        const address = selectedProfiles[0];
        await followerSystem.follow(address);
        
        // Remove followed profile from the list
        setProfiles(current => 
          current.filter(profile => profile.address !== address)
        );
        
        setSelectedProfiles([]);
        toast.success('Profile followed successfully');
      }
    } catch (error) {
      console.error('Error in follow operation:', error);
      toast.error('Follow operation failed');
    }
  };

  // Toggle selection of a profile
  const toggleSelect = (address: string) => {
    setSelectedProfiles(current => {
      if (current.includes(address)) {
        return current.filter(addr => addr !== address);
      } else {
        return [...current, address];
      }
    });
  };

  // Toggle selection of all profiles
  const toggleSelectAll = () => {
    if (selectedProfiles.length === profiles.length) {
      setSelectedProfiles([]);
    } else {
      // Sadece kullanıcının kendi adresi dışındaki adresleri seç
      const validProfiles = profiles
        .filter(p => accounts[0]?.toLowerCase() !== p.address.toLowerCase())
        .map(p => p.address);
      setSelectedProfiles(validProfiles);
    }
  };

  useEffect(() => {
    // Fetch data when component mounts
    let isMounted = true;
    let initialFetchDone = false;

    // Only fetch if connected and not fetched yet
    if (isConnected && accounts[0] && !initialFetchDone) {
      initialFetchDone = true;
      fetchOneWayFollowers();
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
          setSelectedProfiles([]);
          fetchOneWayFollowers();
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
  }, [isConnected, accounts, fetchOneWayFollowers, fetchUserProfile]);

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
        <h1 className="text-2xl font-bold text-gray-800">One-way Followers</h1>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={`px-3 py-1 text-sm rounded ${
              refreshing 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
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
            <h2 className="text-xl font-semibold text-gray-800">Profiles that Follow You</h2>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-[#FF2975]">{totalResults}</span> profiles found
              {totalResults > 0 && (
                <span className="ml-1">
                  (showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalResults)})
                </span>
              )}
            </p>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            These profiles follow you, but you don't follow them back
          </p>
        </div>

        {selectedProfiles.length > 0 && (
          <div className="bg-blue-50 p-4 flex justify-between items-center">
            <p className="text-sm text-blue-700">
              <span className="font-medium">{selectedProfiles.length}</span> profiles selected
            </p>
            <div className="flex space-x-2">
              <button
                onClick={toggleSelectAll}
                className="text-sm text-blue-700 hover:text-blue-600"
              >
                {selectedProfiles.length === profiles.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={handleFollowSelected}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Follow Selected
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
            <button 
              onClick={() => {
                setError(null);
                fetchOneWayFollowers();
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
                {!loading ? 'No one-way followers found. Everyone who follows you, you follow back!' : 'Loading profiles...'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {profiles.map((profile) => (
                <li key={profile.address} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <input
                      type="checkbox"
                      checked={selectedProfiles.includes(profile.address)}
                      onChange={() => toggleSelect(profile.address)}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    
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
                      <button
                        onClick={() => {
                          toggleSelect(profile.address);
                          if (!selectedProfiles.includes(profile.address)) {
                            setSelectedProfiles([profile.address]);
                            handleFollowSelected();
                          }
                        }}
                        className="px-3 py-1 text-xs rounded bg-blue-100 text-blue-800 hover:bg-blue-200"
                      >
                        Follow Back
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
        <h2 className="text-xl font-semibold text-gray-800 mb-4">About One-way Followers</h2>
        <p className="text-gray-700">
          One-way followers are profiles that follow you, but you don't follow back.
          These represent potential connections you might want to reciprocate.
        </p>
        <p className="mt-2 text-gray-700">
          You can select multiple profiles and follow them back in a single operation.
          All data is retrieved from the LUKSO blockchain and is real-time.
        </p>
      </div>
    </div>
  );
} 