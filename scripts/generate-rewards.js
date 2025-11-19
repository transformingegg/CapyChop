import { ethers } from 'ethers';
import { MerkleTree } from 'merkletreejs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

console.log('Script starting...');

// ========================================
// CONFIGURATION - Edit these values
// ========================================

// Total CHOPS to distribute each epoch
const TOTAL_EMISSION = 10000;

// Curve steepness (1.0 = linear, 2.0 = very steep)
// Higher = top ranks get much more
// 1.0: More equal distribution
// 1.5: Moderate curve (recommended)
// 2.0: Steep curve (winner takes more)
const CURVE_EXPONENT = 1.5;

// ========================================

/**
 * Reward distribution using fixed emission and curve
 * 
 * @param {Array} players - Array of {address, stars}
 * @param {number} totalEmission - Total CHOPS to distribute (default: 10000)
 * @param {number} curveExponent - How steep the curve is (default: 1.5)
 *                                 1.0 = linear, >1.0 = exponential (rewards top more)
 */
function calculateRewards(players, totalEmission = 10000, curveExponent = 1.5) {
  // Sort players by stars (descending)
  const sorted = [...players].sort((a, b) => b.stars - a.stars);
  
  const totalPlayers = sorted.length;
  
  // Calculate weights using inverse rank with curve
  // Rank 1 gets highest weight, rank N gets lowest
  const weights = sorted.map((player, index) => {
    const rank = index + 1;
    // Weight = (totalPlayers - rank + 1) ^ curveExponent
    // This makes #1 get much more than #2, #2 much more than #3, etc.
    return Math.pow(totalPlayers - rank + 1, curveExponent);
  });
  
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  
  // Distribute tokens proportionally based on weights
  const rewards = sorted.map((player, index) => {
    const rank = index + 1;
    const percentile = ((rank / totalPlayers) * 100).toFixed(2);
    const weight = weights[index];
    
    // Calculate share of total emission
    const shareOfTotal = weight / totalWeight;
    const rewardAmount = ethers.parseEther((totalEmission * shareOfTotal).toFixed(4));
    
    return {
      address: player.address,
      stars: player.stars,
      rank,
      percentile,
      weight: weight.toFixed(2),
      shareOfTotal: (shareOfTotal * 100).toFixed(2) + '%',
      rewardAmount: rewardAmount.toString()
    };
  });
  
  // Log distribution summary
  console.log(`\n📊 Distribution Summary:`);
  console.log(`   Total Emission: ${totalEmission} CHOPS`);
  console.log(`   Curve Exponent: ${curveExponent}`);
  console.log(`   #1 gets: ${ethers.formatEther(rewards[0].rewardAmount)} CHOPS (${rewards[0].shareOfTotal})`);
  if (totalPlayers > 1) {
    const midpoint = Math.floor(totalPlayers / 2);
    console.log(`   #${midpoint} gets: ${ethers.formatEther(rewards[midpoint - 1].rewardAmount)} CHOPS (${rewards[midpoint - 1].shareOfTotal})`);
    console.log(`   #${totalPlayers} gets: ${ethers.formatEther(rewards[totalPlayers - 1].rewardAmount)} CHOPS (${rewards[totalPlayers - 1].shareOfTotal})`);
  }
  
  return rewards;
}

/**
 * Generate Merkle tree from rewards
 */
function generateMerkleTree(rewards) {
  // Create leaf nodes (hash of address + amount)
  const leaves = rewards.map(reward => {
    return ethers.solidityPackedKeccak256(
      ['address', 'uint256'],
      [reward.address, reward.rewardAmount]
    );
  });
  
  // Create Merkle tree
  const tree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
  const root = tree.getHexRoot();
  
  // Generate proofs for each player
  const rewardsWithProofs = rewards.map((reward, index) => {
    const leaf = leaves[index];
    const proof = tree.getHexProof(leaf);
    
    return {
      ...reward,
      proof
    };
  });
  
  return {
    root,
    rewards: rewardsWithProofs,
    tree
  };
}

/**
 * Verify a proof works
 */
function verifyProof(tree, address, amount, proof) {
  const leaf = ethers.solidityPackedKeccak256(
    ['address', 'uint256'],
    [address, amount]
  );
  
  return tree.verify(proof, leaf, tree.getHexRoot());
}

/**
 * Main function to generate rewards for an epoch
 */
async function generateEpochRewards(epochNumber, players) {
  console.log(`\n🎯 Generating rewards for Epoch ${epochNumber}`);
  console.log(`📊 Total players: ${players.length}\n`);
  
  // Calculate rewards using configured emission and curve
  const rewards = calculateRewards(players, TOTAL_EMISSION, CURVE_EXPONENT);
  
  // Generate Merkle tree
  const { root, rewards: rewardsWithProofs, tree } = generateMerkleTree(rewards);
  
  console.log(`🌳 Merkle Root: ${root}\n`);
  
  // Verify a few proofs
  console.log('✅ Verifying proofs...');
  const sampleIndexes = [0, Math.floor(rewards.length / 2), rewards.length - 1];
  sampleIndexes.forEach(i => {
    if (i < rewards.length) {
      const reward = rewardsWithProofs[i];
      const isValid = verifyProof(tree, reward.address, reward.rewardAmount, reward.proof);
      console.log(`   Player ${i + 1} (${reward.address}): ${isValid ? '✓' : '✗'}`);
    }
  });
  
  // Save to file
  const output = {
    epoch: epochNumber,
    merkleRoot: root,
    timestamp: new Date().toISOString(),
    totalPlayers: players.length,
    rewards: rewardsWithProofs.map(r => ({
      address: r.address,
      stars: r.stars,
      rank: r.rank,
      percentile: r.percentile,
      rewardAmount: r.rewardAmount,
      rewardAmountFormatted: ethers.formatEther(r.rewardAmount) + ' CHOPS',
      proof: r.proof
    }))
  };
  
  const filename = `epoch-${epochNumber}-rewards.json`;
  fs.writeFileSync(filename, JSON.stringify(output, null, 2));
  
  console.log(`\n💾 Saved to ${filename}`);
  console.log(`\n📝 Next steps:`);
  console.log(`1. Call setMerkleRoot(${epochNumber}, "${root}") on Stars contract`);
  console.log(`2. Share the JSON file so players can claim their rewards`);
  
  return output;
}

