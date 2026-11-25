// Click the toolbar icon: run the content script in the current tab (activeTab, no broad host access).
// The first click shows the bar; later clicks toggle it (handled inside content.js).
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:/.test(tab.url || '')) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (e) {
    console.warn('RealCryptoCap: cannot run on this page', e);
  }
});
