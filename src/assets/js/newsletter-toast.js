document.addEventListener("DOMContentLoaded", function() {
    
  // --- CONFIG ---
  const CONFIG = {
    DEV_MODE: false,        // Set to false for production
    DELAY_MS: 5000,       
    STORAGE_KEY: 'feddsp_toast_dismissed'
  };

  const toast = document.getElementById('fed-newsletter-toast');
  const closeBtn = document.getElementById('close-toast');
  
  // Debug check
  if (!toast || !closeBtn) return;

  // --- 1. SHOW LOGIC ---
  const isDismissed = localStorage.getItem(CONFIG.STORAGE_KEY);
  
  if (CONFIG.DEV_MODE || !isDismissed) {
    if (CONFIG.DEV_MODE) {
      toast.classList.add('show');
    } else {
      setTimeout(() => {
        toast.classList.add('show');
      }, CONFIG.DELAY_MS);
    }
  }

  // --- 2. DISMISS LOGIC ---
  const dismissToast = () => {
    toast.classList.remove('show');
    if (!CONFIG.DEV_MODE) {
      localStorage.setItem(CONFIG.STORAGE_KEY, 'true');
    }
  };

  // --- 3. EVENT LISTENERS ---
  
  // A. Close Button: Stop Propagation (Don't trigger the container click)
  closeBtn.addEventListener('click', function(e) {
    e.stopPropagation(); 
    dismissToast();
  });

  // B. Main Container Click: Manually Open Modal
  toast.addEventListener('click', function() {
      const modalEl = document.getElementById('newsletterModal'); 
      if (modalEl && typeof bootstrap !== 'undefined') {
        const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
        modalInstance.show();
        dismissToast();
      }
  });

});