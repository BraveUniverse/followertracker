'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { LSP26FollowerSystem } from '@/lib/lsp26';
import { LSP3ProfileManager, LSP3ProfileData } from '@/lib/lsp3';
import { db } from '@/lib/supabase';
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

interface FollowerData {
  address: string;
  isMutual?: boolean;
  isSelected?: boolean;
  profile?: LSP3ProfileData;
}

export default function Followers() {
  const { accounts, isConnected } = useWallet();
  const [followers, setFollowers] = useState<FollowerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const [userProfile, setUserProfile] = useState<LSP3ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1); // Current page for UI pagination
  const [totalPages, setTotalPages] = useState(1); // Total pages
  const [allFollowersData, setAllFollowersData] = useState<FollowerData[]>([]); // Store all followers for pagination
  
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

  // Manual refresh function
  const handleRefresh = () => {
    setFollowers([]);
    setPage(0);
    setCurrentPage(1);
    fetchFollowers(0);
  };

  // Calculate total pages
  useEffect(() => {
    if (totalResults > 0) {
      setTotalPages(Math.ceil(totalResults / pageSize));
    } else {
      setTotalPages(1);
    }
  }, [totalResults, pageSize]);

  // Fetch followers from blockchain and check mutual status
  const fetchFollowers = useCallback(async (newPage = 0) => {
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
        
        console.log(`Found ${allFollowers.length} total followers`);
        
        // Convert following to Set for faster lookups
        const followingSet = new Set(allFollowing.map(addr => addr.toLowerCase()));
        
        // Process each follower to get mutual status and profile info
        const allFollowerData: FollowerData[] = [];
        
        for (const address of allFollowers) {
          try {
            // Check if they are mutual based on the sets
            const isMutual = followingSet.has(address.toLowerCase());
            
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
            
            allFollowerData.push({
              address,
              isMutual,
              isSelected: false,
              profile
            });
          } catch (error) {
            console.error(`Error processing follower ${address}:`, error);
          }
        }
        
        // Store all follower data for pagination
        setAllFollowersData(allFollowerData);
        
        // Apply UI pagination for the first page
        const paginatedFollowers = allFollowerData.slice(0, pageSize);
        
        // Check if there are more followers to show
        setHasMore(pageSize < allFollowers.length);
        
        // Set the followers and total results
        setFollowers(paginatedFollowers);
        setTotalResults(allFollowers.length);
      } else {
        // For pagination, calculate offset based on newPage
        const offset = newPage * pageSize;
        
        // Get followers for the requested page from all followers data
        const paginatedFollowers = allFollowersData.slice(offset, offset + pageSize);
        
        // Update followers with paginated data for the new page
        setFollowers(paginatedFollowers);
      }
      
      // Update the current page
      setPage(newPage);
    } catch (error) {
      console.error('Error fetching followers:', error);
      setError('Failed to load followers. Please try again.');
    } finally {
      setLoading(false);
      if (newPage === 0) {
        setRefreshing(false);
      }
    }
  }, [isConnected, accounts, pageSize, allFollowersData]);

  // Update UI when page changes
  useEffect(() => {
    if (allFollowersData.length > 0) {
      // UI paginations starts from 1, but our code uses 0-based indexing
      const pageIndex = currentPage - 1;
      fetchFollowers(pageIndex);
    }
  }, [currentPage, fetchFollowers, allFollowersData]);

  // Initial fetch when component mounts
  useEffect(() => {
    if (isConnected && accounts[0]) {
      fetchUserProfile();
      fetchFollowers(0);
    }
  }, [isConnected, accounts, fetchUserProfile, fetchFollowers]);

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

  const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });

  // Format wallet address for UI display
  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Copy address to clipboard
  const copyToClipboard = (address: string) => {
    navigator.clipboard.writeText(address)
      .then(() => {
        toast.success('Address copied to clipboard');
      })
      .catch(err => {
        console.error('Could not copy address: ', err);
        toast.error('Failed to copy address');
      });
  };

  // Handle follow operation
  const handleFollow = async (address: string) => {
    if (!isConnected || !accounts[0]) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      toast.loading('Following profile...');
      await followerSystem.follow(address);
      
      // Update UI to reflect the follow action
      setFollowers(prev => 
        prev.map(follower => 
          follower.address === address 
            ? { ...follower, isMutual: true } 
            : follower
        )
      );
      
      toast.dismiss();
      toast.success('Successfully followed profile');
    } catch (error) {
      toast.dismiss();
      console.error('Error following profile:', error);
      toast.error('Failed to follow profile');
    }
  };

  // Handle unfollow operation
  const handleUnfollow = async (address: string) => {
    if (!isConnected || !accounts[0]) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      toast.loading('Unfollowing profile...');
      await followerSystem.unfollow(address);
      
      // Update UI to reflect the unfollow action
      setFollowers(prev => 
        prev.map(follower => 
          follower.address === address 
            ? { ...follower, isMutual: false } 
            : follower
        )
      );
      
      toast.dismiss();
      toast.success('Successfully unfollowed profile');
    } catch (error) {
      toast.dismiss();
      console.error('Error unfollowing profile:', error);
      toast.error('Failed to unfollow profile');
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
    
    // Also update the follower's isSelected property
    setFollowers(prev => 
      prev.map(follower => 
        follower.address === address 
          ? { ...follower, isSelected: !follower.isSelected } 
          : follower
      )
    );
  };

  // Toggle selection of all displayed followers
  const toggleSelectAll = () => {
    if (followers.every(f => f.isSelected)) {
      // If all are selected, unselect all
      setSelectedProfiles([]);
      setFollowers(prev => prev.map(follower => ({ ...follower, isSelected: false })));
    } else {
      // If some or none are selected, select all
      const allAddresses = followers.map(f => f.address);
      setSelectedProfiles(allAddresses);
      setFollowers(prev => prev.map(follower => ({ ...follower, isSelected: true })));
    }
  };

  // Handle bulk follow operation for selected profiles
  const handleFollowSelected = async () => {
    if (!isConnected || !accounts[0] || selectedProfiles.length === 0) {
      toast.error('Please select profiles to follow');
      return;
    }
    
    try {
      toast.loading(`Following ${selectedProfiles.length} profiles...`);
      
      // Try batch operation if multiple profiles are selected
      if (selectedProfiles.length > 1) {
        try {
          await followerSystem.followMany(selectedProfiles);
          
          // Update UI to reflect the follow action
          setFollowers(prev => 
            prev.map(follower => 
              selectedProfiles.includes(follower.address) 
                ? { ...follower, isMutual: true, isSelected: false } 
                : follower
            )
          );
          
          setSelectedProfiles([]);
          toast.success(`Successfully followed ${selectedProfiles.length} profiles`);
        } catch (batchError) {
          console.error('Batch follow failed:', batchError);
          
          // Try individual follows if batch fails
          let successCount = 0;
          
          for (const address of selectedProfiles) {
            try {
              await followerSystem.follow(address);
              successCount++;
              
              // Update one by one
              setFollowers(prev => 
                prev.map(follower => 
                  follower.address === address 
                    ? { ...follower, isMutual: true, isSelected: false } 
                    : follower
                )
              );
            } catch (singleError) {
              console.error(`Failed to follow ${address}:`, singleError);
            }
          }
          
          if (successCount > 0) {
            setSelectedProfiles([]);
            toast.success(`Followed ${successCount}/${selectedProfiles.length} profiles`);
          } else {
            toast.error('Follow operation failed');
          }
        }
      } else {
        // Single profile follow
        const address = selectedProfiles[0];
        await followerSystem.follow(address);
        
        // Update UI
        setFollowers(prev => 
          prev.map(follower => 
            follower.address === address 
              ? { ...follower, isMutual: true, isSelected: false } 
              : follower
          )
        );
        
        setSelectedProfiles([]);
        toast.success('Profile followed successfully');
      }
    } catch (error) {
      console.error('Error in follow operation:', error);
      toast.error('Follow operation failed');
    }
  };

  // Handle bulk unfollow operation for selected profiles
  const handleUnfollowSelected = async () => {
    if (!isConnected || !accounts[0] || selectedProfiles.length === 0) {
      toast.error('Please select profiles to unfollow');
      return;
    }
    
    try {
      toast.loading(`Unfollowing ${selectedProfiles.length} profiles...`);
      
      // Try batch operation if multiple profiles are selected
      if (selectedProfiles.length > 1) {
        try {
          await followerSystem.unfollowMany(selectedProfiles);
          
          // Update UI to reflect the unfollow action
          setFollowers(prev => 
            prev.map(follower => 
              selectedProfiles.includes(follower.address) 
                ? { ...follower, isMutual: false, isSelected: false } 
                : follower
            )
          );
          
          setSelectedProfiles([]);
          toast.success(`Successfully unfollowed ${selectedProfiles.length} profiles`);
        } catch (batchError) {
          console.error('Batch unfollow failed:', batchError);
          
          // Try individual unfollows if batch fails
          let successCount = 0;
          
          for (const address of selectedProfiles) {
            try {
              await followerSystem.unfollow(address);
              successCount++;
              
              // Update one by one
              setFollowers(prev => 
                prev.map(follower => 
                  follower.address === address 
                    ? { ...follower, isMutual: false, isSelected: false } 
                    : follower
                )
              );
            } catch (singleError) {
              console.error(`Failed to unfollow ${address}:`, singleError);
            }
          }
          
          if (successCount > 0) {
            setSelectedProfiles([]);
            toast.success(`Unfollowed ${successCount}/${selectedProfiles.length} profiles`);
          } else {
            toast.error('Unfollow operation failed');
          }
        }
      } else {
        // Single profile unfollow
        const address = selectedProfiles[0];
        await followerSystem.unfollow(address);
        
        // Update UI
        setFollowers(prev => 
          prev.map(follower => 
            follower.address === address 
              ? { ...follower, isMutual: false, isSelected: false } 
              : follower
          )
        );
        
        setSelectedProfiles([]);
        toast.success('Profile unfollowed successfully');
      }
    } catch (error) {
      console.error('Error in unfollow operation:', error);
      toast.error('Unfollow operation failed');
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">My Followers ({totalResults})</h2>
          {totalResults > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalResults)} of {totalResults}
            </p>
          )}
        </div>
        <div className="flex space-x-2">
          {selectedProfiles.length > 0 && (
            <div className="flex space-x-2">
              <button 
                onClick={handleFollowSelected}
                className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm flex items-center"
                disabled={!selectedProfiles.some(addr => 
                  followers.find(f => f.address === addr && !f.isMutual)
                )}
              >
                Follow Selected ({selectedProfiles.filter(addr => 
                  followers.find(f => f.address === addr && !f.isMutual)
                ).length})
              </button>
              <button 
                onClick={handleUnfollowSelected}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm flex items-center"
                disabled={!selectedProfiles.some(addr => 
                  followers.find(f => f.address === addr && f.isMutual)
                )}
              >
                Unfollow Selected ({selectedProfiles.filter(addr => 
                  followers.find(f => f.address === addr && f.isMutual)
                ).length})
              </button>
            </div>
          )}
          <button 
            onClick={handleRefresh}
            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm flex items-center"
            disabled={refreshing}
          >
            {refreshing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Refreshing...
              </>
            ) : (
              'Refresh'
            )}
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <div className="bg-white shadow-md rounded-lg">
        {/* Header with select all checkbox */}
        {followers.length > 0 && (
          <div className="border-b border-gray-200 p-4 flex items-center justify-between bg-gray-50">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={followers.length > 0 && followers.every(f => f.isSelected)}
                onChange={toggleSelectAll}
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm font-medium text-gray-700">
                Select All
              </span>
            </div>
            <div className="text-sm text-gray-500">
              {selectedProfiles.length > 0 
                ? `${selectedProfiles.length} selected` 
                : `${followers.length} followers`}
            </div>
          </div>
        )}
        
        {/* Follower list */}
        {followers.length > 0 ? (
          <div>
            {followers.map((follower, index) => (
              <div 
                key={follower.address} 
                className={`border-b border-gray-100 p-4 flex items-center justify-between ${
                  follower.isSelected ? 'bg-blue-50' : index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={follower.isSelected || false}
                    onChange={() => toggleSelect(follower.address)}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <div>
                    {follower.profile?.avatar ? (
                      <ImageWithFallback
                        src={follower.profile.avatar}
                        alt={follower.profile?.name || 'Profile'}
                        width={48}
                        height={48}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                        <span className="text-gray-400">No Img</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-medium">
                      {follower.profile?.name || 'Unknown Profile'}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center">
                      <span className="cursor-pointer hover:underline" onClick={() => copyToClipboard(follower.address)}>
                        {formatAddress(follower.address)}
                      </span>
                      <svg 
                        onClick={() => copyToClipboard(follower.address)}
                        className="ml-1 h-3 w-3 text-gray-400 cursor-pointer hover:text-gray-600" 
                        fill="currentColor" 
                        viewBox="0 0 20 20"
                      >
                        <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z"></path>
                        <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z"></path>
                      </svg>
                    </div>
                  </div>
                </div>
                <div>
                  {follower.isMutual ? (
                    <div className="flex space-x-2 items-center">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        Mutual
                      </span>
                      <button
                        onClick={() => handleUnfollow(follower.address)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded-md text-xs"
                      >
                        Unfollow
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleFollow(follower.address)}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-xs"
                    >
                      Follow Back
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {/* Replace load more button with pagination */}
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
                              ? 'bg-blue-600 text-white'
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
        ) : (
          <div className="p-8 text-center">
            {loading ? (
              <div className="flex justify-center">
                <svg className="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : (
              <>
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
                </svg>
                <h3 className="mt-2 text-lg font-medium text-gray-900">No followers yet</h3>
                <p className="mt-1 text-sm text-gray-500">
                  There are no profiles following you yet.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 