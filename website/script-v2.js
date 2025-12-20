/**
 * RevGuide v3.0 - Landing Page Interactions
 */

(function() {
  'use strict';

  // ----------------------------------------
  // DOM Elements
  // ----------------------------------------
  const nav = document.querySelector('.nav');
  const mobileToggle = document.querySelector('.nav-mobile-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');
  const mobileLinks = document.querySelectorAll('.mobile-menu-link');

  // ----------------------------------------
  // Navigation Scroll Effect
  // ----------------------------------------
  let lastScrollY = 0;
  let ticking = false;

  function updateNav() {
    const scrollY = window.scrollY;

    if (scrollY > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }

    lastScrollY = scrollY;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateNav);
      ticking = true;
    }
  });

  // ----------------------------------------
  // Mobile Menu Toggle
  // ----------------------------------------
  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.contains('open');

      mobileToggle.classList.toggle('active');
      mobileMenu.classList.toggle('open');
      mobileToggle.setAttribute('aria-expanded', !isOpen);
      mobileMenu.setAttribute('aria-hidden', isOpen);

      // Prevent body scroll when menu is open
      document.body.style.overflow = isOpen ? '' : 'hidden';
    });

    // Close menu when clicking a link
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        mobileToggle.classList.remove('active');
        mobileMenu.classList.remove('open');
        mobileToggle.setAttribute('aria-expanded', 'false');
        mobileMenu.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      });
    });
  }

  // ----------------------------------------
  // Smooth Scroll for Anchor Links
  // ----------------------------------------
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');

      if (href === '#' || href === '#demo') return;

      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();

        const navHeight = nav ? nav.offsetHeight : 72;
        const targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight - 24;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });

        // Close mobile menu if open
        if (mobileMenu && mobileMenu.classList.contains('open')) {
          mobileToggle.classList.remove('active');
          mobileMenu.classList.remove('open');
          document.body.style.overflow = '';
        }
      }
    });
  });

  // ----------------------------------------
  // Scroll-Triggered Animations
  // ----------------------------------------
  const animatedElements = document.querySelectorAll(
    '.card-type-showcase, .bento-item, .step-item, .pricing-card, .mode-item'
  );

  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -80px 0px',
    threshold: 0.1
  };

  const animationObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        // Stagger animation based on element position
        const delay = index * 50;
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delay);
        animationObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Add base animation class and observe elements
  animatedElements.forEach(el => {
    el.classList.add('animate-on-scroll');
    animationObserver.observe(el);
  });

  // ----------------------------------------
  // Card Type Showcase Hover Effects
  // ----------------------------------------
  const showcaseCards = document.querySelectorAll('.card-type-showcase');

  showcaseCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      const icon = card.querySelector('.showcase-icon');
      if (icon) {
        icon.style.transform = 'scale(1.1) rotate(3deg)';
        icon.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
      }
    });

    card.addEventListener('mouseleave', () => {
      const icon = card.querySelector('.showcase-icon');
      if (icon) {
        icon.style.transform = 'scale(1) rotate(0deg)';
      }
    });
  });

  // ----------------------------------------
  // Pricing Card Highlight
  // ----------------------------------------
  const pricingCards = document.querySelectorAll('.pricing-card');

  pricingCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      // Dim other cards slightly
      pricingCards.forEach(other => {
        if (other !== card && !other.classList.contains('pricing-featured')) {
          other.style.opacity = '0.7';
        }
      });
    });

    card.addEventListener('mouseleave', () => {
      // Restore all cards
      pricingCards.forEach(other => {
        other.style.opacity = '1';
      });
    });
  });

  // ----------------------------------------
  // Hero Visual Parallax Effect
  // ----------------------------------------
  const heroVisual = document.querySelector('.hero-visual');
  const floatingBadges = document.querySelectorAll('.floating-badge');

  if (heroVisual && window.innerWidth > 768) {
    document.addEventListener('mousemove', (e) => {
      const { clientX, clientY } = e;
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      const moveX = (clientX - centerX) / 50;
      const moveY = (clientY - centerY) / 50;

      // Subtle movement on browser mockup
      const browserMockup = heroVisual.querySelector('.browser-mockup');
      if (browserMockup) {
        browserMockup.style.transform = `translate(${moveX * 0.5}px, ${moveY * 0.5}px)`;
        browserMockup.style.transition = 'transform 0.1s ease-out';
      }

      // More pronounced movement on floating badges
      floatingBadges.forEach((badge, index) => {
        const multiplier = 1 + (index * 0.3);
        badge.style.transform = `translate(${moveX * multiplier}px, ${moveY * multiplier}px)`;
      });
    });
  }

  // ----------------------------------------
  // Step Timeline Animation
  // ----------------------------------------
  const stepItems = document.querySelectorAll('.step-item');

  const stepObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const stepNumber = entry.target.querySelector('.step-number');
        const stepContent = entry.target.querySelector('.step-content');
        const stepLine = entry.target.querySelector('.step-line');

        // Animate step number
        if (stepNumber) {
          stepNumber.style.transform = 'scale(1)';
          stepNumber.style.opacity = '1';
        }

        // Animate step content
        if (stepContent) {
          stepContent.style.transform = 'translateX(0)';
          stepContent.style.opacity = '1';
        }

        // Animate connecting line
        if (stepLine) {
          stepLine.style.height = '100%';
        }

        stepObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  stepItems.forEach(item => {
    const stepNumber = item.querySelector('.step-number');
    const stepContent = item.querySelector('.step-content');
    const stepLine = item.querySelector('.step-line');

    // Set initial states
    if (stepNumber) {
      stepNumber.style.transform = 'scale(0.8)';
      stepNumber.style.opacity = '0';
      stepNumber.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
    }

    if (stepContent) {
      stepContent.style.transform = 'translateX(-20px)';
      stepContent.style.opacity = '0';
      stepContent.style.transition = 'all 0.5s ease-out 0.1s';
    }

    if (stepLine) {
      stepLine.style.height = '0';
      stepLine.style.transition = 'height 0.6s ease-out 0.2s';
    }

    stepObserver.observe(item);
  });

  // ----------------------------------------
  // Counter Animation for Stats
  // ----------------------------------------
  function animateCounter(element, target, duration = 1000) {
    const start = 0;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (target - start) * easeOut);

      element.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  // Animate hero stats when they come into view
  const heroStats = document.querySelectorAll('.stat-value');
  let statsAnimated = false;

  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !statsAnimated) {
        statsAnimated = true;

        heroStats.forEach(stat => {
          const targetValue = parseInt(stat.textContent, 10);
          animateCounter(stat, targetValue, 800);
        });

        statsObserver.disconnect();
      }
    });
  }, { threshold: 0.5 });

  if (heroStats.length > 0) {
    statsObserver.observe(document.querySelector('.hero-stats'));
  }

  // ----------------------------------------
  // Partner Dashboard Animation
  // ----------------------------------------
  const dashboardPreview = document.querySelector('.partner-dashboard-preview');

  if (dashboardPreview) {
    const dashboardObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Animate stats numbers
          const statNumbers = entry.target.querySelectorAll('.stat-number');
          statNumbers.forEach((stat, index) => {
            const targetValue = parseInt(stat.textContent, 10);
            stat.textContent = '0';
            setTimeout(() => {
              animateCounter(stat, targetValue, 600);
            }, index * 150);
          });

          // Animate client rows
          const clientRows = entry.target.querySelectorAll('.client-row');
          clientRows.forEach((row, index) => {
            row.style.opacity = '0';
            row.style.transform = 'translateX(-10px)';
            row.style.transition = 'all 0.3s ease-out';

            setTimeout(() => {
              row.style.opacity = '1';
              row.style.transform = 'translateX(0)';
            }, 400 + (index * 100));
          });

          dashboardObserver.disconnect();
        }
      });
    }, { threshold: 0.3 });

    dashboardObserver.observe(dashboardPreview);
  }

  // ----------------------------------------
  // Button Ripple Effect
  // ----------------------------------------
  const buttons = document.querySelectorAll('.btn-primary, .btn-outline');

  buttons.forEach(button => {
    button.addEventListener('click', function(e) {
      const rect = this.getBoundingClientRect();
      const ripple = document.createElement('span');

      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s ease-out;
        pointer-events: none;
      `;

      this.style.position = 'relative';
      this.style.overflow = 'hidden';
      this.appendChild(ripple);

      setTimeout(() => ripple.remove(), 600);
    });
  });

  // Add ripple animation keyframes
  const rippleStyle = document.createElement('style');
  rippleStyle.textContent = `
    @keyframes ripple {
      to {
        transform: scale(4);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(rippleStyle);

  // ----------------------------------------
  // Tooltip Preview Interaction
  // ----------------------------------------
  const tooltipWrapper = document.querySelector('.preview-tooltip-wrapper');

  if (tooltipWrapper) {
    const tooltipPopup = tooltipWrapper.querySelector('.tooltip-popup');

    if (tooltipPopup) {
      // Add subtle pulse animation to the tooltip icon
      const tooltipIcon = tooltipWrapper.querySelector('.tooltip-icon-inline');
      if (tooltipIcon) {
        setInterval(() => {
          tooltipIcon.style.transform = 'scale(1.1)';
          setTimeout(() => {
            tooltipIcon.style.transform = 'scale(1)';
          }, 200);
        }, 3000);
      }
    }
  }

  // ----------------------------------------
  // Lazy Load Images (if any added later)
  // ----------------------------------------
  if ('loading' in HTMLImageElement.prototype) {
    const images = document.querySelectorAll('img[loading="lazy"]');
    images.forEach(img => {
      img.src = img.dataset.src;
    });
  } else {
    // Fallback for browsers that don't support lazy loading
    const lazyImages = document.querySelectorAll('img[loading="lazy"]');

    const lazyImageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          lazyImageObserver.unobserve(img);
        }
      });
    });

    lazyImages.forEach(img => lazyImageObserver.observe(img));
  }

  // ----------------------------------------
  // Keyboard Navigation Support
  // ----------------------------------------
  document.addEventListener('keydown', (e) => {
    // Close mobile menu on Escape
    if (e.key === 'Escape' && mobileMenu && mobileMenu.classList.contains('open')) {
      mobileToggle.classList.remove('active');
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  // ----------------------------------------
  // Prefers Reduced Motion
  // ----------------------------------------
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (prefersReducedMotion.matches) {
    // Disable animations for users who prefer reduced motion
    document.documentElement.style.setProperty('--duration-fast', '0ms');
    document.documentElement.style.setProperty('--duration-base', '0ms');
    document.documentElement.style.setProperty('--duration-slow', '0ms');

    // Remove floating badge animations
    floatingBadges.forEach(badge => {
      badge.style.animation = 'none';
    });
  }

  // ----------------------------------------
  // Console Easter Egg
  // ----------------------------------------
  console.log(
    '%c RevGuide v3.0 ',
    'background: #b2ef63; color: #0a0f05; font-size: 14px; font-weight: bold; padding: 8px 16px; border-radius: 4px;'
  );
  console.log('Contextual Intelligence for HubSpot Teams');
  console.log('https://revguide.io');

})();
