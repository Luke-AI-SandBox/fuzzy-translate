import type { Message } from '../shared/messaging';
import { handleTranslatePort } from './translate-handler';
import { cacheClearExpired, cacheClear } from './cache/cache-manager';

console.log('Fuzzy Translate Background SW loaded');

// Listen for Port connections (streaming translation)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'translate') {
    handleTranslatePort(port);
  }
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  // Forward keyboard shortcut commands to the active tab's content script
  if (message.type === 'TRANSLATE_PAGE' && !sender.tab) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, message);
      }
    });
  }
  if ((message as any).type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
  }
  if ((message as any).type === 'CLEAR_PAGE_CACHE') {
    cacheClear().catch(err => console.error('Failed to clear cache:', err));
  }
  sendResponse({ status: 'ok' });
  return true;
});

// Listen for keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'translate-page') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TRANSLATE_PAGE' } as Message);
      }
    });
  }
});

// Set up daily cache cleanup alarm
chrome.alarms.create('clearExpiredCache', { periodInMinutes: 1440 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'clearExpiredCache') {
    cacheClearExpired().catch((err) => {
      console.error('Failed to clear expired cache:', err);
    });
  }
});
