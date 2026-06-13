/* -------------------------------------------------------------
   Simulated AdMob Banner Advertising System
   ------------------------------------------------------------- */

interface Advertisement {
  title: string;
  desc: string;
  cta: string;
  icon: string;
  color: string;
}

const MOCK_ADS: Advertisement[] = [
  {
    title: "TEMU - Shop like a billionaire!",
    desc: "Discounts up to 90% on thousands of items. Free shipping.",
    cta: "Install",
    icon: "fa-solid fa-cart-shopping",
    color: "#ff5722"
  },
  {
    title: "Booking.com - Travel for less",
    desc: "Save 15% or more on summer stays. Free cancellation on most rooms.",
    cta: "Search",
    icon: "fa-solid fa-hotel",
    color: "#003580"
  },
  {
    title: "AliExpress - Unbelievable prices",
    desc: "Super deals from 0.99 €. Safe payments and money-back guarantee.",
    cta: "Buy",
    icon: "fa-solid fa-bag-shopping",
    color: "#e62e04"
  },
  {
    title: "Dice Premium - Enjoy ad-free gameplay",
    desc: "Unlock exclusive themes and game modes for only 0.99 €.",
    cta: "Buy Premium",
    icon: "fa-solid fa-crown",
    color: "#ffb703"
  }
];

class AdManager {
  private adIndex = 0;
  private intervalId: number | null = null;
  private isPremium = false;

  constructor() {
    // Check if user is premium from localStorage
    this.isPremium = localStorage.getItem('dice_app_premium') === 'true';
  }

  public init() {
    this.updateLayout();

    if (this.isPremium) return;

    this.startAdCycle();
    this.setupListeners();
  }

  private startAdCycle() {
    this.renderAd();
    
    // Cycle every 15 seconds
    this.intervalId = window.setInterval(() => {
      this.adIndex = (this.adIndex + 1) % MOCK_ADS.length;
      this.renderAd();
    }, 15000);
  }

  private renderAd() {
    const bannerContent = document.getElementById('ad-banner-content');
    if (!bannerContent) return;

    const ad = MOCK_ADS[this.adIndex];
    
    // Create new ad element for transition
    const adEl = document.createElement('div');
    adEl.className = 'mock-ad';
    adEl.innerHTML = `
      <i class="${ad.icon} ad-icon" style="color: ${ad.color};"></i>
      <div class="ad-text-container">
        <div class="ad-title">${ad.title}</div>
        <div class="ad-desc">${ad.desc}</div>
      </div>
      <button class="ad-cta" style="background-color: ${ad.color === '#ffb703' ? '#d58f00' : ad.color};">${ad.cta}</button>
    `;

    // Clear old ads and inject
    bannerContent.innerHTML = '';
    bannerContent.appendChild(adEl);

    // Apply active class on next frame for fade-in transition
    requestAnimationFrame(() => {
      adEl.classList.add('active');
    });

    // Setup click on CTA
    const ctaBtn = adEl.querySelector('.ad-cta');
    ctaBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ad.title.includes("Premium")) {
        // Trigger billing modal
        document.getElementById('billing-modal')?.classList.remove('hidden');
      } else {
        alert(`Opening App Store for ad: "${ad.title}"\n(In native Capacitor app, this would redirect to Google Play Store)`);
      }
    });
  }

  private setupListeners() {
    const removeAdsBtn = document.getElementById('remove-ads-shortcut-btn');
    removeAdsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      // Open Premium buy modal
      document.getElementById('billing-modal')?.classList.remove('hidden');
    });
  }

  public enablePremium() {
    this.isPremium = true;
    localStorage.setItem('dice_app_premium', 'true');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.updateLayout();
  }

  private updateLayout() {
    const container = document.getElementById('app-container');
    const premiumBadgeBtn = document.getElementById('premium-badge-btn');
    const premiumNote = document.getElementById('premium-themes-note');
    const premiumBgNote = document.getElementById('premium-bg-note');
    
    if (this.isPremium) {
      container?.classList.add('premium');
      if (premiumBadgeBtn) {
        premiumBadgeBtn.innerHTML = '<i class="fa-solid fa-crown"></i> <span>Premium Active</span>';
        premiumBadgeBtn.classList.add('purchased');
      }
      if (premiumNote) {
        premiumNote.classList.add('hidden');
      }
      if (premiumBgNote) {
        premiumBgNote.classList.add('hidden');
      }
      
      // Notify window of size change so 3D renderer updates viewport
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 300);
    } else {
      container?.classList.remove('premium');
    }
  }

  public getIsPremium(): boolean {
    return this.isPremium;
  }
}

export const ads = new AdManager();
