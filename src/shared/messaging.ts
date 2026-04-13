// Message types for Background <-> Content Script communication
export type MessageType =
  | 'TRANSLATE_PAGE'
  | 'TRANSLATE_SELECTION'
  | 'TOGGLE_HOVER_MODE'
  | 'GET_PAGE_STATUS'
  | 'CANCEL_TRANSLATION';

export interface Message {
  type: MessageType;
  payload?: any;
}

// Port message types for streaming translation
export type PortMessageType =
  | 'translate_request'
  | 'translate_chunk'
  | 'translate_cached'
  | 'translate_done'
  | 'translate_error'
  | 'keepalive';

export interface PortMessage {
  type: PortMessageType;
  data?: any;
}

// Utility: send message to background
export function sendToBackground(message: Message): Promise<any> {
  return chrome.runtime.sendMessage(message);
}

// Utility: send message to content script in active tab
export async function sendToActiveTab(message: Message): Promise<any> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

// Utility: create Port connection for streaming translation
export function connectTranslatePort(): chrome.runtime.Port {
  return chrome.runtime.connect({ name: 'translate' });
}
