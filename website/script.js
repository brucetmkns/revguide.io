/**
 * RevGuide - Landing Page Scripts
 */

(function() {
  'use strict';

  // ----------------------------------------
  // Navigation
  // ----------------------------------------

  const nav = document.querySelector('.nav');
  const mobileToggle = document.querySelector('.nav-mobile-toggle');
  const navLinks = document.querySelector('.nav-links');

  // Scroll effect for navigation
  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    // Add shadow when scrolled
    if (currentScroll > 10) {
      nav.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
    } else {
      nav.style.boxShadow = 'none';
    }

    lastScroll = currentScroll;
  });

  // Mobile menu toggle
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      navLinks.classList.toggle('nav-links-open');
      mobileToggle.classList.toggle('nav-mobile-toggle-active');
    });
  }

  // ----------------------------------------
  // Smooth scroll for anchor links
  // ----------------------------------------

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');

      if (href === '#') return;

      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();

        const navHeight = nav.offsetHeight;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });

        // Close mobile menu if open
        if (navLinks.classList.contains('nav-links-open')) {
          navLinks.classList.remove('nav-links-open');
          mobileToggle.classList.remove('nav-mobile-toggle-active');
        }
      }
    });
  });

  // ----------------------------------------
  // Intersection Observer for animations
  // ----------------------------------------

  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe elements for animation
  const animateElements = document.querySelectorAll('.feature-card, .step, .use-case-card');
  animateElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
  });

  // Add animation class styles
  const style = document.createElement('style');
  style.textContent = `
    .animate-in {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }

    .nav-links-open {
      display: flex !important;
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      flex-direction: column;
      background: white;
      padding: 1rem;
      gap: 0.5rem;
      border-bottom: 1px solid #e1e3e8;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .nav-links-open a {
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
    }

    .nav-links-open a:hover {
      background: #f7f8fa;
    }

    .nav-mobile-toggle-active span:nth-child(1) {
      transform: rotate(45deg) translate(5px, 5px);
    }

    .nav-mobile-toggle-active span:nth-child(2) {
      opacity: 0;
    }

    .nav-mobile-toggle-active span:nth-child(3) {
      transform: rotate(-45deg) translate(5px, -5px);
    }
  `;
  document.head.appendChild(style);

  // ----------------------------------------
  // Feature card stagger animation
  // ----------------------------------------

  const featureCards = document.querySelectorAll('.feature-card');
  featureCards.forEach((card, index) => {
    card.style.transitionDelay = `${index * 0.1}s`;
  });

  const useCaseCards = document.querySelectorAll('.use-case-card');
  useCaseCards.forEach((card, index) => {
    card.style.transitionDelay = `${index * 0.1}s`;
  });

  const steps = document.querySelectorAll('.step');
  steps.forEach((step, index) => {
    step.style.transitionDelay = `${index * 0.15}s`;
  });

})();
