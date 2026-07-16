const axios = require('axios');

const CAMERA_IP = '172.20.0.219';
const CAMERA_USER = 'admin';
const CAMERA_PASSWORD = process.env.CAMERA_PASSWORD || ''  // credencial removida do repo;

// Lista expandida de possíveis URLs
const URLS = [
  // MJPEG paths comuns
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/mjpg/video.mjpg`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/mjpg/video.cgi`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/mjpg/1/video.mjpg`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/mjpg/video`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/video.mjpg`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/video.cgi`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/video`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/stream`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/live`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/live/stream`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/cam/realmonitor`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/axis-cgi/mjpg/video.cgi`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/snapshot`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/jpg/image.jpg`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/image.jpg`,
  
  // Sem autenticação
  `http://${CAMERA_IP}/mjpg/video.mjpg`,
  `http://${CAMERA_IP}/mjpg/video.cgi`,
  `http://${CAMERA_IP}/mjpg/1/video.mjpg`,
  `http://${CAMERA_IP}/mjpg/video`,
  `http://${CAMERA_IP}/video.mjpg`,
  `http://${CAMERA_IP}/video.cgi`,
  `http://${CAMERA_IP}/video`,
  `http://${CAMERA_IP}/stream`,
  `http://${CAMERA_IP}/live`,
  `http://${CAMERA_IP}/live/stream`,
  `http://${CAMERA_IP}/cam/realmonitor`,
  `http://${CAMERA_IP}/axis-cgi/mjpg/video.cgi`,
  `http://${CAMERA_IP}/snapshot`,
  `http://${CAMERA_IP}/jpg/image.jpg`,
  `http://${CAMERA_IP}/image.jpg`,
  
  // Portas alternativas
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}:8080/video`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}:8080/mjpg/video.mjpg`,
  `http://${CAMERA_IP}:8080/video`,
  `http://${CAMERA_IP}:8080/mjpg/video.mjpg`,
  
  // Hikvision
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/ISAPI/Streaming/channels/101/picture`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/onvif/snapshot`,
  
  // Dahua
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/cgi-bin/snapshot.cgi`,
  `http://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}/cgi-bin/video.cgi`,
];

async function testURL(url) {
  try {
    const response = await axios({
      method: 'get',
      url: url,
      timeout: 3000,
      validateStatus: () => true
    });
    
    const status = response.status;
    const contentType = response.headers['content-type'] || '';
    
    if (status === 200 && (contentType.includes('video') || contentType.includes('image') || contentType.includes('multipart'))) {
      console.log(`✅ SUCESSO: ${url}`);
      console.log(`   Status: ${status}`);
      console.log(`   Content-Type: ${contentType}`);
      return url;
    } else if (status === 401) {
      console.log(`🔒 AUTENTICAÇÃO NECESSÁRIA: ${url}`);
      return url;
    } else {
      console.log(`❌ FALHA (${status}): ${url} - ${contentType}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ ERRO: ${url} - ${error.message}`);
    return null;
  }
}

async function discover() {
  console.log(`\n🔍 Descobrindo URLs da câmera ${CAMERA_IP}...\n`);
  
  for (const url of URLS) {
    const result = await testURL(url);
    if (result) {
      console.log(`\n🎯 URL FUNCIONAL ENCONTRADA: ${result}\n`);
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n🏁 Scan completo!\n');
}

discover();
