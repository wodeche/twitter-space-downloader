document.addEventListener('DOMContentLoaded', async function() {
    console.log('Popup DOM 已加载');
    
    const statusDiv = document.getElementById('status');
    const downloadBtn = document.getElementById('downloadBtn');
    const debugDiv = document.getElementById('debug');

    function showDebug(message) {
        debugDiv.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${message}</div>`;
        console.log(message);
    }

    async function downloadM3U8(url) {
        try {
            showDebug(`准备下载: ${url}`);
            statusDiv.textContent = '正在获取音频信息...';
            
            // 获取 M3U8 文件内容
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': '*/*',
                    'Origin': 'https://twitter.com',
                    'Referer': 'https://twitter.com/',
                }
            });

            showDebug(`响应状态: ${response.status}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const m3u8Content = await response.text();
            showDebug(`获取到 M3U8 内容长度: ${m3u8Content.length}`);
            
            // 解析 M3U8 内容
            const lines = m3u8Content.split('\n');
            
            // 查找音频片段（.aac 文件）
            const audioFiles = [];
            let duration = 0;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('#EXTINF:')) {
                    // 获取持续时间
                    duration = parseFloat(line.split(':')[1]);
                } else if (line.endsWith('.aac')) {
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

            // 获取基础URL
            const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
            showDebug(`基础URL: ${baseUrl}`);

            // 开始下载音频片段
            statusDiv.textContent = '正在下载音频片段...';
            const audioChunks = [];
            let downloadedCount = 0;
            let totalDuration = 0;

            for (const audioFile of audioFiles) {
                try {
                    const audioUrl = new URL(audioFile.url, baseUrl).href;
                    showDebug(`下载片段 ${downloadedCount + 1}/${audioFiles.length}`);
                    
                    const audioResponse = await fetch(audioUrl, {
                        headers: {
                            'Origin': 'https://twitter.com',
                            'Referer': 'https://twitter.com/',
                        }
                    });
                    
                    if (!audioResponse.ok) {
                        throw new Error(`片段下载失败: ${audioResponse.status}`);
                    }

                    const arrayBuffer = await audioResponse.arrayBuffer();
                    audioChunks.push(arrayBuffer);
                    downloadedCount++;
                    totalDuration += audioFile.duration;
                    
                    // 更新进度
                    statusDiv.textContent = `下载进度: ${downloadedCount}/${audioFiles.length} (${Math.round(totalDuration)}秒)`;
                } catch (error) {
                    showDebug(`片段下载错误: ${error.message}`);
                }
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

        } catch (error) {
            showDebug(`错误: ${error.message}`);
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