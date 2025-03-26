'use client';

import { provider, walletClient, publicClient } from './up-provider';
import { encodeFunctionData, decodeFunctionResult, type Account } from 'viem';
import { lukso } from 'viem/chains';

// LSP26 Follower System contract address
export const LSP26_CONTRACT_ADDRESS = '0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA';

// LSP26 ABI
const LSP26_ABI = [
  {
    inputs: [
      { name: 'addr', type: 'address' },
      { name: 'startIndex', type: 'uint256' },
      { name: 'endIndex', type: 'uint256' }
    ],
    name: 'getFollowersByIndex',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'addr', type: 'address' },
      { name: 'startIndex', type: 'uint256' },
      { name: 'endIndex', type: 'uint256' }
    ],
    name: 'getFollowsByIndex',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'addr', type: 'address' }],
    name: 'followerCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'addr', type: 'address' }],
    name: 'followingCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'follower', type: 'address' },
      { name: 'addr', type: 'address' }
    ],
    name: 'isFollowing',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'addr', type: 'address' }],
    name: 'follow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'addr', type: 'address' }],
    name: 'unfollow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'addresses', type: 'address[]' }],
    name: 'followBatch',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'addresses', type: 'address[]' }],
    name: 'unfollowBatch',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

const PAGE_SIZE = 50; // Maximum number of followers to fetch at once

export class LSP26FollowerSystem {
  constructor() {
    if (!provider) {
      throw new Error('Provider not found!');
    }
  }

  // Get follower count
  async getFollowerCount(address: string): Promise<number> {
    try {
      const data = await publicClient!.readContract({
        address: LSP26_CONTRACT_ADDRESS as `0x${string}`,
        abi: LSP26_ABI,
        functionName: 'followerCount',
        args: [address as `0x${string}`]
      });
      return Number(data);
    } catch (error) {
      console.error('Error getting follower count:', error);
      return 0;
    }
  }

  // Get following count
  async getFollowingCount(address: string): Promise<number> {
    try {
      const data = await publicClient!.readContract({
        address: LSP26_CONTRACT_ADDRESS as `0x${string}`,
        abi: LSP26_ABI,
        functionName: 'followingCount',
        args: [address as `0x${string}`]
      });
      return Number(data);
    } catch (error) {
      console.error('Error getting following count:', error);
      return 0;
    }
  }

  // Get followers (paginated)
  async getFollowers(address: string, startIndex: number = 0): Promise<readonly `0x${string}`[]> {
    try {
      const followerCount = await this.getFollowerCount(address);
      if (followerCount === 0) return [];

      const endIndex = Math.min(startIndex + PAGE_SIZE, followerCount);
      
      const data = await publicClient!.readContract({
        address: LSP26_CONTRACT_ADDRESS as `0x${string}`,
        abi: LSP26_ABI,
        functionName: 'getFollowersByIndex',
        args: [address as `0x${string}`, BigInt(startIndex), BigInt(endIndex)]
      });
      return data;
    } catch (error) {
      console.error('Error getting followers:', error);
      return [];
    }
  }

  // Get following (paginated)
  async getFollowing(address: string, startIndex: number = 0): Promise<readonly `0x${string}`[]> {
    try {
      const followingCount = await this.getFollowingCount(address);
      if (followingCount === 0) return [];

      const endIndex = Math.min(startIndex + PAGE_SIZE, followingCount);
      
      const data = await publicClient!.readContract({
        address: LSP26_CONTRACT_ADDRESS as `0x${string}`,
        abi: LSP26_ABI,
        functionName: 'getFollowsByIndex',
        args: [address as `0x${string}`, BigInt(startIndex), BigInt(endIndex)]
      });
      return data;
    } catch (error) {
      console.error('Error getting following:', error);
      return [];
    }
  }

  // Get all followers in a single call
  async getAllFollowers(address: string): Promise<readonly `0x${string}`[]> {
    try {
      const followerCount = await this.getFollowerCount(address);
      if (followerCount === 0) return [];

      // Get all followers in a single call
      const data = await publicClient!.readContract({
        address: LSP26_CONTRACT_ADDRESS as `0x${string}`,
        abi: LSP26_ABI,
        functionName: 'getFollowersByIndex',
        args: [address as `0x${string}`, BigInt(0), BigInt(followerCount)]
      });
      
      return data;
    } catch (error) {
      console.error('Error getting all followers:', error);
      return [];
    }
  }

