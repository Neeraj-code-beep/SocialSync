const ImageKit = require('imagekit');
const { config } = require('../config/env.config');

let imagekitInstance = null;

function getImageKit() {
  if (!imagekitInstance) {
    imagekitInstance = new ImageKit({
      publicKey: config.imageKit.publicKey,
      privateKey: config.imageKit.privateKey,
      urlEndpoint: config.imageKit.urlEndpoint,
    });
  }
  return imagekitInstance;
}

/**
 * Uploads a file buffer to ImageKit CDN storage
 * @param {Buffer} fileBuffer - The binary file buffer
 * @param {string} filename - The destination filename
 * @returns {Promise<object>} ImageKit upload response object containing url, fileId, etc.
 */
async function uploadFile(fileBuffer, filename) {
  try {
    const ik = getImageKit();
    const response = await ik.upload({
      file: fileBuffer,
      fileName: filename,
      folder: 'SocialSync',
    });

    return response;
  } catch (error) {
    throw new Error(`Media upload to storage failed: ${error.message}`);
  }
}

module.exports = uploadFile;
