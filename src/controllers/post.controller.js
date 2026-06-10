const postModel = require('../models/post.model');
const generateCaption = require('../services/ai.service');
const uploadFile = require('../services/storage.service');
const { v4: uuidv4 } = require('uuid');

const createPostController = async (req, res) => {
  try {
    const file = req.file;

    console.log('File received:', file);

    const base64Image = Buffer.from(file.buffer).toString('base64');

    const caption = await generateCaption(base64Image);
    const result = await uploadFile(file.buffer, `${uuidv4()}`);
    console.log('req.user =', req.user);
    console.log(caption);

    const post = await postModel.create({
      caption: caption,
      image: result.url,
      user: req.user._id,
    });

    return res.status(201).json({
      message: 'Post created successfully...',
      post,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { createPostController };
