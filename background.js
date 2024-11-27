console.log('Background script 已启动');

// 存储捕获到的请求
let capturedRequests = [];

// 监听网络请求
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (details.method === 'GET') {
      // 记录所有媒体相关请求和 API 请求
      if (details.url.includes('.m3u8') || 
          details.url.includes('.ts') || 
          details.url.includes('audio') ||
          details.url.includes('media') ||
          details.url.includes('AudioSpaceById') ||
          details.url.includes('broadcasts/show')) {
        
        console.log('捕获到请求:', details.url);
        
        // 保存请求头信息
        chrome.webRequest.getResponseHeaders(details.requestId).then(headers => {
          capturedRequests.push({
            timestamp: Date.now(),
            url: details.url,
            type: details.type,
            headers: headers
          });
        });
        
        // 如果是 M3U8 或者 API 响应
        if (details.url.includes('.m3u8') || details.url.includes('AudioSpaceById')) {
          chrome.storage.local.set({
            'lastRequest': {
              url: details.url,
              timestamp: Date.now(),
              headers: details.requestHeaders
            }
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
  ["requestBody", "requestHeaders", "extraHeaders"]
);

// 添加响应头监听器
chrome.webRequest.onHeadersReceived.addListener(
  function(details) {
    if (details.url.includes('.m3u8') || details.url.includes('AudioSpaceById')) {
      chrome.storage.local.set({
        'lastResponse': {
          url: details.url,
          timestamp: Date.now(),
          headers: details.responseHeaders
        }
      });
    }
    return { responseHeaders: details.responseHeaders };
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
  ["responseHeaders", "extraHeaders"]
);

// 添加新的函数来获取 bearer token
async function getTwitterBearerToken() {
    const cookies = await chrome.cookies.getAll({
        domain: '.twitter.com',
        name: 'ct0' // CSRF token
    });
    return cookies[0]?.value || '';
}

// 修改 getTwitterCookies 函数
async function getTwitterCookies() {
    const cookies = await chrome.cookies.getAll({
        domain: '.twitter.com'
    });
    
    // 特别获取 auth_token
    const authToken = cookies.find(c => c.name === 'auth_token')?.value;
    const ct0 = cookies.find(c => c.name === 'ct0')?.value;
    
    return {
        cookieString: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
        authToken,
        ct0
    };
}

// 修改消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_M3U8') {
        // 保存现有的处理逻辑...
    } else if (request.type === 'GET_COOKIES') {
        getTwitterCookies().then(cookieData => {
            sendResponse(cookieData);
        });
        return true;
    }
});

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