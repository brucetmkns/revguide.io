/**
 * Shared Analytics & Tracking Code Loader
 *
 * Include this script in the <head> of web pages to load all tracking services.
 * Automatically skips in Chrome extension context where tracking doesn't work.
 *
 * Usage: <script src="/admin/analytics.js"></script>
 */
(function() {
  'use strict';

  // Skip in extension context - tracking scripts don't work there
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    return;
  }

  // Google Tag Manager
  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-KB8MXLBC');

  // GTM noscript fallback
  document.addEventListener('DOMContentLoaded', function() {
    var ns = document.createElement('noscript');
    var iframe = document.createElement('iframe');
    iframe.src = 'https://www.googletagmanager.com/ns.html?id=GTM-KB8MXLBC';
    iframe.height = '0';
    iframe.width = '0';
    iframe.style.display = 'none';
    iframe.style.visibility = 'hidden';
    ns.appendChild(iframe);
    document.body.insertBefore(ns, document.body.firstChild);
  });

  // Microsoft Clarity
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window, document, "clarity", "script", "upqegxi75a");

})();
