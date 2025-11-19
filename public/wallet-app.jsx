import React from 'react';
import ReactDOM from 'react-dom/client';
import '@rainbow-me/rainbowkit/styles.css';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { educhain } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WalletConnect } from './WalletConnect.jsx';

// Configure chains & providers
const config = createConfig({
  chains: [educhain],
  transports: {
    [educhain.id]: http('https://rpc.open-campus-codex.gelato.digital'),
  },
});

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          <WalletConnect />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// Mount to the wallet container
const container = document.getElementById('walletConnectContainer');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(<App />);
}

// Export for external use
export { config };
