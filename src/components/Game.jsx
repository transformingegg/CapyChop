import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ClaimStarsButton } from './ClaimStarsButton';
import { ClaimChopsButton } from './ClaimChopsButton';

function Game() {
  const { address, isConnected } = useAccount();
  const [gameLoaded, setGameLoaded] = useState(false);
  const [portalTarget, setPortalTarget] = useState(null);
  const [claimButtonTarget, setClaimButtonTarget] = useState(null);
  const [claimChopsTarget, setClaimChopsTarget] = useState(null);
  const [starsToClaim, setStarsToClaim] = useState(0);

  // Expose wallet state to window for vanilla JS game to access if needed
  useEffect(() => {
    window.walletAddress = address;
    window.walletConnected = isConnected;
    
    // Update profile icon color when connected
    const profileIcon = document.querySelector('.top-icon');
    if (profileIcon) {
      if (isConnected) {
        profileIcon.classList.add('connected');
      } else {
        profileIcon.classList.remove('connected');
      }
    }
    
    // Dispatch event so vanilla JS can listen
    window.dispatchEvent(new CustomEvent('walletStateChanged', {
      detail: { address, isConnected }
    }));
  }, [address, isConnected]);

  // Load the game HTML content
  useEffect(() => {
    // Fetch and inject the game HTML content (files in public/ are served at root)
    fetch('/game.html')
      .then(res => res.text())
      .then(html => {
        // Extract body content
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const body = doc.body.innerHTML;
        const styles = doc.head.querySelector('style')?.innerHTML || '';
        
        // Inject styles
        if (styles) {
          const styleEl = document.createElement('style');
          styleEl.innerHTML = styles;
          document.head.appendChild(styleEl);
        }
        
        // Inject game content
        const gameContainer = document.getElementById('game-content');
        if (gameContainer) {
          gameContainer.innerHTML = body;
          
          // Execute scripts - need to run them in order and wait for each
          const scripts = doc.querySelectorAll('script');
          const executeScripts = async () => {
            for (const script of scripts) {
              const newScript = document.createElement('script');
              if (script.src) {
                // External script - load it
                newScript.src = script.src;
                await new Promise((resolve, reject) => {
                  newScript.onload = resolve;
                  newScript.onerror = reject;
                  document.body.appendChild(newScript);
                });
              } else {
                // Inline script - execute immediately
                newScript.textContent = script.textContent;
                document.body.appendChild(newScript);
              }
            }
          };
          
          executeScripts()
            .then(() => {
              // After scripts load, set the portal targets
              const walletContainer = document.getElementById('walletConnectContainer');
              const claimContainer = document.getElementById('claimStarsButton');
              const chopsContainer = document.getElementById('claimChopsContainer');
              
              if (walletContainer) {
                setPortalTarget(walletContainer);
              }
              
              if (claimContainer) {
                setClaimButtonTarget(claimContainer);
              }
              
              if (chopsContainer) {
                setClaimChopsTarget(chopsContainer);
              }
              
              setGameLoaded(true);
              
              // Listen for star total updates from the game
              const starTotalElement = document.getElementById('starTotalValue');
              if (starTotalElement) {
                const observer = new MutationObserver(() => {
                  const total = parseInt(starTotalElement.textContent) || 0;
                  console.log('⭐ Star total changed in DOM:', total);
                  setStarsToClaim(total);
                });
                observer.observe(starTotalElement, { childList: true, characterData: true, subtree: true });
              }
            })
            .catch(err => console.error('Error executing game scripts:', err));
        }
      })
      .catch(err => console.error('Error loading game:', err));
  }, []);

  return (
    <>
      <style>{`
        #game-content {
          width: 100%;
          height: 100vh;
        }
        
        /* Hidden container for wallet button until moved into game */
        #wallet-button-holder {
          position: fixed;
          top: -9999px;
          left: -9999px;
        }
      `}</style>

      {/* Game Content Container */}
      <div id="game-content"></div>

      {/* Portal the ConnectButton into the game DOM after it loads */}
      {gameLoaded && portalTarget && createPortal(
        <ConnectButton chainStatus="icon" showBalance={false} />,
        portalTarget
      )}

      {/* Portal the ClaimStarsButton next to star total */}
      {gameLoaded && claimButtonTarget && createPortal(
        <ClaimStarsButton 
          starsToClaim={starsToClaim}
          onClaimSuccess={() => {
            // Reset star history and display using game's function
            // This will also trigger the MutationObserver to update React state
            if (window.resetStarsAfterClaim) {
              window.resetStarsAfterClaim();
            }
          }}
        />,
        claimButtonTarget
      )}

      {/* Portal the ClaimChopsButton into the profile panel */}
      {gameLoaded && claimChopsTarget && createPortal(
        <ClaimChopsButton />,
        claimChopsTarget
      )}
    </>
  );
}

export default Game;
