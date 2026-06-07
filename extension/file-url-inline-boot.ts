/// <reference types="chrome" />

const inlineEntryUrl = chrome.runtime.getURL('file-url-inline-entry.js');

void import(inlineEntryUrl).catch((error: unknown) => {
  console.error('MarkNest file URL inline renderer failed to load.', error);
});
