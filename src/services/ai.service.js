const { GoogleGenAI } = require('@google/genai');
const { config } = require('../config/env.config');

let aiClient = null;

function getAiClient() {
  if (!aiClient) {
    if (!config.geminiApiKey) {
      throw new Error('Gemini API Key is not configured.');
    }
    aiClient = new GoogleGenAI({
      apiKey: config.geminiApiKey,
    });
  }
  return aiClient;
}

/**
 * Generates an engaging social media caption for an image using Gemini Vision model
 * @param {Buffer|string} imageInput - Buffer or Base64 string of the image
 * @param {string} mimeType - The MIME type of the uploaded image (e.g. 'image/jpeg', 'image/png', 'image/webp')
 * @returns {Promise<string>} Generated caption text
 */
async function generateCaption(imageInput, mimeType = 'image/jpeg') {
  const ai = getAiClient();

  const base64Data = Buffer.isBuffer(imageInput)
    ? imageInput.toString('base64')
    : imageInput;

  // Validate normalized MIME type
  const validMimeType = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mimeType)
    ? mimeType === 'image/jpg' ? 'image/jpeg' : mimeType
    : 'image/jpeg';

  const contents = [
    {
      inlineData: {
        mimeType: validMimeType,
        data: base64Data,
      },
    },
    { text: 'Caption this image for social media.' },
  ];

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: contents,
      config: {
        systemInstruction: `You are an expert social media copywriter.
Generate a single engaging, natural caption for the image.
Keep the caption concise, punchy, and include relevant hashtags and tasteful emojis.`,
      },
    });

    return response.text?.trim() || 'No caption generated';
  } catch (error) {
    throw new Error(`AI Caption Generation failed: ${error.message}`);
  }
}

module.exports = generateCaption;
