'use client';

import { publicClient } from './up-provider';
import { ERC725 } from '@erc725/erc725.js';
import LSP3ProfileSchema from '@erc725/erc725.js/schemas/LSP3ProfileMetadata.json';

// IPFS Gateway URLs - Adding gateways recommended by LUKSO
const IPFS_GATEWAYS = [
  'https://api.universalprofile.cloud/ipfs/',
  'https://2eff.lukso.dev/ipfs/',
  'https://ipfs.lukso.network/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/'
];

// LSP3 Profile class
export class LSP3ProfileManager {
  private erc725Config: any;

  constructor() {
    // Standard ERC725 configuration
    this.erc725Config = {
      ipfsGateway: IPFS_GATEWAYS[0]
    };
  }

  // Get profile data
  async getProfileData(address: string): Promise<LSP3ProfileData | null> {
    try {
      if (!address || !address.startsWith('0x')) {
        console.warn('Invalid address:', address);
        return null;
      }

      // Create ERC725 instance
      const erc725 = new ERC725(
        LSP3ProfileSchema as any,
        address as `0x${string}`,
        publicClient?.transport.url || 'https://rpc.lukso.gateway.fm',
        this.erc725Config
      );

      console.debug('LSP3 Profile data fetching:', address);

      // Get profile data
      const profileData = await erc725.fetchData('LSP3Profile');
      
      if (!profileData?.value) {
        console.debug('Profile data not found:', address);
        return null;
      }

      // Format and return profile data
      const formattedProfile = this.formatProfileData(profileData.value);
      console.debug('Profile fetched:', formattedProfile.name || 'Anonymous Profile');
      
      return formattedProfile;
    } catch (error) {
      console.error('Error getting profile data:', error);
      return null;
    }
  }

  // Format LSP3 profile data
  private formatProfileData(profileData: any): LSP3ProfileData {
    // Create empty profile
    const profile: LSP3ProfileData = {
      name: '',
      description: '',
      tags: [],
      links: [],
      avatar: '',
      backgroundImage: ''
    };

    try {
      // Check profile data
      if (!profileData) return profile;

      // Get basic fields
      profile.name = profileData.LSP3Profile?.name || profileData.name || 'Anonymous Profile';
      profile.description = profileData.LSP3Profile?.description || profileData.description || '';
      profile.tags = profileData.LSP3Profile?.tags || profileData.tags || [];

      // Get links
      const links = profileData.LSP3Profile?.links || profileData.links || [];
      profile.links = links.map((link: any) => ({
        title: link.title || 'Link',
        url: link.url || '#'
      }));

      // Get profile image (avatar)
      profile.avatar = this.getImageUrl(
        profileData.LSP3Profile?.profileImage || 
        profileData.profileImage
      );

      // Get background image
      profile.backgroundImage = this.getImageUrl(
        profileData.LSP3Profile?.backgroundImage || 
        profileData.backgroundImage
      );

      return profile;
    } catch (error) {
      console.error('Error formatting profile data:', error);
      return profile;
    }
  }

  // Extract image URL (can be array or direct object)
  private getImageUrl(imageData: any): string {
    try {
      if (!imageData) return '';

      // If array format (old format)
      if (Array.isArray(imageData) && imageData.length > 0) {
        const image = imageData[0];
        if (image?.url) {
          return this.formatIPFSUrl(image.url);
        }
      } 
      // If single object format (new format)
      else if (imageData?.url) {
        return this.formatIPFSUrl(imageData.url);
      }
      // If hash format (IPFS HTTPS access address)
      else if (typeof imageData === 'string' && (
        imageData.startsWith('ipfs://') || 
        imageData.startsWith('https://') ||
        imageData.startsWith('data:')
      )) {
        return this.formatIPFSUrl(imageData);
      }
      
      return '';
    } catch (error) {
      console.error('Error formatting image URL:', error);
      return '';
    }
  }

  // Format IPFS URLs
  private formatIPFSUrl(url: string): string {
    try {
      if (!url) return '';

      // If already in HTTP(S) format
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      
      // If data URI (base64 etc)
      if (url.startsWith('data:')) {
        return url;
      }

      // If IPFS format
      if (url.startsWith('ipfs://')) {
        const ipfsHash = url.replace('ipfs://', '');
        return `${IPFS_GATEWAYS[0]}${ipfsHash}`;
      }

      return url;
    } catch (error) {
      console.error('Error formatting IPFS URL:', error);
      return '';
    }
  }
}

// LSP3 Profile data type
export interface LSP3ProfileData {
  name: string;
  description: string;
  tags: string[];
  links: Array<{
    title: string;
    url: string;
  }>;
  avatar: string;
  backgroundImage: string;
} 