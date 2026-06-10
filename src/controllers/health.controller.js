const healthChecker = async (req, res) => {
  return res.status(201).json({
    message: 'Api is working fine',
  });
};

module.exports = healthChecker;
