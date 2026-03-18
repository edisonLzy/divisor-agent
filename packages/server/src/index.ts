import { createApp } from './app.js';
import { getPort } from './config/env.js';

const port = getPort();
const app = createApp();

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
