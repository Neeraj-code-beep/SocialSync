require('dotenv').config();
const app = require('./src/app');
const port = 4000;
const connectToDB = require('./src/db/db');

connectToDB();
app.listen(port, () => {
  console.log(`Server is running on ${port}`);
});
