'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { LSP26FollowerSystem } from '@/lib/lsp26';
import { LSP3ProfileManager, LSP3ProfileData } from '@/lib/lsp3';
import { provider } from '@/lib/up-provider';
import { db } from '@/lib/supabase';
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

// Background image component with fallback
const BackgroundImageWithFallback = ({ src, ...props }: any) => {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className={`bg-gradient-to-r from-gray-200 to-gray-100 ${props.className}`} />
    );
  }

  return (
    <div 
      className={props.className}
      style={{ 
        backgroundImage: `url(${src})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
      onError={() => setError(true)}
    />
  );
};

interface RecommendedProfile {
  address: string;
  profile?: LSP3ProfileData;
  score: number;
  reason: string;
  mutualFollowers?: number;
  mutualFollowerSources?: Array<{
    address: string;
    profile?: LSP3ProfileData;
  }>;
  isSelected?: boolean;
}

export default function ProfileRecommendations() {
  const { accounts, isConnected } = useWallet();
  const [recommendations, setRecommendations] = useState<RecommendedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<LSP3ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [processingAddress, setProcessingAddress] = useState<string | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // New state for selected profiles
  const selectedProfiles = useMemo(() => {
    return recommendations.filter(rec => rec.isSelected).map(rec => rec.address);
  }, [recommendations]);
  
  // Create instances only once
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

  // Handle manual refresh
  const handleRefresh = () => {
    setRecommendations([]);
    setRefreshing(true);
    
    // Start the refresh process
    generateRecommendations()
      .finally(() => {
        // Ensure refreshing state is reset even if there's an error
        setRefreshing(false);
      });
  };

  // Öneri kartına tıklandığında takip durumunu kontrol et
  const handleProfileCardClick = async (address: string) => {
    if (!isConnected || !accounts[0]) return;
    
    try {
      // Takip durumunu kontrol et
      const isFollowing = await followerSystem.isFollowing(accounts[0], address);
      if (isFollowing) {
        toast.success(`You're already following this profile`);
        // Önerilerden kaldır
        setRecommendations(prev => prev.filter(rec => rec.address !== address));
      }
    } catch (error) {
      console.warn(`Error checking follow status for ${address}:`, error);
    }
  };

  // Rastgele öneri oluşturma fonksiyonu - takipçisi olmayan kullanıcılar için
  const generateRandomRecommendations = async () => {
    if (!isConnected || !accounts[0]) return;
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('Generating random profile recommendations...');

      // Mevcut takip listesini al (önerilerde bunları çıkarmak için)
      let existingFollowing: `0x${string}`[] = [];
      let hasMoreFollowing = true;
      let followingPage = 0;
      const batchSize = 100; 
      
      while (hasMoreFollowing) {
        const followingBatch = await followerSystem.getFollowing(accounts[0], followingPage * batchSize);
        existingFollowing = [...existingFollowing, ...followingBatch];
        
        hasMoreFollowing = followingBatch.length === batchSize;
        if (hasMoreFollowing) {
          followingPage++;
        }
      }
      
      const followingSet = new Set(existingFollowing.map(addr => addr.toLowerCase()));
      console.log(`Found ${existingFollowing.length} following profiles to exclude from recommendations`);
      
      // Genişletilmiş veri kaynağı stratejisi:
      // 1. Önce veritabanından tüm benzersiz adresleri çek
      // 2. Takip edilen adresler hariç
      
      // Veritabanından rastgele profiller al
      const randomProfiles = await db.followers.getRandomProfiles(150, accounts[0]);
      
      if (!randomProfiles || randomProfiles.length === 0) {
        setError('No profiles found to create recommendations.');
        setLoading(false);
        return;
      }
      
      console.log(`Retrieved ${randomProfiles.length} random profiles from database`);
      
      // Takip edilen profilleri çıkar
      const filteredProfiles = randomProfiles.filter(
        p => !followingSet.has(p.address.toLowerCase()) && 
             p.address.toLowerCase() !== accounts[0].toLowerCase()
      );
      
      console.log(`Filtered to ${filteredProfiles.length} profiles after removing followed profiles`);
      
      // Rastgele profilleri karıştır
      const shuffled = [...filteredProfiles]
        .sort(() => 0.5 - Math.random()) // Fisher-Yates shuffle
        .slice(0, 50); // Daha fazla aday al, sonra filtreleyeceğiz
      
      // Profil bilgilerini al ve önerileri formatla
      const recommendationsList: RecommendedProfile[] = [];
      
      for (const {address} of shuffled) {
        try {
          // Takip durumunu blockchain'den doğrula
          const isAlreadyFollowing = await followerSystem.isFollowing(accounts[0], address);
          if (isAlreadyFollowing) {
            console.log(`Skipping random profile ${address} - already following (blockchain verification)`);
            continue;
          }
          
          let profile: LSP3ProfileData | undefined = undefined;
          try {
            const profileData = await profileManager.getProfileData(address);
            if (profileData) {
              profile = profileData;
            }
          } catch (profileError) {
            console.warn(`Could not fetch profile for ${address}:`, profileError);
          }
          
          // Rastgele bir puan ver (60-95 arası)
          const randomScore = Math.floor(Math.random() * 36) + 60;
          
          recommendationsList.push({
            address,
            profile,
            score: randomScore,
            reason: 'Trending profile on LUKSO network',
            mutualFollowers: 0,
            mutualFollowerSources: []
          });
          
          // Yeterli sayıda öneri oluşturulduğunda dur
          if (recommendationsList.length >= 25) {
            break;
          }
        } catch (error) {
          console.error(`Error processing random recommendation ${address}:`, error);
        }
      }
      
      console.log(`Generated ${recommendationsList.length} random recommendations`);
      setRecommendations(recommendationsList);
      
    } catch (error) {
      console.error('Error generating random recommendations:', error);
      setError('Failed to generate recommendations. Please try again later.');
    } finally {
      setLoading(false);
    }
  };
  
  // Generate recommendations based on user's network
  const generateRecommendations = useCallback(async () => {
    if (!isConnected || !accounts[0]) return;

    try {
      setLoading(true);
      setError(null);
      
      console.log('Generating profile recommendations...');
      
      // 1. Get followers and following with complete pagination
      let allFollowers: `0x${string}`[] = [];
      let allFollowing: `0x${string}`[] = [];
      
      // Tüm takipçileri al
      let hasMoreFollowers = true;
      let followerPage = 0;
      const batchSize = 100; // Blockchain'den her seferde kaç takipçi alınacağı
      
      while (hasMoreFollowers) {
        const followersBatch = await followerSystem.getFollowers(accounts[0], followerPage * batchSize);
        allFollowers = [...allFollowers, ...followersBatch];
        
        // Bir sonraki batch için kontrol
        hasMoreFollowers = followersBatch.length === batchSize;
        if (hasMoreFollowers) {
          followerPage++;
        }
      }
      
      // Tüm takip edilenleri al
      let hasMoreFollowing = true;
      let followingPage = 0;
      
      while (hasMoreFollowing) {
        const followingBatch = await followerSystem.getFollowing(accounts[0], followingPage * batchSize);
        allFollowing = [...allFollowing, ...followingBatch];
        
        // Bir sonraki batch için kontrol
        hasMoreFollowing = followingBatch.length === batchSize;
        if (hasMoreFollowing) {
          followingPage++;
        }
      }
      
      // Convert to Sets for faster lookups
      const followerSet = new Set(allFollowers.map(addr => addr.toLowerCase()));
      const followingSet = new Set(allFollowing.map(addr => addr.toLowerCase()));
      
      console.log(`Found ${allFollowers.length} followers and ${allFollowing.length} following`);
      
      // Eğer kullanıcının takipçisi veya takip ettiği kimse yoksa rastgele öneriler suna
      if (allFollowers.length === 0 && allFollowing.length === 0) {
        await generateRandomRecommendations();
        return;
      }
      
      // 2. Find mutual followers (profiles that follow you and you follow them)
      const mutualFollowers = allFollowers.filter(address => 
        followingSet.has(address.toLowerCase())
      );
      console.log(`Found ${mutualFollowers.length} mutual followers`);
      
      // Öneri havuzunu genişlet - karşılıklı takipçiler, takipçiler ve takip edilenlerden al
      // 3. For each connection, get their following list to find candidate recommendations
      const candidateProfiles = new Map<string, { mutualCount: number, sources: string[] }>();
      
      // Genişletilmiş network:
      const extendedNetwork = [
        ...mutualFollowers.slice(0, 20), // En önemli: karşılıklı takipleşmeler
        ...allFollowers.slice(0, 20),    // Takipçiler
        ...allFollowing.slice(0, 20)     // Takip edilenler
      ];
      
      console.log(`Using ${extendedNetwork.length} connections to find recommendations`);
      
      // Her bir bağlantının takip ettiği ve takipçilerini incele
      for (const networkAddress of extendedNetwork) {
        try {
          // Network'teki her adresin takip ettiklerini al
          const networkFollowing = await followerSystem.getFollowing(networkAddress);
          
          for (const potentialAddress of networkFollowing) {
            // Skip if it's the user themselves, or already followed
            if (
              potentialAddress.toLowerCase() === accounts[0].toLowerCase() ||
              followingSet.has(potentialAddress.toLowerCase())
            ) {
              continue;
            }
            
            const existingData = candidateProfiles.get(potentialAddress) || { mutualCount: 0, sources: [] };
            existingData.mutualCount += 1;
            // Adresi array olarak ekliyoruz, set yerine (tekrarlar olabilir)
            if (!existingData.sources.includes(networkAddress)) {
              existingData.sources.push(networkAddress);
            }
            candidateProfiles.set(potentialAddress, existingData);
          }
          
          // Bonus: Network'teki her adresin takipçilerini de al (daha geniş bir ağa erişim)
          const networkFollowers = await followerSystem.getFollowers(networkAddress);
          
          for (const potentialAddress of networkFollowers) {
            // Skip if it's the user themselves, or already followed 
            if (
              potentialAddress.toLowerCase() === accounts[0].toLowerCase() ||
              followingSet.has(potentialAddress.toLowerCase())
            ) {
              continue;
            }
            
            const existingData = candidateProfiles.get(potentialAddress) || { mutualCount: 0, sources: [] };
            existingData.mutualCount += 1;
            // Adresi array olarak ekliyoruz, set yerine (tekrarlar olabilir)
            if (!existingData.sources.includes(networkAddress)) {
              existingData.sources.push(networkAddress);
            }
            candidateProfiles.set(potentialAddress, existingData);
          }
        } catch (error) {
          console.warn(`Error getting extended network from ${networkAddress}:`, error);
        }
      }
      
      console.log(`Found ${candidateProfiles.size} candidate profiles for recommendations`);
      
      // Eğer aday profiller 0 ise rastgele öneriler sun
      if (candidateProfiles.size === 0) {
        await generateRandomRecommendations();
        return;
      }
      
      // 4. Sort and select top recommendations
      const sortedCandidates = Array.from(candidateProfiles.entries())
        .sort((a, b) => b[1].mutualCount - a[1].mutualCount)
        .slice(0, 50); // Get top 50 candidates (daha fazla aday alıyoruz, filtreleme sonrası 25'e düşecek)
      
      // 5. Fetch profile data for top candidates
      const recommendationsList: RecommendedProfile[] = [];
      
      // Takip edilen adresleri tekrar kontrol et (race condition'ları önlemek için)
      let currentFollowing: `0x${string}`[] = [];
      try {
        // Takip edilen profilleri tekrar kontrol et (son durumu almak için)
        let hasMoreFollowing = true;
        let followingPage = 0;
        const batchSize = 100;
        
        while (hasMoreFollowing) {
          const followingBatch = await followerSystem.getFollowing(accounts[0], followingPage * batchSize);
          currentFollowing = [...currentFollowing, ...followingBatch];
          
          hasMoreFollowing = followingBatch.length === batchSize;
          if (hasMoreFollowing) {
            followingPage++;
          }
        }
        
        console.log(`Re-verified current following list: ${currentFollowing.length} profiles`);
      } catch (error) {
        console.warn('Error re-verifying following list:', error);
        // Hata olursa mevcut listeyi kullan
        currentFollowing = allFollowing;
      }
      
      // Güncel takip listesi
      const currentFollowingSet = new Set(currentFollowing.map(addr => addr.toLowerCase()));
      
      for (const [address, data] of sortedCandidates) {
        try {
          // Önce local cache'den kontrol et (daha hızlı)
          if (currentFollowingSet.has(address.toLowerCase())) {
            console.log(`Skipping ${address} - already following (from local cache)`);
            continue;
          }
          
          // Takip kontrol doğrulaması (blockchain'den)
          const alreadyFollowing = await followerSystem.isFollowing(accounts[0], address);
          
          // Zaten takip ediliyorsa atla
          if (alreadyFollowing) {
            console.log(`Skipping ${address} - already following (from blockchain verification)`);
            continue;
          }
          
          let profile: LSP3ProfileData | undefined = undefined;
          try {
            const profileData = await profileManager.getProfileData(address);
            if (profileData) {
              profile = profileData;
            }
          } catch (profileError) {
            console.warn(`Could not fetch profile for ${address}:`, profileError);
          }
          
          // Öneri kaynağı metni - Daha detaylı hale getirildi
          let reason = '';
          const mutualFollowerPercent = Math.round((data.mutualCount / extendedNetwork.length) * 100);
          
          if (mutualFollowerPercent > 70) {
            reason = `Highly popular profile in your network. ${data.mutualCount} of your connections follow this profile.`;
          } else if (mutualFollowerPercent > 50) {
            reason = `Popular profile among your connections. Followed by ${Math.round(mutualFollowerPercent)}% of your network.`;
          } else if (mutualFollowerPercent > 30) {
            reason = `Recommended by several mutual connections. ${data.mutualCount} connections in common.`;
          } else if (data.mutualCount > 0) {
            reason = `Followed by ${data.mutualCount} of your connections.`;
          } else {
            reason = 'Growing profile in the LUKSO ecosystem.';
          }
          
          // Öneri skoru - Önem faktörleri eklendi
          const networkSizeWeight = 0.7; // Ortak bağlantı sayısı daha önemli
          const recentActivityWeight = 0.3; // Yakın zamanda eklenen profil ise bonus
          
          // Temel skor: Ortak bağlantı yüzdesi
          let weightedScore = mutualFollowers.length > 0 
            ? Math.round((data.mutualCount / extendedNetwork.length) * 100 * networkSizeWeight)
            : Math.floor(Math.random() * 36) + 60;
          
          // Yakın zamanda eklenmiş profillere bonus (örn. son 20 profil)
          const isRecentProfile = sortedCandidates.indexOf([address, data]) < 20;
          if (isRecentProfile) {
            weightedScore += Math.round(20 * recentActivityWeight); // %20 bonus
          }
          
          // Skor sınırlaması
          weightedScore = Math.min(98, Math.max(50, weightedScore));
          
          // Ortak bağlantıların profil bilgilerini al 
          const sourcesWithProfiles = await Promise.all(
            data.sources.slice(0, 10).map(async (sourceAddress) => {
              try {
                const profile = await profileManager.getProfileData(sourceAddress);
                return { 
                  address: sourceAddress,
                  profile: profile || undefined
                };
              } catch (error) {
                console.warn(`Could not fetch profile for source ${sourceAddress}:`, error);
                return { address: sourceAddress };
              }
            })
          );
          
          recommendationsList.push({
            address,
            profile,
            score: weightedScore,
            reason,
            mutualFollowers: data.mutualCount,
            mutualFollowerSources: sourcesWithProfiles
          });
        } catch (error) {
          console.error(`Error processing recommendation ${address}:`, error);
        }
      }
      
      console.log(`Generated ${recommendationsList.length} network recommendations`);
      
      // Eğer 5'ten az öneri varsa, rastgele önerilerle tamamla
      if (recommendationsList.length < 5) {
        await generateRandomRecommendations();
        return;
      }
      
      // Son önerileri ayarla
      setRecommendations(recommendationsList);
      
    } catch (error) {
      console.error('Error generating recommendations:', error);
      setError('Failed to generate recommendations. Please try again later.');
      
      // Fallback olarak rastgele öneriler sun
      await generateRandomRecommendations();
    } finally {
      setLoading(false);
    }
  }, [accounts, isConnected, followerSystem, profileManager]);

  // Handle follow action
  const handleFollow = async (address: string) => {
    if (!isConnected || !accounts[0]) return;
    
    try {
      setProcessingAddress(address);
      toast.loading(`Following ${address}...`, { id: 'follow-toast' });
      
      // Takip etmeden önce son bir kontrol daha yap
      const isAlreadyFollowing = await followerSystem.isFollowing(accounts[0], address);
      if (isAlreadyFollowing) {
        toast.success(`You're already following this profile`, { id: 'follow-toast' });
        // Önerilerden kaldır
        setRecommendations(prev => prev.filter(rec => rec.address !== address));
        return;
      }
      
      await followerSystem.follow(address);
      
      // Remove from recommendations after following
      setRecommendations(prev => prev.filter(rec => rec.address !== address));
      
      toast.success('Followed successfully!', { id: 'follow-toast' });
    } catch (error) {
      console.error('Error following:', error);
      toast.error('Failed to follow profile.', { id: 'follow-toast' });
    } finally {
      setProcessingAddress(null);
    }
  };

  // Skip recommendation
  const handleSkip = (address: string) => {
    setRecommendations(prev => prev.filter(rec => rec.address !== address));
  };

  // Toggle selection for a single profile
  const toggleProfileSelection = (address: string) => {
    setRecommendations(prevRecs => 
      prevRecs.map(rec => 
        rec.address === address ? { ...rec, isSelected: !rec.isSelected } : rec
      )
    );
  };

  // Toggle selection for all profiles
  const toggleSelectAll = () => {
    // Önce tüm takip edilmemiş profilleri kontrol et
    setLoading(true);
    
    // Zaten takip edilen profilleri kontrol et ve sadece takip edilmeyenleri seç
    Promise.all(
      recommendations.map(async (rec) => {
        if (!isConnected || !accounts[0]) return { address: rec.address, isFollowing: false };
        const isAlreadyFollowing = await followerSystem.isFollowing(accounts[0], rec.address);
        return { address: rec.address, isFollowing: isAlreadyFollowing };
      })
    )
    .then((followStatus) => {
      // Takip edilmeyen profiller için haritayı oluştur
      const followStatusMap = new Map(
        followStatus.map((status) => [status.address, status.isFollowing])
      );
      
      // Geçerli seçim durumunu kontrol et (varsayılan olarak true, en az bir öğe seçilmediyse)
      const hasUnselected = recommendations.some(rec => !rec.isSelected && !followStatusMap.get(rec.address));
      
      // Sadece takip edilmeyen profilleri güncelle
      setRecommendations(prevRecs => 
        prevRecs.map(rec => {
          const isFollowing = followStatusMap.get(rec.address);
          // Eğer zaten takip ediliyorsa, seçimi kaldır
          if (isFollowing) {
            return { ...rec, isSelected: false };
          }
          // Değilse, seçim durumunu güncelle
          return { ...rec, isSelected: hasUnselected };
        })
      );
    })
    .finally(() => {
      setLoading(false);
    });
  };

  // Handle bulk follow action
  const handleBulkFollow = async () => {
    if (!isConnected || !accounts[0] || selectedProfiles.length === 0) return;
    
    try {
      setBulkProcessing(true);
      toast.loading(`Following ${selectedProfiles.length} profiles...`, { id: 'bulk-follow-toast' });
      
      // Seçilen profilleri takip etmeden önce son bir kontrol daha yap
      const validProfilesToFollow: string[] = [];
      
      // Her bir profil için takip durumunu kontrol et
      for (const address of selectedProfiles) {
        const isAlreadyFollowing = await followerSystem.isFollowing(accounts[0], address);
        if (!isAlreadyFollowing) {
          validProfilesToFollow.push(address);
        } else {
          console.log(`Skipping ${address} from bulk follow - already following`);
        }
      }
      
      if (validProfilesToFollow.length === 0) {
        toast.success('All selected profiles are already being followed', { id: 'bulk-follow-toast' });
        // Önerileri güncelle
        setRecommendations(prev => prev.filter(rec => !selectedProfiles.includes(rec.address)));
        return;
      }
      
      await followerSystem.followMany(validProfilesToFollow);
      
      // Remove followed profiles from recommendations
      setRecommendations(prev => prev.filter(rec => !selectedProfiles.includes(rec.address)));
      
      toast.success(`Successfully followed ${validProfilesToFollow.length} profiles!`, { id: 'bulk-follow-toast' });
    } catch (error) {
      console.error('Error bulk following:', error);
      toast.error('Failed to follow profiles. Please try again.', { id: 'bulk-follow-toast' });
    } finally {
      setBulkProcessing(false);
    }
  };

  useEffect(() => {
    // Fetch data when component mounts
    let isMounted = true;

    // Only fetch if connected
    if (isConnected && accounts[0]) {
      generateRecommendations();
      fetchUserProfile();
    }

    // Listen for account changes
    if (provider) {
      const providerInstance = provider;
      
      const handleAccountsChanged = () => {
        console.log('Account changed, refreshing recommendations...');
        if (isMounted) {
          setRecommendations([]);
          generateRecommendations();
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
  }, [isConnected, accounts, generateRecommendations, fetchUserProfile]);

  if (!isConnected) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 text-center">
        <p className="text-gray-500">Please connect your wallet to see recommendations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Profile Recommendations</h1>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className={`px-4 py-2 text-sm rounded ${
              refreshing || loading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-[#FF2975] text-white hover:bg-[#FF1365]'
            }`}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
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
            <h2 className="text-xl font-semibold text-gray-800">Profiles You Might Want to Follow</h2>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-[#FF2975]">{recommendations.length}</span> recommendations
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
            <button 
              onClick={() => {
                setError(null);
                generateRecommendations();
              }}
              className="mt-2 text-sm font-medium text-red-700 hover:text-red-600"
            >
              Try Again
            </button>
          </div>
        )}

        {recommendations.length > 0 && !loading && (
          <div className="p-4 bg-gray-50 border-b border-gray-200">
            <div className="flex flex-wrap justify-between items-center">
              <div className="flex items-center space-x-2 mb-2 sm:mb-0">
                <input
                  type="checkbox"
                  checked={recommendations.length > 0 && recommendations.every(rec => rec.isSelected)}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 text-[#FF2975] rounded border-gray-300 focus:ring-[#FF2975]"
                />
                <span className="text-sm font-medium text-gray-700">
                  Select All ({recommendations.length})
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">
                  {selectedProfiles.length} selected
                </span>
                <button
                  onClick={handleBulkFollow}
                  disabled={selectedProfiles.length === 0 || bulkProcessing}
                  className={`px-4 py-2 text-sm rounded transition-colors ${
                    selectedProfiles.length === 0 || bulkProcessing
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-[#FF2975] text-white hover:bg-[#FF1365]'
                  }`}
                >
                  {bulkProcessing ? 'Processing...' : `Follow Selected (${selectedProfiles.length})`}
                </button>
              </div>
            </div>
          </div>
        )}

        <div>
          {loading ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF2975] mx-auto"></div>
              <p className="mt-4 text-gray-500">Generating recommendations...</p>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-500">
                No recommendations available. Try following more profiles or refresh.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
              {recommendations.map((recommendation) => (
                <div 
                  key={recommendation.address}
                  className={`bg-white border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all ${
                    recommendation.isSelected ? 'border-[#FF2975] ring-1 ring-[#FF2975] transform scale-[1.02]' : 'border-gray-200'
                  }`}
                  onClick={() => handleProfileCardClick(recommendation.address)}
                >
                  {/* Profile Card Header with Background */}
                  <BackgroundImageWithFallback
                    src={recommendation.profile?.backgroundImage}
                    className="h-24 w-full"
                  />
                  
                  <div className="p-4 relative">
                    {/* Profile Avatar - Positioned over the background */}
                    <div className="absolute -top-12 left-4 ring-4 ring-white rounded-full shadow-md">
                      <a 
                        href={`https://universaleverything.io/${recommendation.address}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="block"
                      >
                        {recommendation.profile && recommendation.profile.avatar ? (
                          <ImageWithFallback
                            src={recommendation.profile.avatar}
                            alt={recommendation.profile.name || "Profil"}
                            width={70}
                            height={70}
                            className="rounded-full hover:ring-2 hover:ring-[#FF2975] object-cover"
                          />
                        ) : (
                          <div className="w-[70px] h-[70px] rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300">
                            <span className="text-sm text-gray-500">No Image</span>
                          </div>
                        )}
                      </a>
                    </div>
                    
                    {/* Selection Checkbox - Top right */}
                    <div className="absolute top-2 right-2">
                      <input
                        type="checkbox"
                        checked={recommendation.isSelected || false}
                        onChange={() => toggleProfileSelection(recommendation.address)}
                        className="h-5 w-5 text-[#FF2975] rounded border-gray-300 focus:ring-[#FF2975]"
                      />
                    </div>
                    
                    {/* Profile Info - With appropriate spacing for avatar */}
                    <div className="mt-10">
                      <div className="mb-1 flex justify-between items-start">
                        <div className="w-4/5">
                          <a 
                            href={`https://universaleverything.io/${recommendation.address}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="hover:text-[#FF2975]"
                          >
                            <h3 className="font-semibold text-lg text-gray-900 truncate hover:underline">
                              {recommendation.profile?.name || 'Anonymous Profile'}
                            </h3>
                          </a>
                          <p className="text-xs text-gray-500 truncate">
                            {recommendation.address.substring(0, 8)}...{recommendation.address.substring(36)}
                          </p>
                        </div>
                        
                        <div className="flex items-center bg-gray-100 px-2 py-1 rounded-full">
                          <div className="bg-gray-100 rounded-full h-2 w-12 overflow-hidden">
                            <div className="bg-[#FF2975] h-full" style={{width: `${recommendation.score}%`}}></div>
                          </div>
                          <span className="ml-1 text-xs font-medium text-gray-500">{recommendation.score}%</span>
                        </div>
                      </div>
                      
                      {/* Profile Description */}
                      {recommendation.profile?.description && (
                        <p className="text-sm text-gray-600 mt-2 line-clamp-2 h-10 overflow-hidden">
                          {recommendation.profile.description}
                        </p>
                      )}
                      
                      {/* Tags if available */}
                      {recommendation.profile?.tags && recommendation.profile.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {recommendation.profile.tags.slice(0, 3).map((tag, index) => (
                            <span key={index} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                              {tag}
                            </span>
                          ))}
                          {recommendation.profile.tags.length > 3 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                              +{recommendation.profile.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                      
                      {/* Connection info - Detaylandırılmış kısım */}
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm">
                        <div className="flex items-center mb-1.5">
                          <svg className="h-4 w-4 mr-1 text-blue-700" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 116 0z" clipRule="evenodd" fillRule="evenodd"></path>
                          </svg>
                          <span className="font-medium text-blue-700">
                            {recommendation.mutualFollowers && recommendation.mutualFollowers > 0 ? `Match Score: ${recommendation.score}%` : 'Profile Highlight'}
                          </span>
                        </div>
                        <p className="text-blue-700">{recommendation.reason}</p>
                        
                        {/* Öneri detayları - Hangi ortak bağlantıların takip ettiği */}
                        {recommendation.mutualFollowers && recommendation.mutualFollowers > 0 && recommendation.mutualFollowerSources && (
                          <div className="mt-2">
                            <div className="flex items-center mb-1">
                              <svg className="h-3.5 w-3.5 mr-1 text-blue-700" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                              </svg>
                              <p className="text-blue-700 font-medium">Common connections</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {recommendation.mutualFollowerSources.slice(0, 5).map((source, index) => (
                                <a 
                                  key={index}
                                  href={`https://universaleverything.io/${source.address}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center bg-blue-100 rounded-full overflow-hidden hover:bg-blue-200 transition-colors"
                                  title={source.profile?.name || source.address}
                                >
                                  {/* Profil avatarı */}
                                  {source.profile?.avatar ? (
                                    <div className="h-6 w-6 flex-shrink-0">
                                      <ImageWithFallback
                                        src={source.profile.avatar}
                                        alt={source.profile.name || 'Profile'}
                                        width={24}
                                        height={24}
                                        className="rounded-full object-cover"
                                      />
                                    </div>
                                  ) : (
                                    <div className="h-6 w-6 bg-blue-200 flex items-center justify-center rounded-full flex-shrink-0">
                                      <span className="text-[9px] text-blue-700">UP</span>
                                    </div>
                                  )}
                                  
                                  {/* Profil adı veya adres */}
                                  <span className="px-1.5 py-0.5 text-xs text-blue-800 truncate max-w-[100px]">
                                    {source.profile?.name || `${source.address.substring(0, 4)}...${source.address.substring(40)}`}
                                  </span>
                                </a>
                              ))}
                              {recommendation.mutualFollowerSources.length > 5 && (
                                <div className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 flex items-center">
                                  <span className="mr-1">+{recommendation.mutualFollowerSources.length - 5}</span>
                                  <span className="hidden sm:inline">more</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Öneri tipi bilgisi */}
                        <div className="mt-2 pt-2 border-t border-blue-100 flex justify-between">
                          <span className="text-xs text-blue-700 flex items-center">
                            {recommendation.mutualFollowers && recommendation.mutualFollowers > 0 ? (
                              <>
                                <svg className="h-3 w-3 mr-1 text-blue-700" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                                </svg>
                                <strong className="font-medium">{recommendation.mutualFollowers}</strong>&nbsp;connections in common
                              </>
                            ) : 'Based on network activity'}
                          </span>
                          <span className="text-xs font-medium text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full">
                            {recommendation.score >= 70 ? 'High Match' : recommendation.score >= 40 ? 'Good Match' : 'Suggested'}
                          </span>
                        </div>
                      </div>
                      
                      {/* Links if available */}
                      {recommendation.profile?.links && recommendation.profile.links.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {recommendation.profile.links.slice(0, 2).map((link, index) => (
                            <a 
                              key={index}
                              href={link.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-900 font-semibold hover:bg-gray-200"
                            >
                              <svg className="h-3 w-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path>
                                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path>
                              </svg>
                              {link.title}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex space-x-2 mt-4">
                      <button
                        onClick={() => handleFollow(recommendation.address)}
                        disabled={processingAddress === recommendation.address || bulkProcessing}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg ${
                          processingAddress === recommendation.address || bulkProcessing
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-[#FF2975] text-white hover:bg-[#FF1365]'
                        }`}
                      >
                        {processingAddress === recommendation.address ? 'Processing...' : 'Follow'}
                      </button>
                      <button
                        onClick={() => handleSkip(recommendation.address)}
                        disabled={processingAddress === recommendation.address || bulkProcessing}
                        className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">About Recommendations</h2>
        <p className="text-gray-700">
          These recommendations are intelligently generated based on your network connections on the LUKSO blockchain.
          The system analyzes profiles that your connections follow to discover relevant suggestions for you.
        </p>
        <div className="mt-4 bg-blue-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-blue-800 mb-2">How Recommendations Work</h3>
          <ul className="list-disc list-inside text-sm text-blue-700 space-y-2">
            <li>
              <span className="font-medium">Connection Analysis:</span> We analyze followers and profiles followed by your mutual connections
            </li>
            <li>
              <span className="font-medium">Extended Network:</span> Recommendations include profiles from your mutual connections, followers, and profiles you follow
            </li>
            <li>
              <span className="font-medium">Match Score:</span> The percentage shows how relevant a profile is to your network - higher scores indicate stronger connections
            </li>
            <li>
              <span className="font-medium">Already Followed Check:</span> The system verifies that you don't already follow suggested profiles
            </li>
          </ul>
        </div>
        <p className="mt-4 text-gray-700">
          If you don't have any followers or mutual connections yet, we'll show you trending profiles 
          from the LUKSO blockchain community to help you get started building your network.
        </p>
        <p className="mt-2 text-gray-700">
          You can follow multiple profiles at once by selecting them with the checkboxes and using the "Follow Selected" button.
        </p>
      </div>
    </div>
  );
} 