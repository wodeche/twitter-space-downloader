console.log('Background script 已启动');

// 存储捕获到的请求
let capturedRequests = [];

// 监听网络请求
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    // 只关注 GET 请求
    if (details.method === 'GET') {
      // 记录所有媒体相关请求
      if (details.url.includes('.m3u8') || 
          details.url.includes('.ts') || 
          details.url.includes('audio') ||
          details.url.includes('media')) {
        
        console.log('捕获到媒体请求:', details.url);
        capturedRequests.push({
          timestamp: Date.now(),
          url: details.url,
          type: details.type
        });
        
        // 如果是 M3U8
        if (details.url.includes('.m3u8')) {
          chrome.storage.local.set({
            'm3u8Url': details.url,
            'timestamp': Date.now()
          }, () => {
            console.log('已存储 M3U8 URL:', details.url);
          });
        }
      }
    }
    return { cancel: false };
  },
  {
    urls: [
      "*://*.twitter.com/*",
      "*://*.x.com/*",
      "*://*.pscp.tv/*",
      "*://*.periscope.tv/*",
      "*://*.video.twitter.com/*"
    ]
  },
  ["requestBody"]
);

// 提供获取捕获请求的方法
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CAPTURED_REQUESTS') {
    sendResponse({ requests: capturedRequests });
  }
});

// 监听安装事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('扩展已安装/更新');
  // 清除之前的存储
  chrome.storage.local.clear(() => {
    console.log('存储已清除');
  });
}); 