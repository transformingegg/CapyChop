import { ethers } from 'ethers';
import { MerkleTree } from 'merkletreejs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========================================
// CONFIGURATION - Match generate-rewards.js
// ========================================

const TOTAL_EMISSION = 10000;
const CURVE_EXPONENT = 1.5;

// Contract ABIs
const STARS_ABI = [
  "event StarsClaimed(address indexed user, uint256 amount, uint256 epoch, uint256 nonce)",
  "function currentEpoch() view returns (uint256)",
  "function lastResetTimestamp() view returns (uint256)",
  "function epochDuration() view returns (uint256)",
  "function resetEpoch() external",
  "function starsByEpoch(address user, uint256 epoch) external view returns (uint256)",
  "function setMerkleRoot(uint256 epoch, bytes32 root) external",
  "function setMerkleRootAutomated(uint256 epoch, bytes32 root) external",
  "function hasClaimedChops(uint256 epoch, address user) external view returns (bool)"
];

const CHOPS_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

async function checkAndResetEpoch(starsContract, wallet) {
  try {
    const currentEpoch = await starsContract.currentEpoch();
    const lastResetTimestamp = await starsContract.lastResetTimestamp();
    const epochDuration = await starsContract.epochDuration();
    
    const currentTime = Math.floor(Date.now() / 1000);
    const timeSinceLastReset = currentTime - Number(lastResetTimestamp);
    
    console.log(`⏰ Epoch check: current=${currentEpoch}, lastReset=${new Date(Number(lastResetTimestamp) * 1000).toISOString()}, duration=${epochDuration}s (${epochDuration / 86400} days)`);
    console.log(`⏰ Time since last reset: ${timeSinceLastReset}s (${(timeSinceLastReset / 86400).toFixed(1)} days)`);
    
    if (timeSinceLastReset >= epochDuration) {
      console.log('🔄 Epoch duration elapsed! Resetting epoch...');
      
      const tx = await starsContract.connect(wallet).resetEpoch();
      await tx.wait();
      
      const newEpoch = await starsContract.currentEpoch();
      console.log(`✅ Epoch reset! New epoch: ${newEpoch}`);
      
      return newEpoch;
    } else {
      console.log('⏳ Epoch duration not elapsed yet');
      return currentEpoch;
    }
  } catch (error) {
    console.error('❌ Error checking/resetting epoch:', error);
    throw error;
  }
}

