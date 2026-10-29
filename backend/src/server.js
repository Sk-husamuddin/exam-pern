const app = require('./app');
const config = require('./config');

const PORT = config.PORT;

app.listen(PORT, () => {
  console.log(`Exam PERN backend running on http://localhost:${PORT}`);
  console.log(`BASE_URL: ${config.BASE_URL}`);
});
