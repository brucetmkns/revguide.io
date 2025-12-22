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

  // Microsoft Clarity
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window, document, "clarity", "script", "upqegxi75a");

})();