  // Get all following in a single call
  async getAllFollowing(address: string): Promise<readonly `0x${string}`[]> {
    try {
      const followingCount = await this.getFollowingCount(address);
      if (followingCount === 0) return [];

      // Get all following in a single call
      const data = await publicClient!.readContract({
        address: LSP26_CONTRACT_ADDRESS as `0x${string}`,
        abi: LSP26_ABI,
        functionName: 'getFollowsByIndex',
        args: [address as `0x${string}`, BigInt(0), BigInt(followingCount)]
      });
      
      return data;
    } catch (error) {
      console.error('Error getting all following:', error);
      return [];
    }
  }

  // Optimized method to calculate mutual connections in a single operation
  async getMutualConnections(address: string): Promise<{
    allFollowers: readonly `0x${string}`[];
    allFollowing: readonly `0x${string}`[];
    mutualConnections: `0x${string}`[];
    mutualCount: number;
  }> {
    try {
      // Get counts
      const [followerCount, followingCount] = await Promise.all([
        this.getFollowerCount(address),
        this.getFollowingCount(address)
      ]);
      
      if (followerCount === 0 || followingCount === 0) {
        return {
          allFollowers: [],
          allFollowing: [],
          mutualConnections: [],
          mutualCount: 0
        };
      }

      // Get all followers and following in parallel
      const [allFollowers, allFollowing] = await Promise.all([
        this.getAllFollowers(address),
        this.getAllFollowing(address)
      ]);

      // Calculate mutual connections using Set intersections
      const followerSet = new Set(allFollowers.map(addr => addr.toLowerCase()));
      const followingSet = new Set(allFollowing.map(addr => addr.toLowerCase()));
      
      // Find mutual connections
      const mutualConnections: `0x${string}`[] = [];
      
      for (const addr of allFollowing) {
        const lowerAddr = addr.toLowerCase() as `0x${string}`;
        if (followerSet.has(lowerAddr)) {
          mutualConnections.push(lowerAddr);
        }
      }
      
      // Remove duplicates
      const uniqueMutualSet = new Set(mutualConnections);
      const mutualCount = uniqueMutualSet.size;
      
      return {
        allFollowers,
        allFollowing,
        mutualConnections: Array.from(uniqueMutualSet),
        mutualCount
      };
    } catch (error) {
      console.error('Error calculating mutual connections:', error);
      return {
        allFollowers: [],
        allFollowing: [],
        mutualConnections: [],
        mutualCount: 0
      };
    }
  }

  // Check if one address follows another
  async isFollowing(followerAddress: string, targetAddress: string): Promise<boolean> {
    try {
      const data = await publicClient!.readContract({
        address: LSP26_CONTRACT_ADDRESS as `0x${string}`,
        abi: LSP26_ABI,
        functionName: 'isFollowing',
        args: [followerAddress as `0x${string}`, targetAddress as `0x${string}`]
      });
      return data;
    } catch (error) {
      console.error('Error checking following:', error);
      return false;
    }
  }

