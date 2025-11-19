import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { STARS_CONTRACT_ADDRESS, STARS_ABI, CHAIN_ID } from '../contracts/config';

export function ClaimStarsButton({ starsToClaim, onClaimSuccess }) {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const hasCalledSuccess = useRef(false);
  const lastProcessedHash = useRef(null);

  // Query cooldown from contract
  const { data: cooldownData, refetch: refetchCooldown } = useReadContract({
    address: STARS_CONTRACT_ADDRESS,
    abi: STARS_ABI,
    functionName: 'cooldownRemaining',
    args: [address],
    enabled: !!address && isConnected,
    watch: true,
  });

  const { writeContract, data: hash, isPending: isWritePending, error: writeError } = useWriteContract();

  const { isLoading: isTxPending, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Update cooldown countdown
  useEffect(() => {
    if (cooldownData) {
      setCooldownSeconds(Number(cooldownData));
    }
  }, [cooldownData]);

  // Countdown timer
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setInterval(() => {
        setCooldownSeconds(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cooldownSeconds]);

  // Handle success - only trigger once per unique transaction hash
  useEffect(() => {
    if (isTxSuccess && hash && hash !== lastProcessedHash.current) {
      lastProcessedHash.current = hash;
      setSuccess(true);
      setLoading(false);
      
      // Reset stars on successful claim
      console.log('🎯 Claim success! Resetting stars...');
      if (onClaimSuccess) {
        onClaimSuccess();
      }
      
      // Refetch cooldown after successful claim
      refetchCooldown();
      
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    }
  }, [isTxSuccess, hash, onClaimSuccess, refetchCooldown]);

  // Handle write errors
  useEffect(() => {
    if (writeError) {
      console.error('❌ Write error:', writeError);
      const errorMsg = writeError.message || writeError.shortMessage || 'Transaction failed';
      setError(errorMsg);
      alert(`Transaction error: ${errorMsg}`);
      setLoading(false);
    }
  }, [writeError]);

  async function handleClaim() {
    console.log('🌟 Claim button clicked!', { isConnected, address, starsToClaim });
    console.log('📋 Contract config:', { STARS_CONTRACT_ADDRESS, CHAIN_ID });
    
    if (!STARS_CONTRACT_ADDRESS) {
      const msg = 'Contract address not configured!';
      setError(msg);
      alert(msg);
      return;
    }
    
    if (!isConnected || !address) {
      const msg = 'Please connect your wallet';
      setError(msg);
      alert(msg);
      return;
    }

    if (!starsToClaim || starsToClaim <= 0) {
      const msg = 'No stars to claim';
      setError(msg);
      alert(msg);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('📡 Requesting signature from API...');
      
      // Request signature from your API
      const response = await fetch('/api/claim-stars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          starsEarned: starsToClaim,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get signature');
      }

      const responseData = await response.json();
      console.log('🔍 Raw API response:', responseData);
      
      const { signature, nonce, deadline, amount } = responseData;
      console.log('✅ Got signature data:', { signature, nonce, deadline, amount });

      // Call contract - this will open MetaMask
      console.log('📝 Calling contract with args:', [amount, nonce, deadline, signature]);
      console.log('📝 Contract will be called BY:', address);
      console.log('📝 Signature was created FOR:', address);
      console.log('⚠️  These MUST match or signature will fail!');
      
      writeContract({
        address: STARS_CONTRACT_ADDRESS,
        abi: STARS_ABI,
        functionName: 'claimStars',
        args: [amount, nonce, deadline, signature],
      });
      
      console.log('✅ MetaMask prompt should appear!');
      // Don't set loading false - wait for transaction to complete or fail
    } catch (err) {
      console.error('❌ Claim failed:', err);
      setError(err.message || 'Failed to claim stars');
      alert(`Claim failed: ${err.message}`);
      setLoading(false);
    }
  }

  const isProcessing = loading || isWritePending || isTxPending;
  const hasCooldown = cooldownSeconds > 0;
  const isDisabled = !isConnected || isProcessing || starsToClaim <= 0 || hasCooldown;

  // Don't render if not connected
  // Show during cooldown even if stars = 0 (so user sees countdown)
  if (!isConnected) {
    return null;
  }

  // Hide if no stars AND no cooldown
  if (starsToClaim <= 0 && !hasCooldown) {
    return null;
  }

  // Format cooldown time
  const formatCooldown = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.8vh' }}>
      <button
        onClick={handleClaim}
        disabled={isDisabled}
        style={{
          background: hasCooldown ? '#9B8F77' : isProcessing ? '#8B6F47' : '#6B4423',
          color: 'white',
          border: '2px solid #552e15',
          borderRadius: '1.5vh',
          padding: '0.8vh 2vh',
          fontSize: '2vh',
          fontFamily: hasCooldown ? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' : 'inherit',
          fontWeight: hasCooldown ? '600' : 'bold',
          cursor: !isDisabled ? 'pointer' : 'not-allowed',
          opacity: hasCooldown ? 0.7 : !isDisabled ? 1 : 0.6,
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          transition: 'all 0.2s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (!isDisabled && !hasCooldown) {
            e.target.style.background = '#8B6F47';
          }
        }}
        onMouseLeave={(e) => {
          if (!hasCooldown) {
            e.target.style.background = isProcessing ? '#8B6F47' : '#6B4423';
          }
        }}
      >
        {isProcessing 
          ? '⏳ Claiming...' 
          : success 
          ? '✅ Claimed!' 
          : hasCooldown 
          ? `⏱️ ${formatCooldown(cooldownSeconds)}`
          : '🌟 Claim'}
      </button>

      {/* Help button */}
      <button
        onClick={() => {
          // Call the game's toggleInfo function
          if (window.toggleInfo) {
            window.toggleInfo();
          }
        }}
        style={{
          background: '#4A90E2',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '3.5vh',
          height: '3.5vh',
          fontSize: '2.2vh',
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          transition: 'all 0.2s',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
        onMouseEnter={(e) => {
          e.target.style.transform = 'scale(1.1)';
          e.target.style.background = '#5DA3F5';
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'scale(1)';
          e.target.style.background = '#4A90E2';
        }}
      >
        ?
      </button>
      
      {error && (
        <span style={{ 
          color: '#ff4444', 
          fontSize: '1.5vh', 
          marginLeft: '0.5vh'
        }}>
          {error}
        </span>
      )}
    </div>
  );
}
