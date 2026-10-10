import ELK from 'elkjs/lib/elk-api.js';
import { Worker } from 'elk-layered';

export function createLayoutEngine() {
  return new ELK({ algorithms: ['layered'], workerFactory: (url) => new Worker(url) });
}
