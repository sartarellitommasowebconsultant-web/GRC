/* ============================================
   APP JAVASCRIPT
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const searchInput = document.getElementById('searchInput');
  const generateBtn = document.getElementById('generateBtn');
  const loadingEl = document.getElementById('loading');
  const resultSection = document.getElementById('resultSection');
  const resultLink = document.getElementById('resultLink');
  const resultText = document.getElementById('resultText');
  const copyBtn = document.getElementById('copyBtn');
  const copyText = document.getElementById('copyText');
  const copyIcon = document.getElementById('copyIcon');
  const shareBtn = document.getElementById('shareBtn');
  const shareText = document.getElementById('shareText');
  const errorSection = document.getElementById('errorSection');
  const errorMessage = document.getElementById('errorMessage');
  const placeName = document.getElementById('placeName');
  const placeAddress = document.getElementById('placeAddress');

  let deferredPrompt = null;
  const installBanner = document.getElementById('installBanner');
  const installBtn = document.getElementById('installBtn');
  let currentReviewLink = '';

  // ==========================================
  // EVENT LISTENERS
  // ==========================================

  // Enter key to generate
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  });

  // Generate button click
  generateBtn.addEventListener('click', handleGenerate);

  // Copy button click
  copyBtn.addEventListener('click', handleCopy);

  // Share button click
  shareBtn.addEventListener('click', handleShare);

  // Install button click
  installBtn.addEventListener('click', () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        deferredPrompt = null;
        installBanner.classList.add('hidden');
      });
    }
  });

  // ==========================================
  // MAIN FUNCTIONS
  // ==========================================

  function handleGenerate() {
    const query = searchInput.value.trim();

    // Validation
    if (!query) {
      shakeInput();
      return;
    }

    // Reset UI
    hideAll();
    showLoading();

    // Disable button
    generateBtn.disabled = true;
    generateBtn.innerHTML = `
      <div class="spinner" style="width:18px;height:18px;border-width:2px;"></div>
      <span>Generazione in corso...</span>
    `;

    // API Call
    fetch('/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })
      .then(async (response) => {
        let data = null;
        try { data = await response.json(); } catch (e) { /* risposta non JSON */ }
        if (!response.ok || !data || data.error || !data.reviewLink) {
          showError((data && data.error) || 'Errore del server (' + response.status + '). Riprova più tardi.');
          return;
        }
        currentReviewLink = data.reviewLink;
        showResult(data.reviewLink, data.name, data.address);
      })
      .catch((error) => {
        console.error('Errore:', error);
        showError('Errore di connessione. Riprova più tardi.');
      })
      .finally(() => {
        loadingEl.classList.add('hidden');
        generateBtn.disabled = false;
        restoreGenerateBtn();
      });
  }

  function handleCopy() {
    const linkText = currentReviewLink;
    if (!navigator.clipboard) { fallbackCopy(linkText); return; }

    navigator.clipboard.writeText(linkText).then(() => {
      copyBtn.classList.add('copied');
      copyText.textContent = '✓ Copiato';
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyText.textContent = 'Copia link';
      }, 2000);
    }).catch(() => {
      fallbackCopy(linkText);
    });
  }

  async function handleShare() {
    const linkText = currentReviewLink;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Lascia una recensione',
          text: 'Ci lasci una recensione su Google? Grazie!',
          url: linkText,
        });
      } catch (err) {
        // Utente ha annullato o share non supportato
        if (err.name !== 'AbortError') {
          console.error('Share failed:', err);
          fallbackCopy(linkText);
        }
      }
    } else {
      // Fallback: copia negli appunti
      fallbackCopy(linkText);
    }
  }

  // ==========================================
  // UI HELPERS
  // ==========================================

  function hideAll() {
    loadingEl.classList.add('hidden');
    resultSection.classList.add('hidden');
    errorSection.classList.add('hidden');
    shareBtn.classList.add('hidden');
  }

  function showLoading() {
    hideAll();
    loadingEl.classList.remove('hidden');
  }

  function showResult(link, name, address) {
    loadingEl.classList.add('hidden');
    placeName.textContent = name || '';
    placeAddress.textContent = address || '';
    resultText.textContent = link;
    resultLink.href = link;
    resultSection.classList.remove('hidden');

    // Mostra pulsante share solo su dispositivi che lo supportano
    if (navigator.share) {
      shareBtn.classList.remove('hidden');
    }
  }

  function showError(message) {
    loadingEl.classList.add('hidden');
    errorMessage.textContent = message;
    errorSection.classList.remove('hidden');
  }

  function shakeInput() {
    const wrapper = searchInput.closest('.input-wrapper');
    wrapper.style.animation = 'shake 0.5s ease';
    wrapper.style.borderColor = '#c5221f';
    setTimeout(() => {
      wrapper.style.animation = '';
      wrapper.style.borderColor = '';
    }, 500);
  }

  function restoreGenerateBtn() {
    generateBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L10 14l4.59-4.59L16 11l-6 6z" fill="white"/>
      </svg>
      <span>Genera Link</span>
    `;
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      copyBtn.classList.add('copied');
      copyText.textContent = '✓ Copiato';
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyText.textContent = 'Copia link';
      }, 2000);
    } catch (err) {
      console.error('Fallback copy failed:', err);
      window.prompt('Copia il link:', text);
    }
    document.body.removeChild(textarea);
  }

  // ==========================================
  // PWA INSTALL
  // ==========================================

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBanner.classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBanner.classList.add('hidden');
  });

  // ==========================================
  // SERVICE WORKER
  // ==========================================

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW non registrato:', err));
  }

  // ==========================================
  // FOCUS INPUT ON LOAD
  // ==========================================

  setTimeout(() => {
    searchInput.focus();
  }, 300);
});
