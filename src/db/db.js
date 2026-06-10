const mongoose = require('mongoose');

const connectToDB = () => {
  mongoose
    .connect(process.env.MONGODB_URL)
    .then(() => {
      console.log('Server is connected to DB');
    })
    .catch((error) => {
      console.log('Server is not connected to the DB', error);
    });
};

module.exports = connectToDB;
