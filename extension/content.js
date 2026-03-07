// content.js — CopyAI Sidebar Injector
// Injects a collapsible sidebar tab into every page
(function () {
  'use strict';

  // Prevent double-injection
  if (document.getElementById('copyai-ext-root')) return;

  // ---- Root container ----
  const root = document.createElement('div');
  root.id = 'copyai-ext-root';

  // ---- Toggle tab (always visible on the right edge) ----
  const tab = document.createElement('button');
  tab.id = 'copyai-ext-tab';
  tab.setAttribute('aria-label', 'Toggle CopyAI sidebar');
  tab.setAttribute('aria-expanded', 'false');
  tab.title = 'CopyAI Prompt Manager';
  tab.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="8" y="3" width="8" height="3" rx="1.5"/>' +
      '<path d="M5 8h14l-1.8 10H6.8z"/>' +
      '<path d="M9.5 12v4M12 12v4M14.5 12v4"/>' +
    '</svg>' +
    '<span>CopyAI</span>';

  // ---- Sidebar iframe ----
  const frame = document.createElement('iframe');
  frame.id = 'copyai-ext-frame';
  frame.src = chrome.runtime.getURL('sidebar.html');
  frame.allow = 'clipboard-write';
  frame.title = 'CopyAI Prompt Manager';

  root.appendChild(frame);
  root.appendChild(tab);
  document.documentElement.appendChild(root);

  // ---- Toggle logic ----
  let isOpen = false;

  function toggle(forceState) {
    isOpen = (forceState !== undefined) ? forceState : !isOpen;
    root.classList.toggle('copyai-open', isOpen);
    tab.setAttribute('aria-expanded', String(isOpen));
  }

  tab.addEventListener('click', () => toggle());

  // Listen for toggle message from background script (extension icon click)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === 'toggleSidebar') toggle();
  });
})();
