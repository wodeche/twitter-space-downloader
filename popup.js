document.addEventListener('DOMContentLoaded', async function() {
    console.log('Popup DOM 已加载');
    
    const statusDiv = document.getElementById('status');
    const downloadBtn = document.getElementById('downloadBtn');
    const debugDiv = document.getElementById('debug');

    function showDebug(message) {
        debugDiv.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${message}</div>`;
        console.log(message);
    }

    async function processM3U8Response(response, baseUrl, headers) {
        const m3u8Content = await response.text();
        showDebug(`获取到 M3U8 内容长度: ${m3u8Content.length}`);
        
        // 添加调试信息，显示 M3U8 内容的前几行
        showDebug('M3U8 内容预览:');
        const previewLines = m3u8Content.split('\n').slice(0, 10);
        previewLines.forEach(line => showDebug(`预览行: ${line}`));
        
        // 解析 M3U8 内容
        const lines = m3u8Content.split('\n');
        
        // 查找音频片段
        const audioFiles = [];
        let duration = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXTINF:')) {
                duration = parseFloat(line.split(':')[1]);
            } else if (line && !line.startsWith('#')) {
                // 找到音频文件
                audioFiles.push({
                    url: line,
                    duration: duration
                });
            }
        }

        showDebug(`找到 ${audioFiles.length} 个音频片段`);
        
        if (audioFiles.length === 0) {
            throw new Error('未找到音频片段');
        }

        // 获取音频片段的基础URL
        const audioBaseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
        showDebug(`音频基础URL: ${audioBaseUrl}`);

        // 开始下载音频片段
        statusDiv.textContent = '正在下载音频片段...';
        const audioChunks = [];
        let downloadedCount = 0;
        let totalDuration = 0;

        // 添加重试机制
        const maxRetries = 3;
        for (const audioFile of audioFiles) {
            let retryCount = 0;
            while (retryCount < maxRetries) {
                try {
                    const audioUrl = new URL(audioFile.url, audioBaseUrl).href;
                    showDebug(`下载片段 ${downloadedCount + 1}/${audioFiles.length} (尝试 ${retryCount + 1}/${maxRetries})`);
                    
                    // 添加随机延迟
                    const delay = Math.floor(Math.random() * 1000) + 500;
                    await new Promise(resolve => setTimeout(resolve, delay));

                    const audioResponse = await fetch(audioUrl, {
                        headers: headers,
                        credentials: 'include',
                        mode: 'cors'
                    });
                    
                    if (audioResponse.ok) {
                        const arrayBuffer = await audioResponse.arrayBuffer();
                        audioChunks.push(arrayBuffer);
                        downloadedCount++;
                        totalDuration += audioFile.duration;
                        break;
                    } else {
                        showDebug(`片段下载失败 (${audioResponse.status})，重试中...`);
                        retryCount++;
                    }
                } catch (error) {
                    showDebug(`片段下载错误: ${error.message}`);
                    retryCount++;
                    if (retryCount === maxRetries) throw error;
                }
            }
            
            // 更新进度
            statusDiv.textContent = `下载进度: ${downloadedCount}/${audioFiles.length} (${Math.round(totalDuration)}秒)`;
        }

        showDebug(`所有片段下载完成，总时长: ${Math.round(totalDuration)}秒`);
        statusDiv.textContent = '正在合并音频...';

        // 合并所有音频片段
        const blob = new Blob(audioChunks, { type: 'audio/aac' });
        const downloadUrl = URL.createObjectURL(blob);

        // 下载合并后的文件
        chrome.downloads.download({
            url: downloadUrl,
            filename: `space_audio_${Date.now()}.aac`,
            saveAs: true
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                showDebug(`下载错误: ${chrome.runtime.lastError.message}`);
                statusDiv.textContent = '下载失败: ' + chrome.runtime.lastError.message;
            } else {
                showDebug(`完整音频下载开始，ID: ${downloadId}`);
                statusDiv.textContent = '下载成功！';
            }
        });

        // 清理
        downloadBtn.disabled = false;
    }

    async function downloadM3U8(url) {
        try {
            showDebug(`准备下载: ${url}`);
            statusDiv.textContent = '正在获取音频信息...';

            // 从 URL 中提取 Space ID
            const spaceId = url.match(/playlist_(\d+)\.m3u8/)?.[1];
            if (!spaceId) {
                throw new Error('无法从 URL 获取 Space ID');
            }

            // 获取 Twitter cookies 和认证信息
            const cookieData = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: 'GET_COOKIES' }, resolve);
            });

            // 尝试通过 Twitter API 获取新的媒体 URL
            const twitterApiHeaders = {
                'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
                'x-csrf-token': cookieData.ct0,
                'cookie': cookieData.cookieString,
                'x-twitter-active-user': 'yes',
                'x-twitter-auth-type': 'OAuth2Session'
            };

            // 尝试不同的 API 端点
            const apiEndpoints = [
                `https://twitter.com/i/api/graphql/SZf3Ceycp2dG7rrjd4oorg/AudioSpaceById?variables={"id":"${spaceId}","isMetatagsQuery":false,"withReplays":true}`,
                `https://twitter.com/i/api/1.1/live_video_stream/status/${spaceId}`,
                `https://api.twitter.com/1.1/broadcasts/show.json?ids=${spaceId}`
            ];

            for (const endpoint of apiEndpoints) {
                try {
                    showDebug(`尝试 API 端点: ${endpoint}`);
                    const response = await fetch(endpoint, { headers: twitterApiHeaders });
                    
                    if (response.ok) {
                        const data = await response.json();
                        const mediaUrl = data?.data?.audioSpace?.metadata?.media_url ||
                                       data?.source?.location ||
                                       data?.broadcasts?.[0]?.media_url;
                        
                        if (mediaUrl) {
                            showDebug(`找到新的媒体 URL: ${mediaUrl}`);
                            url = mediaUrl;
                            break;
                        }
                    }
                } catch (error) {
                    showDebug(`API 请求失败: ${error.message}`);
                }
            }

            // 尝试不同的 CDN 域名
            const cdnVariants = [
                'prod-fastly-',
                'prod-',
                'prod-video-',
                'video-',
                ''
            ];

            for (const variant of cdnVariants) {
                try {
                    const modifiedUrl = url.replace(/prod-fastly-[^.]+/, variant + url.match(/prod-fastly-([^.]+)/)[1]);
                    showDebug(`尝试 CDN URL: ${modifiedUrl}`);

                    const response = await fetch(modifiedUrl, {
                        headers: {
                            ...twitterApiHeaders,
                            'Referer': 'https://twitter.com/',
                            'Origin': 'https://twitter.com'
                        }
                    });

                    if (response.ok) {
                        return await processM3U8Response(response, modifiedUrl, twitterApiHeaders);
                    }
                } catch (error) {
                    showDebug(`CDN 请求失败: ${error.message}`);
                }
            }

            throw new Error('无法访问录音文件，可能已被归档或删除');

        } catch (error) {
            showDebug(`错误: ${error.message}`);
            if (error.stack) {
                showDebug(`错误堆栈: ${error.stack}`);
            }
            statusDiv.textContent = '下载失败: ' + error.message;
            downloadBtn.disabled = false;
        }
    }

    function checkForM3u8() {
        chrome.storage.local.get(['m3u8Url', 'timestamp'], function(result) {
            if (result.m3u8Url && result.timestamp) {
                const isRecent = (Date.now() - result.timestamp) < 5 * 60 * 1000;
                if (isRecent) {
                    showDebug(`找到 M3U8: ${result.m3u8Url}`);
                    statusDiv.textContent = '已检测到 Space 音频';
                    downloadBtn.disabled = false;

                    if (!downloadBtn.hasListener) {
                        downloadBtn.hasListener = true;
                        downloadBtn.addEventListener('click', async () => {
                            showDebug('下载按钮被点击');
                            downloadBtn.disabled = true;
                            await downloadM3U8(result.m3u8Url);
                        });
                    }
                }
            }
        });
    }

    // 检查 M3U8
    checkForM3u8();
});

// 添加全局错误处理
window.onerror = function(message, source, lineno, colno, error) {
    console.error('全局错误:', {
        message: message,
        source: source,
        lineno: lineno,
        colno: colno,
        error: error
    });
    return false;
}; 