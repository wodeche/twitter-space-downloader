console.log('Content script 已加载');

// 注入辅助脚本来监听 XHR 请求
const script = document.createElement('script');
script.textContent = `
  console.log('XHR 监听器已注入');
  
  // 创建 XHR 请求监听器
  const originalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new originalXHR();
    const originalOpen = xhr.open;
    
    xhr.open = function() {
      const url = arguments[1];
      if (url && url.includes('.m3u8')) {
        console.log('检测到 M3U8 请求:', url);
        // 通知 content script
        window.postMessage({
          type: 'M3U8_DETECTED',
          url: url
        }, '*');
      }
      return originalOpen.apply(this, arguments);
    };
    
    return xhr;
  };
`;

document.documentElement.appendChild(script);

// 监听来自注入脚本的消息
window.addEventListener('message', function(event) {
  if (event.data.type === 'M3U8_DETECTED') {
    console.log('Content script 收到 M3U8 URL:', event.data.url);
    chrome.storage.local.set({
      'm3u8Url': event.data.url,
      'timestamp': Date.now()
    }, () => {
      console.log('M3U8 URL 已存储到 chrome.storage');
    });
  }
}); 