function calculateRewards(players, totalEmission = 10000, curveExponent = 1.5) {
  const sorted = [...players].sort((a, b) => b.stars - a.stars);
  const totalPlayers = sorted.length;

  const weights = sorted.map((player, index) => {
    const rank = index + 1;
    return Math.pow(totalPlayers - rank + 1, curveExponent);
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  return sorted.map((player, index) => {
    const weight = weights[index];
    // Use BigInt for precise calculation of large numbers
    const rewardAmount = (BigInt(Math.floor((weight / totalWeight) * totalEmission * 1e18))).toString();
    return {
      address: player.address,
      stars: player.stars,
      rank: index + 1,
      percentile: ((totalPlayers - index) / totalPlayers * 100).toFixed(1),
      rewardAmount: rewardAmount,
      weight
    };
  });
}

function generateMerkleTree(rewards) {
  const leaves = rewards.map(reward =>
    ethers.solidityPackedKeccak256(
      ["address", "uint256"],
      [reward.address, reward.rewardAmount] // Already a string from calculateRewards
    )
  );

  const tree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
  const root = tree.getHexRoot();

  const proofs = rewards.map((reward, index) => ({
    ...reward,
    proof: tree.getHexProof(leaves[index])
  }));

  return { root, proofs };
}

async function fetchEpochPlayers(epochNumber, provider, starsContract) {
  const filter = starsContract.filters.StarsClaimed();
  const events = await starsContract.queryFilter(filter);

  const epochEvents = events.filter(e => Number(e.args.epoch) === epochNumber);
  const addresses = [...new Set(epochEvents.map(e => e.args.user))];

  const players = await Promise.all(
    addresses.map(async (address) => {
      const stars = await starsContract.starsByEpoch(address, epochNumber);
      return {
        address,
        stars: Number(stars)
      };
    })
  );

  return players.filter(p => p.stars > 0);
}

async function setMerkleRootOnChain(epochNumber, root, wallet) {
  const starsContract = new ethers.Contract(
    process.env.STARS_CONTRACT_ADDRESS,
    STARS_ABI,
    wallet
  );

  const tx = await starsContract.setMerkleRootAutomated(epochNumber, root);
  await tx.wait();
  return tx.hash;
}

// ========================================
// MAIN API HANDLER
// ========================================

export default async function handler(req, res) {
  // Only allow POST requests from Vercel cron
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify this is from Vercel cron (optional but recommended)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔄 Starting automated reward generation...');

    // Setup provider and contracts
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.GAME_SIGNER_PRIVATE_KEY, provider);
    const starsContract = new ethers.Contract(
      process.env.STARS_CONTRACT_ADDRESS,
      STARS_ABI,
      provider
    );

    // Check and reset epoch if needed
    const currentEpoch = await checkAndResetEpoch(starsContract, wallet);
    const previousEpoch = Number(currentEpoch) - 1;

    console.log(`📊 Current epoch: ${currentEpoch}, checking epoch: ${previousEpoch}`);

    // Check if rewards already exist
    try {
      const response = await fetch(`https://z3p2lhzjl2zlx7er.public.blob.vercel-storage.com/epoch-${previousEpoch}-rewards.json`);
      if (response.ok) {
        console.log(`✅ Rewards for epoch ${previousEpoch} already exist`);
        return res.status(200).json({
          success: true,
          message: `Rewards for epoch ${previousEpoch} already generated`
        });
      }
    } catch (error) {
      // Continue if blob check fails
    }

    // Fetch players for previous epoch
    const players = await fetchEpochPlayers(previousEpoch, provider, starsContract);

    if (players.length === 0) {
      console.log(`⚠️ No players found for epoch ${previousEpoch}`);
      return res.status(200).json({
        success: true,
        message: `No players found for epoch ${previousEpoch}`
      });
    }

    console.log(`🎯 Found ${players.length} players for epoch ${previousEpoch}`);

    // Generate rewards
    const rewards = calculateRewards(players, TOTAL_EMISSION, CURVE_EXPONENT);
    const { root, proofs } = generateMerkleTree(rewards);

    // Create output data
    const output = {
      epoch: previousEpoch,
      totalPlayers: players.length,
      totalEmission: TOTAL_EMISSION,
      curveExponent: CURVE_EXPONENT,
      merkleRoot: root,
      rewards: proofs
    };

    // Save locally (for Vercel, this is temporary)
    const fileName = `epoch-${previousEpoch}-rewards.json`;
    const filePath = path.join('/tmp', fileName);
    
    // Custom JSON serializer to handle any remaining BigInts
    const jsonString = JSON.stringify(output, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }, 2);
    
    fs.writeFileSync(filePath, jsonString);

    // Upload to Vercel Blob
    const { put } = await import('@vercel/blob');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const blob = await put(fileName, fileContent, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: 'application/json'
    });

    console.log(`✅ Uploaded rewards to: ${blob.url}`);

    // Set Merkle root on-chain
    if (process.env.GAME_SIGNER_PRIVATE_KEY) {
      const txHash = await setMerkleRootOnChain(previousEpoch, root, wallet);
      console.log(`✅ Set Merkle root on-chain: ${txHash}`);

      return res.status(200).json({
        success: true,
        epoch: previousEpoch,
        players: players.length,
        merkleRoot: root,
        blobUrl: blob.url,
        txHash
      });
    } else {
      console.log('⚠️ GAME_SIGNER_PRIVATE_KEY not set - Merkle root not set on-chain');

      return res.status(200).json({
        success: true,
        epoch: previousEpoch,
        players: players.length,
        merkleRoot: root,
        blobUrl: blob.url,
        warning: 'Merkle root not set on-chain - missing GAME_SIGNER_PRIVATE_KEY'
      });
    }

  } catch (error) {
    console.error('❌ Error in automated reward generation:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}