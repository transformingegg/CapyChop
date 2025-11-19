import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import Game from './components/Game.jsx';

// Educhain configuration
const educhain = {
  id: 656476,
  name: 'EDU Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'EDU',
    symbol: 'EDU',
  },
  rpcUrls: {
    default: { http: ['https://rpc.open-campus-codex.gelato.digital'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://opencampus-codex.blockscout.com' },
  },
};

const config = getDefaultConfig({
  appName: 'CapyChop',
  projectId: 'YOUR_PROJECT_ID', // Get from walletconnect.com
  chains: [educhain],
});

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          <Game />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
