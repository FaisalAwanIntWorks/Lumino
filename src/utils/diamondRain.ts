export function createDiamondRain() {
  const container = document.createElement('div');
  container.id = 'diamond-rain-container';
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 9999;
    overflow: hidden;
  `;
  document.body.appendChild(container);

  const diamondCount = 30;
  
  for (let i = 0; i < diamondCount; i++) {
    setTimeout(() => {
      const diamond = document.createElement('div');
      diamond.innerHTML = '💎';
      diamond.style.cssText = `
        position: absolute;
        font-size: ${Math.random() * 20 + 20}px;
        left: ${Math.random() * 100}vw;
        top: -50px;
        animation: diamondFall ${Math.random() * 2 + 3}s linear forwards;
        opacity: ${Math.random() * 0.5 + 0.5};
      `;
      
      container.appendChild(diamond);
      
      setTimeout(() => diamond.remove(), 5000);
    }, i * 100);
  }

  setTimeout(() => {
    container.remove();
  }, 5500);
}

// Add diamond fall animation to document
const style = document.createElement('style');
style.textContent = `
  @keyframes diamondFall {
    0% {
      transform: translateY(0) rotate(0deg);
    }
    100% {
      transform: translateY(100vh) rotate(360deg);
    }
  }
`;
document.head.appendChild(style);
