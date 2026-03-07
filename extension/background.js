// background.js — CopyAI Extension Service Worker
// Clicking the extension icon toggles the sidebar on the active tab
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' }).catch(() => {
    // Content script not yet injected on this page — inject it first
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
  });
});
