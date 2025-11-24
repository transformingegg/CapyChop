import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { ethers } from 'ethers';
import { STARS_CONTRACT_ADDRESS, STARS_ABI, CHOPS_CONTRACT_ADDRESS, CHOPS_ABI, RPC_URL } from '../contracts/config';

console.log('Config debug:', {
  STARS_CONTRACT_ADDRESS,
  CHOPS_CONTRACT_ADDRESS,
  CHOPS_ABI
});

export function ClaimChopsButton() {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(false);
  const [rewardData, setRewardData] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [manualChopsBalance, setManualChopsBalance] = useState('0.00');
  const [manualChopsDecimals, setManualChopsDecimals] = useState(18);

  // Query current epoch
  const { data: currentEpochData } = useReadContract({
    address: STARS_CONTRACT_ADDRESS,
    abi: STARS_ABI,
    functionName: 'currentEpoch',
    enabled: !!address && isConnected,
  });

  // Query if user has claimed for previous epoch
  const previousEpoch = currentEpochData ? Number(currentEpochData) - 1 : 0;
  const { data: hasClaimedData, refetch: refetchHasClaimed } = useReadContract({
    address: STARS_CONTRACT_ADDRESS,
    abi: STARS_ABI,
    functionName: 'hasClaimedChops',
    args: [previousEpoch, address],
    enabled: !!address && isConnected && previousEpoch > 0,
  });

  // Query Chops decimals
  const { data: chopsDecimalsData } = useReadContract({
    address: CHOPS_CONTRACT_ADDRESS,
    abi: CHOPS_ABI,
    functionName: 'decimals',
    enabled: !!address && isConnected && !!CHOPS_CONTRACT_ADDRESS,
  });

  // Query Chops balance
  const { data: chopsBalanceData, refetch: refetchBalance } = useReadContract({
    address: CHOPS_CONTRACT_ADDRESS,
    abi: CHOPS_ABI,
    functionName: 'balanceOf',
    args: [address],
    enabled: !!address && isConnected && !!CHOPS_CONTRACT_ADDRESS,
  });

  const { writeContract, data: hash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isTxPending, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash });

  // Manual balance query using ethers (fallback for wagmi issues)
  useEffect(() => {
    async function fetchManualBalance() {
      if (!isConnected || !address || !CHOPS_CONTRACT_ADDRESS) return;

      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const chopsContract = new ethers.Contract(CHOPS_CONTRACT_ADDRESS, CHOPS_ABI, provider);
        
        const [balance, decimals] = await Promise.all([
          chopsContract.balanceOf(address),
          chopsContract.decimals()
        ]);
        
        const decimalsNum = Number(decimals);
        const balanceNum = Number(balance) / (10 ** decimalsNum);
        
        setManualChopsBalance(balanceNum.toFixed(2));
        setManualChopsDecimals(decimalsNum);
        
        console.log('Manual balance query:', { balance, decimals, balanceNum });
      } catch (err) {
        console.error('Manual balance query failed:', err);
      }
    }

    fetchManualBalance();
  }, [address, isConnected, CHOPS_CONTRACT_ADDRESS, RPC_URL]);

  // Fetch reward data from API
  useEffect(() => {
    if (!isConnected || !address || previousEpoch <= 0) return;

    async function fetchRewardData() {
      try {
        const response = await fetch(`/api/get-chops-reward?address=${address}&epoch=${previousEpoch}`);
        if (response.ok) {
          const data = await response.json();
          setRewardData(data);
        } else {
          setRewardData(null);
        }
      } catch (err) {
        console.error('Failed to fetch reward data:', err);
        setRewardData(null);
      }
    }

    fetchRewardData();
  }, [address, isConnected, previousEpoch]);

  // Handle transaction success
  useEffect(() => {
    if (isTxSuccess && hash) {
      setSuccess(true);
      setLoading(false);
      refetchHasClaimed();
      refetchBalance();
      
      // Also refresh manual balance
      if (isConnected && address && CHOPS_CONTRACT_ADDRESS) {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const chopsContract = new ethers.Contract(CHOPS_CONTRACT_ADDRESS, CHOPS_ABI, provider);
        chopsContract.balanceOf(address).then(balance => {
          const balanceNum = Number(balance) / (10 ** manualChopsDecimals);
          setManualChopsBalance(balanceNum.toFixed(2));
        }).catch(err => console.error('Refresh balance failed:', err));
      }

      setTimeout(() => {
        setSuccess(false);
      }, 5000);
    }
  }, [isTxSuccess, hash, refetchHasClaimed, refetchBalance, isConnected, address, CHOPS_CONTRACT_ADDRESS, RPC_URL, manualChopsDecimals]);

  async function handleClaim() {
    if (!rewardData) {
      setError('No reward data available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🪙 Claiming Chops reward:', {
        epoch: previousEpoch,
        amount: rewardData.rewardAmount,
        proof: rewardData.proof
      });

      writeContract({
        address: STARS_CONTRACT_ADDRESS,
        abi: STARS_ABI,
        functionName: 'claimChops',
        args: [BigInt(previousEpoch), BigInt(rewardData.rewardAmount), rewardData.proof],
      });
    } catch (err) {
      console.error('❌ Claim failed:', err);
      setError(err.message || 'Failed to claim Chops');
      setLoading(false);
    }
  }

  // Don't render if not connected
  if (!isConnected) {
    return null;
  }

  const isProcessing = loading || isWritePending || isTxPending;
  const hasClaimed = hasClaimedData === true;
  const hasReward = rewardData && rewardData.rewardAmount && rewardData.rewardAmount !== '0';
  const decimals = chopsDecimalsData || manualChopsDecimals;
  const chopsBalance = chopsBalanceData ? (Number(chopsBalanceData) / (10 ** decimals)).toFixed(2) : manualChopsBalance;

  console.log('Debug Chops balance:', {
    chopsBalanceData,
    chopsDecimalsData,
    manualChopsBalance,
    manualChopsDecimals,
    decimals,
    chopsBalance,
    address,
    isConnected,
    CHOPS_CONTRACT_ADDRESS
  });

  return (
    <div style={{
      marginTop: '15px',
      padding: '15px',
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '8px',
      fontSize: '14px',
    }}>
      <div style={{ 
        fontWeight: 'bold', 
        marginBottom: '10px',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        🪙 Chops Balance: {chopsBalance}
      </div>

      {previousEpoch > 0 && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ 
            fontSize: '12px', 
            color: '#aaa', 
            marginBottom: '8px' 
          }}>
            Epoch {previousEpoch} Rewards
          </div>

          {hasClaimed ? (
            <div style={{
              padding: '10px',
              background: 'rgba(0, 200, 100, 0.2)',
              borderRadius: '4px',
              color: '#0f0',
              fontSize: '12px',
              textAlign: 'center'
            }}>
              ✅ Already claimed
            </div>
          ) : hasReward ? (
            <>
              <div style={{
                fontSize: '13px',
                color: '#fff',
                marginBottom: '8px',
                padding: '8px',
                background: 'rgba(255, 215, 0, 0.1)',
                borderRadius: '4px',
                textAlign: 'center'
              }}>
                💰 {(Number(rewardData.rewardAmount) / 1e18).toFixed(0)} CHOPS available!
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>
                  Rank #{rewardData.rank} • Top {rewardData.percentile}%
                </div>
              </div>

              <button
                onClick={handleClaim}
                disabled={isProcessing}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: isProcessing ? '#666' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!isProcessing) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {isProcessing ? '⏳ Claiming...' : '🪙 Claim Chops'}
              </button>
            </>
          ) : (
            <div style={{
              padding: '10px',
              background: 'rgba(100, 100, 100, 0.2)',
              borderRadius: '4px',
              color: '#aaa',
              fontSize: '12px',
              textAlign: 'center'
            }}>
              No rewards available
            </div>
          )}

          {success && (
            <div style={{
              marginTop: '10px',
              padding: '10px',
              background: 'rgba(0, 200, 100, 0.2)',
              borderRadius: '4px',
              color: '#0f0',
              fontSize: '12px',
              textAlign: 'center'
            }}>
              ✅ Chops claimed successfully!
            </div>
          )}

          {error && (
            <div style={{
              marginTop: '10px',
              padding: '10px',
              background: 'rgba(200, 0, 0, 0.2)',
              borderRadius: '4px',
              color: '#f00',
              fontSize: '12px',
              textAlign: 'center'
            }}>
              ❌ {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
