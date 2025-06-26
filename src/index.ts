import { createBot } from './telegram/bot.js';

const bot = createBot();
bot.launch();
console.log('Schedulink container started.');