  // Follow a profile
  async follow(targetAddress: string): Promise<boolean> {
    try {
      if (!walletClient) {
        throw new Error('WalletClient not found!');
      }

      if (!provider) {
        throw new Error('UP Provider not found!');
      }
      
      // Get connected accounts with UP Provider
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error('Connected account not found!');
      }
      
      const fromAddress = accounts[0];
      
      // Prepare LSP26 contract call data
      const callData = encodeFunctionData({
        abi: LSP26_ABI,
        functionName: 'follow',
        args: [targetAddress as `0x${string}`]
      });
      
      // Send transaction
      const hash = await walletClient.sendTransaction({
        account: fromAddress as `0x${string}`,
        to: LSP26_CONTRACT_ADDRESS as `0x${string}`,
        data: callData
      });
      
      console.log('Follow transaction hash:', hash);
      return true;
    } catch (error) {
      console.error('Error following:', error);
      throw error;
    }
  }

  // Unfollow a profile
  async unfollow(targetAddress: string): Promise<boolean> {
    try {
      if (!walletClient) {
        throw new Error('WalletClient not found!');
      }
      
      if (!provider) {
        throw new Error('UP Provider not found!');
      }
      
      // Get connected accounts with UP Provider
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error('Connected account not found!');
      }
      
      const fromAddress = accounts[0];
      
      // Prepare LSP26 contract call data
      const callData = encodeFunctionData({
        abi: LSP26_ABI,
        functionName: 'unfollow',
        args: [targetAddress as `0x${string}`]
      });
      
      // Send transaction
      const hash = await walletClient.sendTransaction({
        account: fromAddress as `0x${string}`,
        to: LSP26_CONTRACT_ADDRESS as `0x${string}`,
        data: callData
      });
      
      console.log('Unfollow transaction hash:', hash);
      return true;
    } catch (error) {
      console.error('Error unfollowing:', error);
      throw error;
    }
  }

  // Batch follow multiple profiles
  async followMany(targetAddresses: string[]): Promise<boolean> {
    try {
      if (!walletClient) {
        throw new Error('WalletClient not found!');
      }
      
      if (!provider) {
        throw new Error('UP Provider not found!');
      }
      
      // Check if array is empty
      if (targetAddresses.length === 0) {
        return true; // No addresses to process
      }
      
      // PRD requirement: maximum 50 addresses should be processed
      const MAX_BATCH_SIZE = 50;
      if (targetAddresses.length > MAX_BATCH_SIZE) {
        console.warn(`Batch operation supports a maximum of ${MAX_BATCH_SIZE} addresses. Only the first ${MAX_BATCH_SIZE} addresses will be processed.`);
        targetAddresses = targetAddresses.slice(0, MAX_BATCH_SIZE);
      }
      
      // Get connected accounts with UP Provider
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error('Connected account not found!');
      }
      
      const fromAddress = accounts[0];
      
      console.log(`Starting batch follow operation for ${targetAddresses.length} addresses...`);
      
      // Prepare LSP26 contract call data
      const callData = encodeFunctionData({
        abi: LSP26_ABI,
        functionName: 'followBatch',
        args: [targetAddresses.map(addr => addr as `0x${string}`)]
      });
      
      // Send transaction
      const hash = await walletClient.sendTransaction({
        account: fromAddress as `0x${string}`,
        to: LSP26_CONTRACT_ADDRESS as `0x${string}`,
        data: callData
      });
      
      console.log('Batch follow transaction hash:', hash);
      return true;
    } catch (error) {
      console.error('Error batch following:', error);
      throw error;
    }
  }

  // Batch unfollow multiple profiles
  async unfollowMany(targetAddresses: string[]): Promise<boolean> {
    try {
      if (!walletClient) {
        throw new Error('WalletClient not found!');
      }
      
      if (!provider) {
        throw new Error('UP Provider not found!');
      }
      
      // Check if array is empty
      if (targetAddresses.length === 0) {
        return true; // No addresses to process
      }
      
      // PRD requirement: maximum 50 addresses should be processed
      const MAX_BATCH_SIZE = 50;
      if (targetAddresses.length > MAX_BATCH_SIZE) {
        console.warn(`Batch operation supports a maximum of ${MAX_BATCH_SIZE} addresses. Only the first ${MAX_BATCH_SIZE} addresses will be processed.`);
        targetAddresses = targetAddresses.slice(0, MAX_BATCH_SIZE);
      }
      
      // Get connected accounts with UP Provider
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error('Connected account not found!');
      }
      
      const fromAddress = accounts[0];
      
      console.log(`Starting batch unfollow operation for ${targetAddresses.length} addresses...`);
      
      // Prepare LSP26 contract call data
      const callData = encodeFunctionData({
        abi: LSP26_ABI,
        functionName: 'unfollowBatch',
        args: [targetAddresses.map(addr => addr as `0x${string}`)]
      });
      
      // Send transaction
      const hash = await walletClient.sendTransaction({
        account: fromAddress as `0x${string}`,
        to: LSP26_CONTRACT_ADDRESS as `0x${string}`,
        data: callData
      });
      
      console.log('Batch unfollow transaction hash:', hash);
      return true;
    } catch (error) {
      console.error('Error batch unfollowing:', error);
      throw error;
    }
  }

  // Check follow relationship between two addresses
  async checkFollowRelation(address1: string, address2: string): Promise<{
    address1FollowsAddress2: boolean;
    address2FollowsAddress1: boolean;
    isMutual: boolean;
  }> {
    try {
      const [follows1to2, follows2to1] = await Promise.all([
        this.isFollowing(address1, address2),
        this.isFollowing(address2, address1)
      ]);

      return {
        address1FollowsAddress2: follows1to2,
        address2FollowsAddress1: follows2to1,
        isMutual: follows1to2 && follows2to1
      };
    } catch (error) {
      console.error('Error checking follow relationship:', error);
      throw error;
    }
  }
} 