const userModel = require('../models/user.models');
const jwt = require('jsonwebtoken');

async function authMiddleware(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

  if (!token) {
    return res.status(401).json({
      message: 'Unauthorized access',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');

    console.log('Decoded Token:', decoded);

    const user = await userModel.findOne({
      _id: decoded.user,
    });

    console.log('User Found:', user);

    req.user = user;

    next();
  } catch (error) {
    console.log(error);

    return res.status(401).json({
      message: 'Invalid token',
    });
  }
}
module.exports = authMiddleware;
