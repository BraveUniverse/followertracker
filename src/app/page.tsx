'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { LSP3ProfileManager, LSP3ProfileData } from '@/lib/lsp3';
import { FaChartBar, FaUsers, FaTachometerAlt, FaArrowLeft, FaUserPlus, FaDatabase, FaLock, FaChartLine } from 'react-icons/fa';
import Dashboard from '@/components/Dashboard';
import FollowerStats from '@/components/FollowerStats';
import FollowerManagement from '@/components/FollowerManagement';
import Followers from '@/components/Followers';
import Following from '@/components/Following';
import MutualConnections from '@/components/MutualConnections';
import OneWayFollowing from '@/components/OneWayFollowing';
import OneWayFollowers from '@/components/OneWayFollowers';
import ProfileRecommendations from '@/components/ProfileRecommendations';
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

type Page = 'home' | 'dashboard' | 'stats' | 'management' | 'followers' | 'following' | 'mutual' | 'one-way-followers' | 'one-way-following' | 'recommendations';

export default function Home() {
  const { chainId, accounts, isConnected } = useWallet();
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stats' | 'management' | 'recommendations'>('dashboard');
  const [userProfile, setUserProfile] = useState<LSP3ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  
  // Create profile manager instance only once
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

  // Handle navigation from dashboard cards
  const handleDashboardNavigation = (target: Page) => {
    if (target) {
      setCurrentPage(target);
      
      // Make sure to set the corresponding activeTab for recommendations
      if (target === 'recommendations') {
        setActiveTab('recommendations');
      }
    }
  };

  useEffect(() => {
    // If user is not connected and tried to access dashboard pages, redirect to home
    if (!isConnected && currentPage !== 'home') {
      setCurrentPage('home');
    }
    
    // Fetch user profile when connected
    if (isConnected && accounts[0]) {
      fetchUserProfile();
    }
  }, [isConnected, currentPage, accounts, fetchUserProfile]);

  // Dashboard Page Content
  const renderDashboardContent = () => {
    if (!isConnected) {
      return (
        <div className="bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="animate-pulse mb-6">
            <div className="w-16 h-16 mx-auto bg-gray-200 rounded-full flex items-center justify-center">
              <FaUsers className="text-gray-400 text-2xl" />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Connect to View Your Follower Analytics</h2>
          <p className="text-gray-600 mb-4">
            Please connect your LUKSO Universal Profile using the UP Browser Extension to access the dashboard and view your follower analytics.
          </p>
          <p className="text-sm text-gray-500 mt-4 border-t border-gray-200 pt-4">
            This application provides detailed analytics for your Universal Profile followers while respecting your privacy. 
            We only store anonymous historical follower data with a 60-day retention period.
          </p>
        </div>
      );
    }

  return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Follower Analytics</h1>
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
              <span className="text-sm font-mono truncate max-w-[180px]">
                {userProfile?.name || accounts[0]}
              </span>
            </div>
          </div>

          {/* Main nav tabs */}
          {currentPage === 'dashboard' || currentPage === 'stats' || currentPage === 'management' || currentPage === 'recommendations' ? (
            <>
              <div className="flex overflow-x-auto border-b border-gray-200 mb-6">
                <button
                  className={`px-4 py-2 font-medium text-sm flex items-center whitespace-nowrap ${
                    activeTab === 'dashboard' 
                      ? 'border-b-2 border-[#FF2975] text-[#FF2975]' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => {
                    setActiveTab('dashboard');
                    setCurrentPage('dashboard');
                  }}
                >
                  <FaTachometerAlt className="mr-2" />
                  Overview
                </button>
                <button
                  className={`px-4 py-2 font-medium text-sm flex items-center whitespace-nowrap ${
                    activeTab === 'stats' 
                      ? 'border-b-2 border-[#FF2975] text-[#FF2975]' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => {
                    setActiveTab('stats');
                    setCurrentPage('stats');
                  }}
                >
                  <FaChartBar className="mr-2" />
                  Statistics
                </button>
                <button
                  className={`px-4 py-2 font-medium text-sm flex items-center whitespace-nowrap ${
                    activeTab === 'management' 
                      ? 'border-b-2 border-[#FF2975] text-[#FF2975]' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => {
                    setActiveTab('management');
                    setCurrentPage('management');
                  }}
                >
                  <FaUsers className="mr-2" />
                  Follower Management
                </button>
                <button
                  className={`px-4 py-2 font-medium text-sm flex items-center whitespace-nowrap ${
                    activeTab === 'recommendations' 
                      ? 'border-b-2 border-[#FF2975] text-[#FF2975]' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => {
                    setActiveTab('recommendations');
                    setCurrentPage('recommendations');
                  }}
                >
                  <FaUserPlus className="mr-2" />
                  Recommendations
                </button>
              </div>

              <main className="pb-8 space-y-8">
                {activeTab === 'dashboard' && <Dashboard onNavigate={handleDashboardNavigation} />}
                {activeTab === 'stats' && <FollowerStats />}
                {activeTab === 'management' && <FollowerManagement />}
                {activeTab === 'recommendations' && <ProfileRecommendations />}
              </main>
            </>
          ) : (
            // Specific profile listing pages
            <>
              <div className="flex overflow-x-auto border-b border-gray-200 mb-6">
                <button
                  className="px-4 py-2 font-medium text-sm flex items-center whitespace-nowrap text-gray-500 hover:text-gray-700"
                  onClick={() => {
                    setCurrentPage('dashboard');
                    setActiveTab('dashboard');
                  }}
                >
                  <FaArrowLeft className="mr-2" />
                  Back to Overview
                </button>
              </div>

              <main className="pb-8 space-y-8">
                {currentPage === 'followers' && <Followers />}
                {currentPage === 'following' && <Following />}
                {currentPage === 'one-way-followers' && <OneWayFollowers />}
                {currentPage === 'one-way-following' && <OneWayFollowing />}
              </main>
            </>
          )}
        </div>

        <footer className="bg-white border-t border-gray-200 mt-auto">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <p className="text-center text-gray-500 text-sm">
              Decentralized platform for follower analytics and management on the LUKSO blockchain
            </p>
          </div>
        </footer>
      </div>
    );
  };

  // Home Page Content
  const renderHomeContent = () => {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        <main className="flex-grow">
          <section className="bg-gradient-to-b from-white to-gray-50 py-16 md:py-24">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-3xl mx-auto">
                <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                  Follower Analytics & Recommendation System
                </h1>
                <p className="text-xl text-gray-700 mb-8">
                  Discover and manage your LUKSO universal profile followers with blockchain-based accuracy. Track follower growth, manage connections, and receive personalized recommendations.
                </p>
                <div className="flex justify-center gap-4">
                  {isConnected ? (
                    <button
                      onClick={() => setCurrentPage('dashboard')}
                      className="bg-[#FF2975] hover:bg-[#FF1365] text-white font-medium py-2 px-5 rounded-lg transition duration-150 ease-in-out"
                    >
                      View Dashboard
                    </button>
                  ) : (
                    <div className="text-center bg-yellow-50 border border-yellow-400 p-3 rounded-lg max-w-xs">
                      <p className="text-base text-yellow-800 font-medium mb-1">Connect Your Universal Profile</p>
                      <p className="text-xs text-yellow-700">
                        Please connect your LUKSO Universal Profile to access this application.
                      </p>
                    </div>
                  )}
                  <a 
                    href="https://docs.lukso.tech/standards/accounts/lsp26-follower-system" 
            target="_blank"
            rel="noopener noreferrer"
                    className="bg-white hover:bg-gray-100 text-gray-800 font-medium py-2 px-4 text-sm rounded-lg border border-gray-300 transition duration-150 ease-in-out"
                  >
                    Learn About LSP26
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section className="py-16 bg-white">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="bg-gradient-to-br from-pink-50 to-purple-50 p-6 rounded-xl shadow-sm">
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">Follower Analytics</h3>
                  <p className="text-gray-700">
                    Visualize your follower growth with blockchain-based accurate statistics. Track mutual connections and gain detailed insights.
                  </p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-teal-50 p-6 rounded-xl shadow-sm">
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">Follower Management</h3>
                  <p className="text-gray-700">
                    Easily manage your followers and following. Follow back your followers and unfollow inactive accounts with a simple interface.
                  </p>
                </div>
                <div className="bg-gradient-to-br from-yellow-50 to-orange-50 p-6 rounded-xl shadow-sm">
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">Profile Recommendations</h3>
                  <p className="text-gray-700">
                    Discover new profiles to follow based on your mutual connections. Expand your network with personalized recommendations.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="py-16 bg-gray-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="max-w-3xl mx-auto text-center">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">About This Project</h2>
                <p className="text-lg text-gray-700 mb-8">
                  This application uses the LSP26 Universal Profile Follow standard on the LUKSO blockchain to provide accurate and decentralized follower analytics. All data is retrieved directly from the blockchain to ensure transparency and accuracy.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12 text-left">
                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    <div className="flex items-center mb-4">
                      <FaLock className="text-[#FF2975] mr-3 text-xl" />
                      <h3 className="text-xl font-semibold text-gray-900">Data Security</h3>
                    </div>
                    <p className="text-gray-700">
                      Your on-chain data is accessed directly through the LUKSO blockchain. We never store your private keys or request permissions beyond what's needed to display your follower data.
                    </p>
                  </div>
                  
                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    <div className="flex items-center mb-4">
                      <FaDatabase className="text-[#FF2975] mr-3 text-xl" />
                      <h3 className="text-xl font-semibold text-gray-900">Data Storage</h3>
                    </div>
                    <p className="text-gray-700">
                      We store limited follower statistics in a secure Supabase database for historical tracking:
                    </p>
                    <ul className="text-gray-700 mt-2 space-y-1 list-disc list-inside">
                      <li>Daily follower, following, and mutual connection counts</li>
                      <li>Timestamp information for trend analysis</li>
                      <li>Data is kept for 60 days, then automatically deleted</li>
                      <li>No personal data or blockchain keys are ever stored</li>
                    </ul>
                  </div>
                  
                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    <div className="flex items-center mb-4">
                      <FaChartLine className="text-[#FF2975] mr-3 text-xl" />
                      <h3 className="text-xl font-semibold text-gray-900">Analytics Benefits</h3>
                    </div>
                    <p className="text-gray-700">
                      This historical data enables valuable features:
                    </p>
                    <ul className="text-gray-700 mt-2 space-y-1 list-disc list-inside">
                      <li>Daily follower change tracking</li>
                      <li>Growth trend visualization</li>
                      <li>Performance metrics for your Universal Profile</li>
                    </ul>
                  </div>
                  
                  <div className="bg-white p-6 rounded-xl shadow-sm">
                    <div className="flex items-center mb-4">
                      <FaTachometerAlt className="text-[#FF2975] mr-3 text-xl" />
                      <h3 className="text-xl font-semibold text-gray-900">Performance</h3>
                    </div>
                    <p className="text-gray-700">
                      Our application is optimized for speed and efficiency:
                    </p>
                    <ul className="text-gray-700 mt-2 space-y-1 list-disc list-inside">
                      <li>Caches blockchain data to minimize API calls</li>
                      <li>Uses efficient algorithms for follower analysis</li>
                      <li>Implements batch processing for following/unfollowing</li>
                      <li>Provides real-time updates when your data changes</li>
                    </ul>
                  </div>
                </div>
                
                <div className="flex justify-center items-center space-x-4 mt-12">
                  <div className="flex items-center">
                    <span className="text-gray-700 mr-2">Chain ID:</span>
                    <span className="px-3 py-1 bg-gray-200 rounded-full text-gray-800 font-medium">
                      {chainId || 'Not connected'}
                    </span>
                  </div>
                  {isConnected && accounts[0] && (
                    <div className="flex items-center">
                      <span className="text-gray-700 mr-2">Profile:</span>
                      <span className="flex items-center px-3 py-1 bg-gray-200 rounded-full text-gray-800 font-medium">
                        {userProfile && userProfile.avatar ? (
                          <ImageWithFallback
                            src={userProfile.avatar}
                            alt="Profile"
              width={20}
              height={20}
                            className="rounded-full mr-2"
                          />
                        ) : (
                          <div className="w-5 h-5 bg-gray-300 rounded-full mr-2 flex items-center justify-center">
                            <span className="text-xs">UP</span>
                          </div>
                        )}
                        <span className="font-medium text-sm">
                          {userProfile?.name || accounts[0].substring(0, 8) + '...'}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
        </div>
          </section>
      </main>

        <footer className="bg-gray-900 text-white py-8">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="mb-4 md:mb-0">
                <p className="text-sm text-gray-400">
                  Created by <a href="https://universaleverything.io/0xbaddbbfc8529bf6b891e3b6b7dd781aad96c5dc7?assetGroup=grid" target="_blank" rel="noopener noreferrer" className="text-[#FF2975] hover:underline">BraveUniverse</a>
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <a 
                  href="https://lukso.network/" 
          target="_blank"
          rel="noopener noreferrer"
                  className="text-sm text-gray-400 hover:text-white transition duration-150 ease-in-out"
                >
                  LUKSO Network
        </a>
        <a
                  href="https://docs.lukso.tech/" 
          target="_blank"
          rel="noopener noreferrer"
                  className="text-sm text-gray-400 hover:text-white transition duration-150 ease-in-out"
                >
                  LUKSO Docs
                </a>
              </div>
            </div>
          </div>
      </footer>
    </div>
    );
  };

  // Main app renderer based on current page
  return (
    <>
      {currentPage === 'home' ? renderHomeContent() : renderDashboardContent()}
    </>
  );
}
