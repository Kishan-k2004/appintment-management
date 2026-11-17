const { MongoMemoryServer } = require('mongodb-memory-server');
(async () => {
  const m = await MongoMemoryServer.create({ instance: { port: 27999 } });
  console.log('READY', m.getUri());
  setInterval(() => {}, 1 << 30);
})();
