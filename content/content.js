/**
 * Content script to extract page context when the user requests it.
 */

function getPageContext() {
  // Get text content of the page body
  const text = document.body.innerText || document.body.textContent;
  
  // Clean up excessive whitespace
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  // Truncate if too long (e.g. 50k chars limit) to avoid payload blowing up
  const truncatedText = cleanText.substring(0, 50000);
  
  return {
    url: window.location.href,
    title: document.title,
    text: truncatedText,
    isTruncated: cleanText.length > 50000
  };
}

// Listen for messages from the extension (side panel or background)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_PAGE_CONTEXT') {
    sendResponse(getPageContext());
  }
  return true;
});
