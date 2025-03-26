'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { provider, walletClient, publicClient } from '@/lib/up-provider';
import { toast } from 'react-hot-toast';

interface WalletContextType {
  accounts: `0x${string}`[];
  contextAccounts: `0x${string}`[];
  chainId: number | null;
  isConnected: boolean;
  connect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType>({
  accounts: [],
  contextAccounts: [],
  chainId: null,
  isConnected: false,
  connect: async () => {},
});

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [accounts, setAccounts] = useState<`0x${string}`[]>([]);
  const [contextAccounts, setContextAccounts] = useState<`0x${string}`[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = async () => {
    if (!provider) {
      toast.error('Web3 provider not found. Please install the UP browser extension.');
      throw new Error('Web3 provider not found');
    }

    try {
      await provider.request({ method: 'eth_requestAccounts' });
      
      // Update accounts and connection status
      if (walletClient) {
        const _accounts = await walletClient.getAddresses();
        setAccounts(_accounts);

        const _contextAccounts = provider.contextAccounts || [];
        setContextAccounts(_contextAccounts);

        setIsConnected(_accounts.length > 0 && _contextAccounts.length > 0);
      }

      toast.success('Wallet connected successfully');
    } catch (error: any) {
      console.error('Connection error:', error);
      toast.error(`Failed to connect: ${error.message || 'Unknown error'}`);
      throw error;
    }
  };

  useEffect(() => {
    if (!provider || !walletClient) {
      console.log('Provider or WalletClient not found');
      return;
    }

    const currentProvider = provider;
    const currentWalletClient = walletClient;

    const init = async () => {
      try {
        const _chainId = await currentWalletClient.getChainId();
        setChainId(_chainId);

        const _accounts = await currentWalletClient.getAddresses();
        setAccounts(_accounts);

        const _contextAccounts = currentProvider.contextAccounts || [];
        setContextAccounts(_contextAccounts);

        setIsConnected(_accounts.length > 0 && _contextAccounts.length > 0);
      } catch (error) {
        console.error('Initialization error:', error);
      }
    };

    init();

    const handleAccountsChanged = (_accounts: `0x${string}`[]) => {
      setAccounts(_accounts);
      setIsConnected(_accounts.length > 0 && contextAccounts.length > 0);
    };

    const handleContextAccountsChanged = (_accounts: `0x${string}`[]) => {
      setContextAccounts(_accounts);
      setIsConnected(accounts.length > 0 && _accounts.length > 0);
    };

    const handleChainChanged = (_chainId: number) => {
      setChainId(_chainId);
    };

    currentProvider.on('accountsChanged', handleAccountsChanged);
    currentProvider.on('contextAccountsChanged', handleContextAccountsChanged);
    currentProvider.on('chainChanged', handleChainChanged);

    return () => {
      currentProvider.removeListener('accountsChanged', handleAccountsChanged);
      currentProvider.removeListener('contextAccountsChanged', handleContextAccountsChanged);
      currentProvider.removeListener('chainChanged', handleChainChanged);
    };
  }, [accounts.length, contextAccounts.length]);

  return (
    <WalletContext.Provider value={{ accounts, contextAccounts, chainId, isConnected, connect }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => useContext(WalletContext); 