/**
 * Fetch players from contract by querying StarsClaimed events
 */
async function fetchEpochPlayers(epochNumber) {
  console.log('Creating provider...');
  const provider = new ethers.JsonRpcProvider(process.env.VITE_RPC_URL);
  
  console.log('Creating contract...');
  const starsContract = new ethers.Contract(
    process.env.VITE_STARS_CONTRACT_ADDRESS,
    [
      'event StarsClaimed(address indexed user, uint256 amount, uint256 epoch, uint256 nonce)',
      'function starsByEpoch(address user, uint256 epoch) external view returns (uint256)'
    ],
    provider
  );
  
  console.log(`📡 Fetching players for Epoch ${epochNumber}...`);
  
  // Query all StarsClaimed events (can't filter by non-indexed epoch)
  const filter = starsContract.filters.StarsClaimed();
  const events = await starsContract.queryFilter(filter);
  
  // Filter events for this epoch manually
  const epochEvents = events.filter(e => Number(e.args.epoch) === epochNumber);
  
  // Get unique addresses
  const addresses = [...new Set(epochEvents.map(e => e.args.user))];
  
  console.log(`Found ${addresses.length} players`);
  
  // Fetch final star count for each player
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

/**
 * Set Merkle root on contract
 */
async function setMerkleRootOnChain(epochNumber, merkleRoot) {
  const provider = new ethers.JsonRpcProvider(process.env.VITE_RPC_URL);
  const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
  
  const starsContract = new ethers.Contract(
    process.env.VITE_STARS_CONTRACT_ADDRESS,
    [
      'function setMerkleRoot(uint256 _epoch, bytes32 _merkleRoot) external',
      'function epochMerkleRoots(uint256) external view returns (bytes32)'
    ],
    wallet
  );
  
  console.log('\n📡 Setting Merkle root on contract...');
  const tx = await starsContract.setMerkleRoot(epochNumber, merkleRoot);
  console.log(`⏳ Transaction sent: ${tx.hash}`);
  
  await tx.wait();
  console.log('✅ Merkle root set on chain!');
  
  // Verify
  const onChainRoot = await starsContract.epochMerkleRoots(epochNumber);
  console.log(`🔍 Verified on-chain root: ${onChainRoot}`);
}

// CLI Usage
const currentFile = fileURLToPath(import.meta.url);
const scriptFile = path.resolve(process.argv[1]);
if (currentFile === scriptFile) {
  const epochNumber = parseInt(process.argv[2]) || 1;
  const autoSetOnChain = process.argv[3] === '--set-on-chain';
  
  (async () => {
    try {
      // Fetch players for this epoch
      const players = await fetchEpochPlayers(epochNumber);
      
      if (players.length === 0) {
        console.log('\n⚠️  No players found for this epoch!');
        console.log('Make sure:');
        console.log('  1. Players have claimed stars in this epoch');
        console.log('  2. The epoch number is correct');
        console.log('  3. You\'re connected to the right network');
        process.exit(1);
      }
      
      // Generate rewards
      const output = await generateEpochRewards(epochNumber, players);
      
      // Upload to Vercel Blob if token is set
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const { put } = await import('@vercel/blob');
          console.log('\n📤 Uploading to Vercel Blob Storage...');
          const fileContent = fs.readFileSync(`epoch-${epochNumber}-rewards.json`, 'utf8');
          const blob = await put(`epoch-${epochNumber}-rewards.json`, fileContent, {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN,
            contentType: 'application/json'
          });
          console.log(`✅ Uploaded to: ${blob.url}`);
        } catch (error) {
          console.log('⚠️  Blob upload failed (continuing anyway):', error.message);
        }
      }
      
      // Ask about setting on-chain
      if (autoSetOnChain) {
        await setMerkleRootOnChain(epochNumber, output.merkleRoot);
      } else if (process.env.ADMIN_PRIVATE_KEY) {
        // Prompt user
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        rl.question('\nDo you want to set the Merkle root on-chain now? (y/n): ', async (answer) => {
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            await setMerkleRootOnChain(epochNumber, output.merkleRoot);
          } else {
            console.log('\n📝 To set manually in Remix:');
            console.log(`   setMerkleRoot(${epochNumber}, "${output.merkleRoot}")`);
          }
          rl.close();
        });
      } else {
        console.log('\n⚠️  ADMIN_PRIVATE_KEY not set');
        console.log('📝 Set Merkle root manually in Remix:');
        console.log(`   setMerkleRoot(${epochNumber}, "${output.merkleRoot}")`);
      }
    } catch (error) {
      console.error('❌ Error:', error);
      process.exit(1);
    }
  })();
}

export { generateEpochRewards, calculateRewards, generateMerkleTree, verifyProof };
