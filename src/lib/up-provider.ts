'use client';

import { createClientUPProvider } from '@lukso/up-provider';
import { createWalletClient, createPublicClient, custom, http, type WalletClient } from 'viem';
import { lukso } from 'viem/chains';

// Tarayıcı ortamında olduğumuzdan emin olalım
const isClient = typeof window !== 'undefined';

// UP Provider'ı oluştur
export const provider = isClient ? createClientUPProvider() : null;

// RPC bağlantısı için public client oluştur
export const publicClient = isClient
  ? createPublicClient({
      chain: lukso,
      transport: http(),
    })
  : null;

// Cüzdan client'ını provider ile oluştur - dökümantasyona göre corrected version
export const walletClient = isClient && provider
  ? createWalletClient({
      chain: lukso,
      transport: custom(provider),
    })
  : null;

if (isClient && provider) {
  // Provider event dinleyicileri
  provider.on('accountsChanged', (_accounts: `0x${string}`[]) => {
    console.log('Hesaplar değişti:', _accounts);
    // Event'i dışarıya da iletebiliriz
    window.dispatchEvent(new CustomEvent('accountsChanged', { detail: _accounts }));
  });

  provider.on('contextAccountsChanged', (_accounts: `0x${string}`[]) => {
    console.log('Bağlam hesapları değişti:', _accounts);
    window.dispatchEvent(new CustomEvent('contextAccountsChanged', { detail: _accounts }));
  });

  provider.on('chainChanged', (_chainId: number) => {
    console.log('Zincir değişti:', _chainId);
    window.dispatchEvent(new CustomEvent('chainChanged', { detail: _chainId }));
  });
} 