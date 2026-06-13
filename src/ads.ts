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
    title: "TEMU - Nakupujte ako miliardár!",
    desc: "Zľavy až do 90% na tisíce tovarov. Bezplatné doručenie na Slovensko.",
    cta: "Inštalovať",
    icon: "fa-solid fa-cart-shopping",
    color: "#ff5722"
  },
  {
    title: "Booking.com - Cestujte za menej",
    desc: "Ušetrite 15% a viac na letných pobytoch. Bezplatné storno vo väčšine izieb.",
    cta: "Hľadať",
    icon: "fa-solid fa-hotel",
    color: "#003580"
  },
  {
    title: "AliExpress - Neskutočné ceny",
    desc: "Super ponuky od 0.99 €. Bezpečné platby a garancia vrátenia peňazí.",
    cta: "Kúpiť",
    icon: "fa-solid fa-bag-shopping",
    color: "#e62e04"
  },
  {
    title: "Dice Premium - Užite si hru bez reklám",
    desc: "Odomknite exkluzívne témy a herné módy len za symbolických 0.99 €.",
    cta: "Kúpiť Premium",
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
        alert(`Otváram obchod s aplikáciami pre reklamu: "${ad.title}"\n(V natívnej aplikácii Capacitor by toto presmerovalo do Google Play Store)`);
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
    
    if (this.isPremium) {
      container?.classList.add('premium');
      if (premiumBadgeBtn) {
        premiumBadgeBtn.innerHTML = '<i class="fa-solid fa-crown"></i> <span>Premium Aktívne</span>';
        premiumBadgeBtn.classList.add('purchased');
      }
      if (premiumNote) {
        premiumNote.classList.add('hidden');
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
