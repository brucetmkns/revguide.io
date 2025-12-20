/**
 * RevGuide V3 - Executive Landing Page
 */

(function() {
  'use strict';

  // ----------------------------------------
  // Navigation
  // ----------------------------------------
  const nav = document.querySelector('.nav');
  const mobileBtn = document.querySelector('.mobile-menu-btn');

  // Nav scroll state
  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const scroll = window.scrollY;

    if (scroll > 50) {
      nav.style.background = 'rgba(250, 250, 248, 0.98)';
      nav.style.boxShadow = '0 1px 12px rgba(0,0,0,0.06)';
    } else {
      nav.style.background = 'rgba(250, 250, 248, 0.92)';
      nav.style.boxShadow = 'none';
    }

    lastScroll = scroll;
  });

  // Mobile menu (simple toggle for now)
  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      mobileBtn.classList.toggle('active');
    });
  }

  // ----------------------------------------
  // Smooth Scroll
  // ----------------------------------------
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#' || href === '#demo') return;

      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const offset = nav ? nav.offsetHeight + 20 : 90;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;

        window.scrollTo({
          top,
          behavior: 'smooth'
        });
      }
    });
  });

  // ----------------------------------------
  // Scroll Reveal Animations
  // ----------------------------------------
  const observerConfig = {
    root: null,
    rootMargin: '0px 0px -60px 0px',
    threshold: 0.1
  };

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, observerConfig);

  // Elements to animate on scroll
  const revealElements = document.querySelectorAll(
    '.problem-card, .feature-row, .roi-item, .consultant-feature, .how-step, .price-card'
  );

  revealElements.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = `opacity 0.5s ease ${i % 3 * 0.1}s, transform 0.5s ease ${i % 3 * 0.1}s`;
    revealObserver.observe(el);
  });

  // Add revealed class styles
  const style = document.createElement('style');
  style.textContent = `
    .revealed {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
  `;
  document.head.appendChild(style);

  // ----------------------------------------
  // Counter Animation
  // ----------------------------------------
  function animateValue(el, start, end, duration) {
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * easeOut);

      el.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  // Animate proof numbers in hero
  const proofNumbers = document.querySelectorAll('.proof-number');
  let proofAnimated = false;

  const proofObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !proofAnimated) {
        proofAnimated = true;

        proofNumbers.forEach(num => {
          const value = parseInt(num.textContent, 10);
          if (!isNaN(value) && value > 0) {
            animateValue(num, 0, value, 800);
          }
        });

        proofObserver.disconnect();
      }
    });
  }, { threshold: 0.5 });

  const proofSection = document.querySelector('.hero-proof');
  if (proofSection) {
    proofObserver.observe(proofSection);
  }

  // Animate ROI metrics
  const roiMetrics = document.querySelectorAll('.metric-value');
  let roiAnimated = false;

  const roiObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !roiAnimated) {
        roiAnimated = true;

        roiMetrics.forEach(metric => {
          const text = metric.textContent;
          const value = parseInt(text.replace(/[^0-9]/g, ''), 10);
          const suffix = text.includes('x') ? 'x' : '%';

          if (!isNaN(value)) {
            metric.textContent = '0' + suffix;

            const startTime = performance.now();
            const duration = 1000;

            function update(currentTime) {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const easeOut = 1 - Math.pow(1 - progress, 3);
              const current = Math.round(value * easeOut);

              metric.textContent = current + suffix;

              if (progress < 1) {
                requestAnimationFrame(update);
              }
            }

            requestAnimationFrame(update);
          }
        });

        roiObserver.disconnect();
      }
    });
  }, { threshold: 0.3 });

  const roiSection = document.querySelector('.roi');
  if (roiSection) {
    roiObserver.observe(roiSection);
  }

  // ----------------------------------------
  // Partner Stats Animation
  // ----------------------------------------
  const partnerStats = document.querySelectorAll('.ps-value');
  let partnerAnimated = false;

  const partnerObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !partnerAnimated) {
        partnerAnimated = true;

        partnerStats.forEach((stat, i) => {
          const value = parseInt(stat.textContent, 10);
          if (!isNaN(value)) {
            setTimeout(() => {
              animateValue(stat, 0, value, 600);
            }, i * 100);
          }
        });

        partnerObserver.disconnect();
      }
    });
  }, { threshold: 0.3 });

  const partnerPreview = document.querySelector('.partner-preview');
  if (partnerPreview) {
    partnerObserver.observe(partnerPreview);
  }

  // ----------------------------------------
  // Feature Row Animations
  // ----------------------------------------
  const featureRows = document.querySelectorAll('.feature-row');

  featureRows.forEach(row => {
    const visual = row.querySelector('.feature-visual');
    const content = row.querySelector('.feature-content');

    if (visual && content) {
      const rowObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            visual.style.opacity = '1';
            visual.style.transform = 'translateX(0)';
            content.style.opacity = '1';
            content.style.transform = 'translateX(0)';
            rowObserver.disconnect();
          }
        });
      }, { threshold: 0.2 });

      // Set initial states
      const isReversed = row.classList.contains('feature-row-reverse');
      visual.style.opacity = '0';
      visual.style.transform = `translateX(${isReversed ? '30px' : '-30px'})`;
      visual.style.transition = 'opacity 0.6s ease, transform 0.6s ease';

      content.style.opacity = '0';
      content.style.transform = `translateX(${isReversed ? '-30px' : '30px'})`;
      content.style.transition = 'opacity 0.6s ease 0.15s, transform 0.6s ease 0.15s';

      rowObserver.observe(row);
    }
  });

  // ----------------------------------------
  // Pricing Card Hover
  // ----------------------------------------
  const priceCards = document.querySelectorAll('.price-card');

  priceCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      priceCards.forEach(c => {
        if (c !== card) {
          c.style.opacity = '0.7';
          c.style.transform = 'scale(0.98)';
        }
      });
    });

    card.addEventListener('mouseleave', () => {
      priceCards.forEach(c => {
        c.style.opacity = '1';
        c.style.transform = 'scale(1)';
      });
    });

    card.style.transition = 'opacity 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease';
  });

  // ----------------------------------------
  // Button Hover Effects
  // ----------------------------------------
  const buttons = document.querySelectorAll('.btn-primary, .btn-outline');

  buttons.forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.transition = 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
    });
  });

  // ----------------------------------------
  // Problem Cards Stagger
  // ----------------------------------------
  const problemCards = document.querySelectorAll('.problem-card');

  problemCards.forEach((card, i) => {
    card.style.transitionDelay = `${i * 0.1}s`;
  });

  // ----------------------------------------
  // Keyboard Accessibility
  // ----------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      document.body.classList.add('keyboard-nav');
    }
  });

  document.addEventListener('mousedown', () => {
    document.body.classList.remove('keyboard-nav');
  });

  // Add focus styles for keyboard nav
  const keyboardStyles = document.createElement('style');
  keyboardStyles.textContent = `
    .keyboard-nav *:focus {
      outline: 2px solid var(--accent) !important;
      outline-offset: 2px !important;
    }
  `;
  document.head.appendChild(keyboardStyles);

  // ----------------------------------------
  // Reduced Motion Support
  // ----------------------------------------
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.style.setProperty('--duration', '0s');

    // Remove all transition delays
    document.querySelectorAll('*').forEach(el => {
      el.style.transitionDelay = '0s';
      el.style.animationDelay = '0s';
    });
  }

  // ----------------------------------------
  // Console Branding
  // ----------------------------------------
  console.log(
    '%cRevGuide',
    'font-size: 24px; font-weight: bold; color: #b2ef63; background: #0d0d0d; padding: 12px 24px; border-radius: 4px;'
  );
  console.log('Turn HubSpot into a revenue enablement engine.');
  console.log('https://revguide.io');

})();
